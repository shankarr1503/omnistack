export type Mode = 'fast' | 'team' | 'council';
export interface Classification {
  intent: string;
  category: string;
  mode: Mode;
  risk: 'low' | 'medium' | 'high';
  complexity: 'small' | 'normal' | 'complex';
  specialists: string[];
  verification: string[];
}
export function classify(request: string, workflow = 'run', explicit?: Mode): Classification {
  const high =
    /auth|security|cryptograph|distributed|concurren|migration|database redesign|architecture|multi.tenant|payment/i.test(
      request,
    ) || ['security', 'architect', 'council'].includes(workflow);
  const small =
    /\b(typo|format|css|rename|documentation|readme)\b/i.test(request) && request.length < 300;
  return {
    intent: workflow,
    category: high ? 'architecture-security' : small ? 'maintenance' : 'engineering',
    mode: explicit ?? (high ? 'council' : small ? 'fast' : 'team'),
    risk: high ? 'high' : small ? 'low' : 'medium',
    complexity: high ? 'complex' : small ? 'small' : 'normal',
    specialists: high
      ? ['planner', 'architect', 'security', 'coder', 'reviewer']
      : small
        ? ['coder']
        : ['planner', 'coder', 'reviewer'],
    verification: small
      ? ['diff', 'relevant tests']
      : ['build', 'typecheck', 'test', 'lint', 'review'],
  };
}
