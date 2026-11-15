import type { FormatMoney } from '@/hooks/use-money';
import type { CategoryChange, CategoryMonth } from '@/lib/category-trend';
import { MONTHS, MONTHS_SHORT } from '@/lib/dates';
import type { SpendCategory, SpendGroup } from '@/lib/types';
import { useColors } from '@/theme';

import type { Bar } from './bar-chart';
import { Pills } from './pills';

/** Spending in blue, income in green, as elsewhere in the app. */
export function useGroupColor() {
  const c = useColors();
  return (group: SpendGroup) => (group === 'income' ? c.up : c.bar);
}

/**
 * The sentence for a category: lately against a year ago (or its first
 * months), or its average when there isn't enough to compare yet.
 */
export function categorySentence(
  name: string,
  months: CategoryMonth[],
  change: CategoryChange | null,
  average: number | null,
  whole: (cents: number) => string,
): string {
  if (!change) {
    const first = months.find((m) => m.value != null);
    if (average == null || !first) return `Nothing entered for ${name} yet.`;
    return `${whole(average)} a month since ${MONTHS_SHORT[first.month - 1]} ${first.year}.`;
  }
  const ago = change.since === 'year' ? 'last year' : 'at first';
  const { recent, before } = change;
  const lately = `${whole(recent)} a month lately`;
  if (recent === before || (before > 0 && Math.abs(recent / before - 1) < 0.05)) return `${lately}, same as ${ago}.`;
  return `${lately}, ${recent > before ? 'up' : 'down'} ${whole(Math.abs(recent - before))} from ${ago}.`;
}

/** Bars for a run of months. A month with nothing entered at all is an empty slot. */
export function categoryBars(months: CategoryMonth[], money: FormatMoney): Bar[] {
  return months.map((m) => ({
    value: m.value ?? 0,
    label: MONTHS_SHORT[m.month - 1][0],
    accessibilityLabel: `${MONTHS[m.month - 1]} ${m.year}: ${m.value == null ? 'nothing entered' : money(m.value, { whole: true })}`,
  }));
}

/** Labels under a long run of months: each January, with its year. */
export function yearLabels(months: CategoryMonth[]): { index: number; text: string }[] {
  const labels = months.flatMap((m, i) => (m.month === 1 ? [{ index: i, text: String(m.year) }] : []));
  // Starting partway through a year, the first bar says when.
  if (months.length && months[0].month !== 1 && (labels[0]?.index ?? 99) > 4) {
    labels.unshift({ index: 0, text: `${MONTHS_SHORT[months[0].month - 1]} ${String(months[0].year).slice(2)}` });
  }
  return labels;
}

/** A row of pills to pick a category, scrolling sideways when there are many. */
export function CategoryPills({
  categories,
  value,
  onChange,
  locked,
}: {
  categories: SpendCategory[];
  value: string;
  onChange: (id: string) => void;
  /** Inside a card that opens Pro when tapped: shown, but not buttons of their own. */
  locked?: boolean;
}) {
  return (
    <Pills
      options={categories.map((cat) => ({ value: cat.id, label: cat.name }))}
      value={value}
      onChange={onChange}
      locked={locked}
    />
  );
}
