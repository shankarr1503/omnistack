import { revenueReport } from './orders.js';
import { topCustomers, firstOrder } from './customers.js';

export function dashboard(orders) {
  const report = revenueReport(orders);
  return { ...report, top: topCustomers(orders, 2), since: firstOrder(orders)?.date ?? null };
}
