#!/usr/bin/env node
// Usage: node bench/setup.mjs <task> <dest>
// Copies a task fixture into <dest> as a fresh Git repository. Hidden tests and
// expectations stay in bench/tasks/<task> and are never copied.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const [task, dest] = process.argv.slice(2);
if (!task || !dest) throw new Error('usage: setup.mjs <task> <dest>');
const dir = resolve(import.meta.dirname, 'tasks', task);
const target = resolve(dest);
if (existsSync(target) && readdirSync(target).length) throw new Error(`${target} is not empty`);
mkdirSync(target, { recursive: true });
const git = (...args) =>
  execFileSync('git', ['-c', 'user.email=bench@example.com', '-c', 'user.name=bench', ...args], {
    cwd: target,
    stdio: 'ignore',
  });

git('init', '-q', '-b', 'main');
if (task === 'ship-review') {
  cpSync(join(dir, 'base'), target, { recursive: true });
  git('add', '.');
  git('commit', '-qm', 'Initial accounts service');
  git('checkout', '-qb', 'feature/user-search');
  cpSync(join(dir, 'change'), target, { recursive: true });
  git('add', '.');
  git('commit', '-qm', 'Add user search and simplify getUser');
} else {
  cpSync(join(dir, 'repo'), target, { recursive: true });
  git('add', '.');
  git('commit', '-qm', 'Initial commit');
}
console.log(target);
