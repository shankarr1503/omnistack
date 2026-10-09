export function topCustomers(orders, n) {
  const totals = new Map();
  for (const order of orders)
    totals.set(order.customer, (totals.get(order.customer) ?? 0) + order.amount);
  return [...totals]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([customer]) => customer);
}

export function firstOrder(orders) {
  return orders[0] ?? null;
}
