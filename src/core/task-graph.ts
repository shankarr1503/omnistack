export interface Task {
  id: string;
  title: string;
  dependencies: string[];
  targetFiles: string[];
  validation: string[];
  status?: 'pending' | 'running' | 'completed' | 'failed';
}
export function validateGraph(tasks: Task[]): void {
  const map = new Map(tasks.map((t) => [t.id, t]));
  if (map.size !== tasks.length) throw new Error('Duplicate task IDs');
  const visiting = new Set<string>(),
    visited = new Set<string>();
  function visit(id: string): void {
    if (visiting.has(id)) throw new Error('Task dependency cycle');
    if (visited.has(id)) return;
    const task = map.get(id);
    if (!task) throw new Error(`Unknown dependency: ${id}`);
    visiting.add(id);
    for (const dep of task.dependencies) visit(dep);
    visiting.delete(id);
    visited.add(id);
  }
  for (const task of tasks) visit(task.id);
}
export async function runGraph<T>(
  tasks: Task[],
  worker: (task: Task) => Promise<T>,
  concurrency = 1,
  signal?: AbortSignal,
): Promise<Map<string, T>> {
  validateGraph(tasks);
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Invalid concurrency');
  const results = new Map<string, T>(),
    pending = new Map(tasks.map((t) => [t.id, t]));
  while (pending.size) {
    signal?.throwIfAborted();
    const ready = [...pending.values()]
      .filter((t) => t.dependencies.every((d) => results.has(d)))
      .slice(0, concurrency);
    const settled = await Promise.allSettled(
      ready.map(async (task) => {
        task.status = 'running';
        try {
          const result = await worker(task);
          task.status = 'completed';
          return { task, result };
        } catch (error) {
          task.status = 'failed';
          throw error;
        }
      }),
    );
    for (const item of settled)
      if (item.status === 'fulfilled') {
        results.set(item.value.task.id, item.value.result);
        pending.delete(item.value.task.id);
      }
    const failed = settled.find((s) => s.status === 'rejected');
    if (failed?.status === 'rejected') throw failed.reason;
  }
  return results;
}
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (concurrency < 1) throw new Error('Concurrency must be positive');
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let index = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (index < items.length) {
        const current = index++;
        try {
          results[current] = { status: 'fulfilled', value: await worker(items[current]!, current) };
        } catch (reason) {
          results[current] = { status: 'rejected', reason };
        }
      }
    }),
  );
  return results;
}
