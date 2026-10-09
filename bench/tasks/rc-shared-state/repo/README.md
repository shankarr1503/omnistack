# shop-dashboard

`orders` is an array of `{ customer, amount, date }` in chronological order (oldest first).

- `revenueReport(orders)` → `{ total, largest, count }`
- `topCustomers(orders, n)` → the `n` customers with the highest total spend; ties go to whoever ordered first.
- `firstOrder(orders)` → the oldest order.
- `dashboard(orders)` combines all three.
