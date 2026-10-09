import { load, save } from './store.js';

export function addTask(title) {
  if (!title || !title.trim()) throw new Error('title is required');
  const data = load();
  const task = { id: data.nextId++, title: title.trim(), done: false };
  data.tasks.push(task);
  save(data);
  return task;
}

export function listTasks() {
  return load().tasks;
}

export function completeTask(id) {
  const data = load();
  const task = data.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`no task #${id}`);
  task.done = true;
  save(data);
  return task;
}

export function formatTask(task) {
  return `#${task.id} [${task.done ? 'x' : ' '}] ${task.title}`;
}
