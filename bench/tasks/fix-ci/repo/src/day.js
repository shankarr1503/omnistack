export function dayKey(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function groupByDay(events) {
  const groups = {};
  for (const event of events) (groups[dayKey(event.at)] ??= []).push(event);
  return groups;
}
