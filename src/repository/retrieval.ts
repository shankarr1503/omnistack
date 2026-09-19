import { readFile, stat } from 'node:fs/promises';
import { scopedPath } from './boundary.js';
import { redact } from '../utils/io.js';
import type { Repository } from './scanner.js';
export interface ContextFile {
  path: string;
  content: string;
}
export async function retrieve(
  repo: Repository,
  request: string,
  maxChars = 40000,
): Promise<ContextFile[]> {
  const words = request.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) ?? [];
  const ordered = [...repo.files]
    .filter((p) => !/lock\b|\.(png|jpg|svg|pdf|zip|map|snap)$/.test(p))
    .sort((a, b) => score(b) - score(a) || a.localeCompare(b));
  function score(path: string): number {
    return (
      words.filter((w) => path.toLowerCase().includes(w)).length * 10 +
      (repo.instructions.includes(path) ? 8 : 0) +
      (/^(README.md|package.json|Cargo.toml|pyproject.toml)$/.test(path) ? 5 : 0)
    );
  }
  const result: ContextFile[] = [];
  let remaining = maxChars;
  for (const path of ordered.slice(0, 100)) {
    if (remaining < 100) break;
    try {
      const safe = await scopedPath(repo.root, path);
      const info = await stat(safe);
      if (!info.isFile() || info.size > 256000) continue;
      const text = await readFile(safe, 'utf8');
      if (text.includes('\0')) continue;
      const content = redact(text.slice(0, Math.min(remaining, 12000)));
      result.push({ path, content });
      remaining -= content.length;
    } catch {
      /* Skip unreadable or out-of-scope entries, never follow unsafe paths. */
    }
  }
  return result;
}
