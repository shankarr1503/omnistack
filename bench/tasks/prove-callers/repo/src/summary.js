import { formatPrice } from './money.js';

/** Dashboard tiles show whole dollars. */
export function revenueTile(amount) {
  return `Revenue: ${formatPrice(Math.round(amount), 0)}`;
}
