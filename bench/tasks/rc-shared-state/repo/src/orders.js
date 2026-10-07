export function revenueReport(orders) {
  const sorted = orders.sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((sum, order) => sum + order.amount, 0);
  return { total, largest: sorted[0] ?? null, count: sorted.length };
}
