import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpProvider } from '../src/providers/http.js';
import { ConfigSchema, ProviderConfigSchema } from '../src/config/schema.js';
import { ModelRouter } from '../src/router/model-router.js';
import { orchestrate } from '../src/core/orchestrator.js';
import { execute } from '../src/utils/process.js';
import { OmniError } from '../src/utils/errors.js';
import type { Model, ProviderHealth } from '../src/providers/types.js';

async function temporary(): Promise<string> {
  return realpath(await mkdtemp(join(tmpdir(), 'omni-readiness-')));
}
/** A loopback port with nothing listening, so connecting to it is refused. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
async function rejection(promise: Promise<unknown>): Promise<OmniError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof OmniError, `expected a typed error, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the promise to reject');
}
function thrown(action: () => unknown): OmniError {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof OmniError, `expected a typed error, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the call to throw');
}
function failingTransport(error: unknown): typeof fetch {
  return async () => {
    throw error;
  };
}
function coded(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}
const remote = ProviderConfigSchema.parse({
  id: 'remote',
  type: 'openai-compatible',
  baseUrl: 'https://api.example.invalid/v1',
});
const request = { model: 'm', messages: [], maxTokens: 50 };

test('F15: a refused connection names the network cause, not only the error class', async () => {
  const port = await closedPort();
  const provider = new HttpProvider(
    ProviderConfigSchema.parse({
      id: 'local',
      type: 'openai-compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      local: true,
    }),
    5000,
    {},
  );
  const health = await provider.healthCheck();
  assert.equal(health.healthy, false);
  assert.match(health.message, /^Connection failed for local: /);
  assert.match(health.message, new RegExp(`ECONNREFUSED 127\\.0\\.0\\.1:${port}`));
  const error = await rejection(provider.generate(request));
  assert.equal(error.code, 'PROVIDER');
  assert.equal(error.retryable, true);
  assert.match(error.message, new RegExp(`ECONNREFUSED 127\\.0\\.0\\.1:${port}`));
});

test('F15: aggregate, TLS and DNS connection causes are described and redacted', async () => {
  const aggregate = Object.assign(
    new AggregateError(
      [
        coded('connect ECONNREFUSED ::1:11434', 'ECONNREFUSED'),
        coded('connect ECONNREFUSED 127.0.0.1:11434', 'ECONNREFUSED'),
      ],
      '',
    ),
    { code: 'ECONNREFUSED' },
  );
  const cases: [unknown, RegExp[]][] = [
    [new TypeError('fetch failed', { cause: aggregate }), [/ECONNREFUSED 127\.0\.0\.1:11434/]],
    [
      new TypeError('fetch failed', {
        cause: coded('unable to verify the first certificate', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'),
      }),
      [/UNABLE_TO_VERIFY_LEAF_SIGNATURE/, /unable to verify the first certificate/],
    ],
    [
      new TypeError('fetch failed', {
        cause: coded('getaddrinfo ENOTFOUND api.example.invalid', 'ENOTFOUND'),
      }),
      [/ENOTFOUND api\.example\.invalid/],
    ],
    ['not an error', [/^Connection failed for remote: network error$/]],
  ];
  for (const [failure, patterns] of cases) {
    const error = await rejection(
      new HttpProvider(remote, 1000, {}, failingTransport(failure)).generate(request),
    );
    assert.equal(error.code, 'PROVIDER');
    assert.equal(error.retryable, true);
    for (const pattern of patterns) assert.match(error.message, pattern);
  }
  const leaky = await rejection(
    new HttpProvider(
      remote,
      1000,
      {},
      failingTransport(
        new TypeError('fetch failed', { cause: new Error('proxy said api_key=abcdef123456') }),
      ),
    ).generate(request),
  );
  assert.ok(!leaky.message.includes('abcdef123456'), leaky.message);
});

const capable = (provider: string, extra: Partial<Model> = {}): Model => ({
  id: 'm',
  provider,
  local: true,
  capabilities: ['coding', 'toolCalling'],
  ...extra,
});
const checkedAt = new Date(0).toISOString();

test('F15: models excluded only for health get a provider error, not capability advice', () => {
  const config = ConfigSchema.parse({});
  const models = [
    capable('local', { healthy: false }),
    capable('openai', { healthy: false, local: false }),
  ];
  const bare = thrown(() => new ModelRouter(config).select(models, ['coding'], []));
  assert.equal(bare.code, 'PROVIDER');
  assert.match(bare.message, /^No eligible models/);
  assert.doesNotMatch(bare.message, /Configure model capabilities/);
  assert.match(bare.message, /2 models? .*unhealthy providers?/);
  assert.match(bare.message, /local/);
  assert.match(bare.message, /openai/);
  assert.match(bare.message, /omni providers health/);
  const health: ProviderHealth[] = [
    {
      provider: 'local',
      healthy: false,
      message: 'Connection failed for local: fetch failed (connect ECONNREFUSED 127.0.0.1:11434)',
      checkedAt,
    },
    { provider: 'openai', healthy: false, message: 'Operation timed out', checkedAt },
  ];
  const detailed = thrown(() => new ModelRouter(config, {}, health).select(models, ['coding'], []));
  assert.match(detailed.message, /ECONNREFUSED 127\.0\.0\.1:11434/);
  assert.match(detailed.message, /openai: Operation timed out/);
});

test('F15: capability and privacy exclusions name the models and the reason', () => {
  const open = ConfigSchema.parse({});
  const capability = thrown(() =>
    new ModelRouter(open).select([capable('local', { capabilities: ['vision'] })], ['coding'], []),
  );
  assert.equal(capability.code, 'CONFIGURATION');
  assert.match(capability.message, /^No eligible models/);
  assert.match(capability.message, /local\/m/);
  assert.match(capability.message, /capabilit/);
  assert.match(capability.message, /coding/);
  assert.doesNotMatch(capability.message, /unhealthy|privacy/);

  const closed = ConfigSchema.parse({ privacy: { cloudAllowed: false } });
  const cloud = capable('cloud', { local: false });
  const privacy = thrown(() => new ModelRouter(closed).select([cloud], ['coding'], []));
  assert.equal(privacy.code, 'CONFIGURATION');
  assert.match(privacy.message, /privacy/);
  assert.match(privacy.message, /cloud\/m/);
  assert.doesNotMatch(privacy.message, /unhealthy|capabilit/);

  // A model that would be eligible if its provider were healthy makes this a provider problem.
  const mixed = thrown(() =>
    new ModelRouter(closed).select([cloud, capable('local', { healthy: false })], ['coding'], []),
  );
  assert.equal(mixed.code, 'PROVIDER');
  assert.match(mixed.message, /privacy.*cloud\/m/);
  assert.match(mixed.message, /unhealthy.*local/);

  const none = thrown(() => new ModelRouter(open).select([], ['coding'], []));
  assert.equal(none.code, 'CONFIGURATION');
  assert.match(none.message, /No models are configured or discovered/);

  const many = thrown(() =>
    new ModelRouter(open).select(
      Array.from({ length: 30 }, (_, i) => capable('local', { id: `m${i}`, capabilities: [] })),
      ['coding'],
      [],
    ),
  );
  assert.match(many.message, /and 25 more/);
  assert.ok(many.message.length < 400, many.message);
});

test('F15: review against a stopped local provider reports provider health', async () => {
  const port = await closedPort(),
    root = await temporary();
  await execute('git', ['init', '-b', 'main'], root);
  await writeFile(join(root, 'source.ts'), 'export const x = 1;\n');
  const config = ConfigSchema.parse({
    providers: [
      {
        id: 'local',
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${port}/v1`,
        local: true,
        models: [{ id: 'llama3.1', capabilities: ['coding', 'toolCalling'] }],
      },
    ],
  });
  const error = await rejection(
    orchestrate(config, { root, home: await temporary(), request: 'Review', workflow: 'review' }),
  );
  assert.doesNotMatch(error.message, /Configure model capabilities/);
  assert.match(error.message, /unhealthy provider/);
  assert.match(error.message, /local/);
  assert.match(error.message, /omni providers health/);
});

function rejecting(status: number, body: unknown): typeof fetch {
  return async () =>
    typeof body === 'string' ? new Response(body, { status }) : Response.json(body, { status });
}

test('F16: provider error messages from JSON bodies explain 4xx and 5xx rejections', async () => {
  const unsupported =
    "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.";
  const cases: [number, unknown, string, boolean][] = [
    [
      400,
      {
        error: {
          message: unsupported,
          type: 'invalid_request_error',
          param: 'max_tokens',
          code: 'unsupported_parameter',
        },
      },
      unsupported,
      false,
    ],
    [
      400,
      {
        type: 'error',
        error: { type: 'invalid_request_error', message: 'max_tokens: Field required' },
      },
      'max_tokens: Field required',
      false,
    ],
    [
      400,
      { object: 'error', message: 'This model does not support tools', code: 400 },
      'This model does not support tools',
      false,
    ],
    [422, { detail: 'messages: field required' }, 'messages: field required', false],
    [503, { error: 'model is loading' }, 'model is loading', true],
  ];
  for (const [status, body, expected, retryable] of cases) {
    const error = await rejection(
      new HttpProvider(remote, 1000, {}, rejecting(status, body)).generate(request),
    );
    assert.equal(error.code, 'PROVIDER');
    assert.equal(error.retryable, retryable);
    assert.equal(error.message, `Provider remote returned HTTP ${status}: ${expected}`);
  }
});

test('F16: provider error details are redacted, single-line and bounded', async () => {
  const secret = 'sk-abcdefghijklmnop1234';
  const error = await rejection(
    new HttpProvider(
      remote,
      1000,
      {},
      rejecting(400, {
        error: { message: `Incorrect key ${secret}\n\u001b[31mbad${'x'.repeat(2000)}` },
      }),
    ).generate(request),
  );
  assert.match(error.message, /^Provider remote returned HTTP 400: Incorrect key \[REDACTED\]/);
  assert.ok(!error.message.includes(secret));
  assert.ok(!/[\n\u001b]/.test(error.message), error.message);
  assert.ok(error.message.length <= 360, `length ${error.message.length}`);
  // Raw text and HTML bodies (proxies, load balancers) are still not echoed.
  for (const body of ['<html>secret-proxy-page</html>', '{"unrelated":"secret-json"}']) {
    const opaque = await rejection(
      new HttpProvider(remote, 1000, {}, rejecting(502, body)).generate(request),
    );
    assert.equal(opaque.message, 'Provider remote returned HTTP 502');
  }
});

test('F16: OpenAI endpoints receive max_completion_tokens; other endpoints keep max_tokens', async () => {
  const ok = {
    choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1, completion_tokens: 1 },
  };
  const anthropicOk = {
    content: [{ type: 'text', text: 'ok' }],
    usage: { input_tokens: 1, output_tokens: 1 },
    stop_reason: 'end_turn',
  };
  const cases: [Record<string, unknown>, string, string][] = [
    [
      { type: 'openai-compatible', baseUrl: 'https://api.openai.com/v1' },
      'max_completion_tokens',
      'max_tokens',
    ],
    [
      { type: 'openai-compatible', baseUrl: 'https://openrouter.ai/api/v1' },
      'max_tokens',
      'max_completion_tokens',
    ],
    [
      { type: 'openai-compatible', baseUrl: 'http://localhost:11434/v1', local: true },
      'max_tokens',
      'max_completion_tokens',
    ],
    [
      { type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
      'max_tokens',
      'max_completion_tokens',
    ],
  ];
  for (const [settings, sent, absent] of cases) {
    let body: Record<string, unknown> = {};
    const provider = new HttpProvider(
      ProviderConfigSchema.parse({ id: 'p', ...settings }),
      1000,
      {},
      async (_url, init) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json(settings.type === 'anthropic' ? anthropicOk : ok);
      },
    );
    assert.equal((await provider.generate(request)).content, 'ok');
    assert.equal(body[sent], 50, `${String(settings.baseUrl)} should send ${sent}`);
    assert.ok(!(absent in body), `${String(settings.baseUrl)} should not send ${absent}`);
  }
});
