import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute } from '../src/utils/process.js';
const entry = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url));
const loader = import.meta.resolve('tsx');
test('CLI reviews a foreign repository over real mocked HTTP without initialization', async () => {
  const home = await mkdtemp(join(tmpdir(), 'omni-cli-home-')),
    root = await mkdtemp(join(tmpdir(), 'omni-cli-repo-'));
  await execute('git', ['init'], root);
  await writeFile(join(root, 'index.ts'), 'export const x = 1;');
  let calls = 0;
  const server = createServer((request, response) => {
    if (request.url === '/v1/models') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ data: [{ id: 'fixture-model' }] }));
      return;
    }
    let body = '';
    request.on('data', (chunk) => {
      body += String(chunk);
    });
    request.on('end', () => {
      calls++;
      const data = JSON.parse(body) as { model: string };
      assert.equal(data.model, 'fixture-model');
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({ summary: 'Reviewed source fixture', findings: [] }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await writeFile(
      join(home, 'config.yaml'),
      'providers:\n  - id: fixture\n    type: openai-compatible\n    local: true\n    baseUrl: http://127.0.0.1:' +
        address.port +
        '/v1\n    models:\n      - id: fixture-model\n        capabilities: [coding]\n',
    );
    const result = await execute(
      process.execPath,
      ['--import', loader, entry, 'review', root, '--json'],
      root,
      { env: { ...process.env, OMNI_HOME: home, OMNI_DEPTH: '0' } },
    );
    assert.equal(result.code, 0, result.stderr);
    const output = JSON.parse(result.stdout) as { review: { summary: string } };
    assert.equal(output.review.summary, 'Reviewed source fixture');
    assert.equal(calls, 1);
    await assert.rejects(access(join(root, '.omni')));
    const doctor = await execute(
      process.execPath,
      ['--import', loader, entry, 'doctor', '--json'],
      root,
      { env: { ...process.env, OMNI_HOME: home } },
    );
    assert.equal(doctor.code, 0, doctor.stderr);
    assert.equal(
      (JSON.parse(doctor.stdout) as { providers: { healthy: boolean }[] }).providers[0]?.healthy,
      true,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
test('CLI rejects unsupported flags with a nonzero exit code', async () => {
  const result = await execute(
    process.execPath,
    ['--import', loader, entry, 'review', '--mode', 'hundreds'],
    process.cwd(),
  );
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Allowed choices/);
});
