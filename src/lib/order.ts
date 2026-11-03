import type { ID } from './types';

/**
 * Reorder `ids` (all in one group) to the given order, keeping every other
 * member of that group in the slot it had.
 */
export function placeInOrder<T extends { id: ID; order: number }>(
  items: T[],
  ids: ID[],
  sameGroup: (a: T, b: T) => boolean,
): T[] {
  const first = items.find((i) => i.id === ids[0]);
  if (!first) return items;
  const peers = items.filter((i) => sameGroup(i, first)).sort((a, b) => a.order - b.order);
  const moving = new Set(ids);
  if (peers.filter((p) => moving.has(p.id)).length !== moving.size) return items;
  const queue = [...ids];
  const next = peers.map((p) => (moving.has(p.id) ? queue.shift()! : p.id));
  const orderOf = new Map(next.map((pid, i) => [pid, i]));
  return items.map((i) => (orderOf.has(i.id) ? { ...i, order: orderOf.get(i.id)! } : i));
}
