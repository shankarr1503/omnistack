import { formatPrice } from './money.js';

export function renderReceipt({ lines, tip }) {
  const rows = lines.map((line) => `${line.name.padEnd(12)}${formatPrice(line.price)}`);
  const total = lines.reduce((sum, line) => sum + line.price, 0) + tip;
  rows.push(`${'Tip'.padEnd(12)}${formatPrice(tip, 0)}`);
  rows.push(`${'Total'.padEnd(12)}${formatPrice(total)}`);
  return rows.join('\n');
}
