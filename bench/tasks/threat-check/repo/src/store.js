export const users = [
  { id: 'u1', email: 'ana@example.com', password: 'hunter2', tenant: 't1' },
  { id: 'u2', email: 'bo@example.com', password: 'correct horse', tenant: 't2' },
];
export const invoices = new Map([
  [1, { id: 1, tenant: 't1', amount: 1200, card_last4: '4242' }],
  [2, { id: 2, tenant: 't2', amount: 900, card_last4: '1881' }],
]);
export const sessions = new Map();
