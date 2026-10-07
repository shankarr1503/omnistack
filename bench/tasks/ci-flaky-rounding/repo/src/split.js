export function splitBill(totalCents, people) {
  const share = Math.round(totalCents / people);
  return Array.from({ length: people }, () => share);
}
