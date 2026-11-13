import { create } from 'zustand';

import { counts, pickedRules, totalsOf, type Item } from '@/lib/statement';
import { storage } from '@/lib/storage';
import type { Cents, ID, MonthKey, SpendCategory } from '@/lib/types';

import { useStore } from './index';
import { activeProfile } from './profile-list';

/**
 * What importing statements remembers, kept on this phone only and apart from
 * the data itself (it isn't in backups or sync): the category picked for a
 * merchant, which statement lines each month already has, and whether Apple
 * Intelligence is turned on for reading. No statement text or file is kept.
 */
interface Memory {
  /** Merchant → category id, or "skip". */
  rules: Record<string, string>;
  /** Month → marks of the lines already added. */
  seen: Record<MonthKey, string[]>;
  ai: boolean;
}

const key = (profile: ID) => `plainworth.import.${profile}`;

export function importMemory(): Memory {
  try {
    const raw = storage.read(key(activeProfile()));
    const saved = raw ? (JSON.parse(raw) as Partial<Memory>) : null;
    return { rules: saved?.rules ?? {}, seen: saved?.seen ?? {}, ai: saved?.ai === true };
  } catch {
    return { rules: {}, seen: {}, ai: false };
  }
}

function save(memory: Memory) {
  storage.write(key(activeProfile()), JSON.stringify(memory)).catch((e) => console.warn('Could not save import choices', e));
}

export function setImportAi(on: boolean) {
  save({ ...importMemory(), ai: on });
}

/** The lines a month already has from earlier imports. A month with nothing in it has none, whatever was imported before. */
export function seenIn(month: MonthKey): string[] {
  return useStore.getState().spend[month] ? (importMemory().seen[month] ?? []) : [];
}

interface Last {
  profile: ID;
  month: MonthKey;
  changes: Record<ID, Cents>;
  marks: string[];
  count: number;
}

/** The import just made, so it can be undone from the month it went into. Forgotten when the app closes. */
export const useLastImport = create<{ last: Last | null }>(() => ({ last: null }));

/** Add the reviewed lines to the month, and remember the choices made. Returns how many lines were added. */
export function applyImport(month: MonthKey, items: Item[], categories: SpendCategory[]): number {
  const totals = totalsOf(items, categories);
  if (!totals.count) return 0;
  useStore.getState().addToSpend(month, totals.byCategory);
  const marks = items.filter(counts).map((i) => i.mark);
  const memory = importMemory();
  save({
    ...memory,
    rules: { ...memory.rules, ...pickedRules(items) },
    seen: { ...memory.seen, [month]: [...new Set([...(memory.seen[month] ?? []), ...marks])] },
  });
  useLastImport.setState({ last: { profile: activeProfile(), month, changes: totals.byCategory, marks, count: totals.count } });
  return totals.count;
}

/** Take the last import back out of its month. */
export function undoImport() {
  const { last } = useLastImport.getState();
  if (!last || last.profile !== activeProfile()) return;
  const back: Record<ID, Cents> = {};
  for (const [id, amount] of Object.entries(last.changes)) back[id] = -amount;
  useStore.getState().addToSpend(last.month, back);
  const memory = importMemory();
  const gone = new Set(last.marks);
  save({ ...memory, seen: { ...memory.seen, [last.month]: (memory.seen[last.month] ?? []).filter((m) => !gone.has(m)) } });
  useLastImport.setState({ last: null });
}
