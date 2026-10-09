#!/usr/bin/env node
import { addTask, completeTask, formatTask, listTasks } from './tasks.js';

const [command, ...args] = process.argv.slice(2);

try {
  switch (command) {
    case 'add': {
      const task = addTask(args.join(' '));
      console.log(`Added #${task.id}`);
      break;
    }
    case 'list':
      for (const task of listTasks()) console.log(formatTask(task));
      break;
    case 'done': {
      const task = completeTask(Number(args[0]));
      console.log(`Completed #${task.id}`);
      break;
    }
    default:
      console.log('usage: tasks <add|list|done> [args]');
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exitCode = 1;
}
