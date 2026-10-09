import { dedupe } from './util.js';

export function matches(record, query) {
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return pattern.test(record.title) || pattern.test(record.tags.join(' '));
}

export function search(records, query) {
  return dedupe(
    records.filter((record) => matches(record, query)),
    (record) => record.id,
  );
}
