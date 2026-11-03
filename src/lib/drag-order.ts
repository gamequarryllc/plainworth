/**
 * Row math for hold-and-drag reordering (see components/drag-rows). Kept
 * free of React Native so it can be tested, and marked as worklets so the
 * gesture can call it on the UI thread.
 */

/** The hairline Section draws between rows. */
export const GAP = 0.5;

/**
 * How far down the list `id` starts when the rows are in `list` order, worked
 * out from row heights.
 */
export function topOf(list: string[], heights: Record<string, number>, id: string, gap = GAP): number {
  'worklet';
  let top = 0;
  for (const other of list) {
    if (other === id) break;
    top += (heights[other] ?? 0) + gap;
  }
  return top;
}

/** The furthest down `id` can be dragged: its bottom edge level with the last row's. */
export function maxDrag(list: string[], heights: Record<string, number>, id: string, gap = GAP): number {
  'worklet';
  const last = list[list.length - 1];
  const bottom = topOf(list, heights, last, gap) + (heights[last] ?? 0) - (heights[id] ?? 0);
  return bottom - topOf(list, heights, id, gap);
}

/**
 * The order with `id` moved to wherever its middle now is. A row it passes
 * gives way as soon as the dragged row's middle reaches that row's middle,
 * in either direction, and holding the row at either end of the list always
 * puts it first or last, so the end slots are reachable without dragging past
 * the list (and over Add Category).
 */
export function orderAt(
  start: string[],
  heights: Record<string, number>,
  id: string,
  dragY: number,
  gap = GAP,
): string[] {
  'worklet';
  const rest = start.filter((x) => x !== id);
  const from = topOf(start, heights, id, gap);
  if (dragY <= -from + 1) return [id, ...rest];
  if (dragY >= maxDrag(start, heights, id, gap) - 1) return [...rest, id];

  const middle = from + dragY + (heights[id] ?? 0) / 2;
  const own = start.indexOf(id);
  let slot = 0;
  for (const other of rest) {
    const mid = topOf(start, heights, other, gap) + (heights[other] ?? 0) / 2;
    const below = start.indexOf(other) > own;
    if (below ? middle >= mid : middle > mid) slot += 1;
  }
  return [...rest.slice(0, slot), id, ...rest.slice(slot)];
}
