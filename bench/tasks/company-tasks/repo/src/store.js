import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = () => process.env.TASKS_FILE || 'tasks.json';

export function load() {
  if (!existsSync(file())) return { nextId: 1, tasks: [] };
  return JSON.parse(readFileSync(file(), 'utf8'));
}

export function save(data) {
  writeFileSync(file(), JSON.stringify(data, null, 2));
}
