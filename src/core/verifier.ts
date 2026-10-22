import type { ToolController } from '../tools/controller.js';
import { PermissionDeniedError } from '../utils/errors.js';
export interface VerificationResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  code?: number;
  output: string;
}
export async function verify(
  controller: ToolController,
  checks = controller.repo.commands,
): Promise<VerificationResult[]> {
  if (!checks.length)
    return [
      {
        name: 'verification',
        status: 'skipped',
        output: 'No verification commands detected or configured',
      },
    ];
  const results: VerificationResult[] = [];
  for (const check of checks) {
    if (!controller.grants.commands) {
      results.push({
        name: check.name,
        status: 'skipped',
        output: 'Repository command execution was not authorized',
      });
      continue;
    }
    try {
      const result = await controller.command(check.command, check.args);
      results.push({
        name: check.name,
        status: result.code === 0 ? 'passed' : 'failed',
        code: result.code,
        output: (result.stdout + result.stderr).slice(-16000),
      });
    } catch (error) {
      // A cancelled run has no verification result; report the cancellation, not a failed check.
      if (controller.signal?.aborted) throw controller.signal.reason;
      // A check that never started says nothing about the code, so it must not read as a failure.
      if (error instanceof PermissionDeniedError)
        results.push({ name: check.name, status: 'skipped', output: 'Not run: ' + error.message });
      else if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        results.push({
          name: check.name,
          status: 'skipped',
          output: `Command not available: ${check.command} was not found, so this check did not run. Install it or configure verification to use an available command.`,
        });
      else
        results.push({
          name: check.name,
          status: 'failed',
          output: error instanceof Error ? error.message : 'Command failed',
        });
    }
  }
  return results;
}
