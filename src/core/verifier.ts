import type { ToolController } from '../tools/controller.js';
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
      results.push({
        name: check.name,
        status: 'failed',
        output: error instanceof Error ? error.message : 'Command failed',
      });
    }
  }
  return results;
}
