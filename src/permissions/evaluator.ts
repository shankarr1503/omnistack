import { PermissionDeniedError } from '../utils/errors.js';
export type Operation = 'read' | 'write' | 'delete' | 'command' | 'destructive';
export interface Grants {
  write: boolean;
  commands: boolean;
  approvalMode: 'strict' | 'balanced' | 'autonomous-safe';
}
export function authorize(operation: Operation, grants: Grants): void {
  if (operation === 'read') return;
  if (operation === 'destructive' || operation === 'delete')
    throw new PermissionDeniedError('This operation requires a separate explicit human action');
  if (operation === 'write' && grants.write) return;
  if (operation === 'command' && grants.commands) return;
  throw new PermissionDeniedError("Operation '" + operation + "' was not authorized");
}
export function safeCommand(command: string, args: string[]): boolean {
  const joined = [command, ...args].join(' ');
  if (/[\r\n\0;&|\x60<>]/.test(joined) || /\$\(/.test(joined)) return false;
  if (command === 'git') return args.length === 1 && ['status', 'diff', 'log'].includes(args[0]!);
  if (['npm', 'pnpm', 'yarn'].includes(command))
    return (
      args.length === 2 &&
      args[0] === 'run' &&
      ['test', 'build', 'typecheck', 'lint', 'format:check'].includes(args[1]!)
    );
  if (command === 'cargo')
    return args.length === 1 && ['test', 'check', 'clippy'].includes(args[0]!);
  if (command === 'python') return args.length === 2 && args[0] === '-m' && args[1] === 'pytest';
  if (command === 'go') return args.length === 2 && args[0] === 'test' && args[1] === './...';
  return false;
}
