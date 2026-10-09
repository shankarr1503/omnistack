/** Formats an amount in dollars, e.g. formatPrice(3.5) === '$3.50'. */
export function formatPrice(amount, decimals = 2) {
  return '$' + amount.toFixed(decimals);
}
