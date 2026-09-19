#!/usr/bin/env node
import { Command, Option } from 'commander';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { identity } from '../identity.js';
import { omniHome, loadConfig } from '../config/loader.js';
import { setup, initProject, doctor, uninstallSkills } from './lifecycle.js';
import { hostAdapters, invocationContext, type HostId } from '../hosts/adapter.js';
import { loadSkills, installSkills } from '../skills/compiler.js';
import { ModelRegistry } from '../registry/model-registry.js';
import { safeJson } from '../utils/io.js';
import { orchestrate } from '../core/orchestrator.js';
import { scanRepository } from '../repository/scanner.js';
import type { Mode } from '../router/classifier.js';
import { Ledger } from '../telemetry/ledger.js';
import { updateRuntime } from './update.js';
import { recoverCheckpoint } from '../tools/recovery.js';
const program = new Command()
  .name(identity.command)
  .version(identity.version)
  .description('Universal multi-model engineering runtime')
  .option('--json', 'Emit machine-readable JSON');
const output = (value: unknown): void => {
  console.log(safeJson(value));
};
program
  .command('setup')
  .description('Install global skills and create user configuration')
  .action(async () => output(await setup(omniHome())));
program
  .command('init')
  .description('Optionally create project memory; preserve existing files')
  .argument('[repository]', 'Target repository', '.')
  .action(async (repo: string) => output(await initProject(repo)));
program
  .command('doctor')
  .description('Inspect runtime, host registrations and provider connectivity')
  .action(async () => output(await doctor(omniHome())));
program
  .command('uninstall')
  .description('Remove owned host wrappers; preserve user data and source checkout')
  .action(async () => output(await uninstallSkills(omniHome(), hostAdapters())));
program
  .command('dev-link')
  .description('Register global skills pointing at this checkout')
  .action(async () => output(await installSkills(omniHome(), hostAdapters())));
program
  .command('dev-unlink')
  .description('Remove owned development host registrations')
  .action(async () => output(await uninstallSkills(omniHome(), hostAdapters())));
program
  .command('config')
  .description('Show effective configuration without credentials')
  .option('--repo <path>', 'Include this repository configuration')
  .action(async (options: { repo?: string }) =>
    output(
      await loadConfig({
        root: options.repo ? (await scanRepository(options.repo)).root : undefined,
      }),
    ),
  );
const models = program
  .command('models')
  .description('List configured models')
  .action(async () => output([...ModelRegistry.fromConfig(await loadConfig()).models.values()]));
models
  .command('discover')
  .description('Discover provider models with TTL cache and stale fallback')
  .option('--refresh', 'Ignore cache TTL')
  .action(async (options: { refresh?: boolean }) =>
    output(
      await ModelRegistry.fromConfig(await loadConfig()).discover(omniHome(), options.refresh),
    ),
  );
const providers = program
  .command('providers')
  .description('List configured provider endpoints')
  .action(async () => output((await loadConfig()).providers));
providers
  .command('health')
  .description('Check configured provider catalogs')
  .action(async () => output(await ModelRegistry.fromConfig(await loadConfig()).health()));
const skill = program.command('skill').description('Inspect and run canonical workflows');
skill
  .command('list')
  .description('List canonical skills')
  .action(async () =>
    output((await loadSkills()).map(({ name, description }) => ({ name, description }))),
  );
interface WorkflowOptions {
  repo?: string;
  mode?: Mode;
  policy?: string;
  allowWrite?: boolean;
  allowCommands?: boolean;
  host?: HostId;
}
function workflowOptions(command: Command): Command {
  return command
    .option('--repo <path>', 'Target repository (defaults to current directory)')
    .addOption(new Option('--mode <mode>', 'Execution mode').choices(['fast', 'team', 'council']))
    .addOption(
      new Option('--policy <policy>', 'Routing policy').choices([
        'cheap',
        'balanced',
        'quality',
        'local-only',
        'privacy-first',
        'custom',
      ]),
    )
    .addOption(
      new Option('--host <host>', 'Explicit invoking host').choices([
        'claude-code',
        'codex',
        'opencode',
        'standalone',
      ]),
    )
    .option('--allow-write', 'Authorize repository file edits')
    .option('--allow-commands', 'Authorize verification scripts (execute repository code)');
}
async function runWorkflow(
  workflow: string,
  words: string[],
  options: WorkflowOptions,
): Promise<void> {
  invocationContext(process.env, options.host);
  let target = options.repo ?? process.cwd(),
    request = words.join(' ');
  if (
    workflow === 'review' &&
    words.length === 1 &&
    !options.repo &&
    (await stat(words[0]!)
      .then((s) => s.isDirectory())
      .catch(() => false))
  ) {
    target = words[0]!;
    request = '';
  }
  const repo = await scanRepository(resolve(target));
  const config = await loadConfig({
    root: repo.root,
    flags: options.policy ? { routing: { policy: options.policy } } : {},
  });
  const cancellation = new AbortController(),
    cancel = (): void => cancellation.abort(new Error('Cancelled by user'));
  process.once('SIGINT', cancel);
  try {
    const result = await orchestrate(config, {
      root: repo.root,
      home: omniHome(),
      request: request || 'Perform ' + workflow + ' on this repository',
      workflow,
      mode: options.mode,
      allowWrite: options.allowWrite,
      allowCommands: options.allowCommands,
      signal: cancellation.signal,
    });
    output(result);
    if (
      typeof result === 'object' &&
      result &&
      'status' in result &&
      result.status === 'needs-attention'
    )
      process.exitCode = 2;
  } finally {
    process.removeListener('SIGINT', cancel);
  }
}
for (const name of [
  'run',
  'plan',
  'build',
  'architect',
  'review',
  'debug',
  'test',
  'council',
  'security',
  'research',
  'optimize',
  'ship',
]) {
  workflowOptions(
    program
      .command(name)
      .description(name + ' using the shared engineering runtime')
      .argument('[request...]', 'Task description; review also accepts a repository path'),
  ).action(async (words: string[], options: WorkflowOptions) => runWorkflow(name, words, options));
}
workflowOptions(
  skill
    .command('run')
    .description('Execute a canonical skill')
    .argument('<name>', 'Canonical skill name')
    .argument('[request...]', 'Task description'),
).action(async (name: string, words: string[], options: WorkflowOptions) => {
  if (!(await loadSkills()).some((s) => s.name === name)) throw new Error('Unknown skill: ' + name);
  await runWorkflow(name === 'omni' ? 'run' : name.slice(5), words, options);
});
program
  .command('usage')
  .description('Show local usage totals; unknown prices remain unknown')
  .action(async () => output(await new Ledger(omniHome()).usage()));
program
  .command('budget')
  .description('Show configured task/daily budget and council limits')
  .action(async () => output((await loadConfig()).budget));
program
  .command('update')
  .description('Update this installation and regenerate owned wrappers')
  .option('--apply', 'Authorize dependency installation and runtime update')
  .action(async (options: { apply?: boolean }) =>
    output(await updateRuntime(omniHome(), options.apply ?? false)),
  );
program
  .command('recover')
  .description('Preview or restore a local checkpoint; refuse subsequent user changes')
  .argument('<checkpoint>', 'Path to checkpoint JSON')
  .option('--apply', 'Explicitly restore checkpoint preimages')
  .action(async (path: string, options: { apply?: boolean }) =>
    output(await recoverCheckpoint(path, options.apply ?? false)),
  );
program.parseAsync().catch((error: unknown) => {
  console.error(safeJson({ error: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 1;
});
