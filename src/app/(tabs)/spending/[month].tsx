import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { AmountInput } from '@/components/amount-input';
import { DragRow, useDragRows } from '@/components/drag-rows';
import { Hero } from '@/components/hero';
import { Icon } from '@/components/icon';
import { KEYBOARD_BAR_ID, KeyboardBar, useFieldChain } from '@/components/keyboard-bar';
import { Row, Section, SectionTitle } from '@/components/list';
import { useSampleGuard, useSamplePage } from '@/components/sample';
import { Screen } from '@/components/screen';
import { StatTiles, type Tile } from '@/components/stat-tiles';
import { SwipeGroup, SwipeRow } from '@/components/swipe-row';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { features } from '@/lib/features';
import { currentMonthKey, formatMonth, MONTHS, parseMonthKey, shiftMonth } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { formatPercent, roundsToZero } from '@/lib/money';
import { categoriesForMonth, GROUPS, monthTotals, type MonthTotals } from '@/lib/spending';
import type { SpendCategory } from '@/lib/types';
import { useStore } from '@/store';
import { useProfiles } from '@/store/profile-list';
import { undoImport, useLastImport } from '@/store/statement-import';
import { type, useColors } from '@/theme';

const EMPTY = {};

/** "Saved 30.7% of income", or how far spending went past it. */
function keptLine(t: MonthTotals, money: ReturnType<typeof useMoney>): string {
  if (t.income <= 0) return 'Enter this month’s totals below';
  if (t.net < 0) return `Spent ${money(-t.net)} more than earned`;
  return `Saved ${formatPercent(t.net / t.income)} of income`;
}

export default function MonthScreen() {
  const params = useLocalSearchParams<{ month: string; mine?: string }>();
  // The sample's months can be looked through, not changed: each amount asks
  // to start with real numbers instead, and the buttons that change things go.
  const sample = useSamplePage();
  const guard = useSampleGuard();
  const nudge = guard(() => {});
  const month = /^\d{4}-\d{2}$/.test(params.month ?? '') ? params.month : currentMonthKey();
  const previousKey = shiftMonth(month, -1);
  const c = useColors();
  const money = useMoney();
  const entries = useStore((s) => s.spend[month]) ?? EMPTY;
  const previous = useStore((s) => s.spend[previousKey]);
  const categories = useStore((s) => s.spendCategories);
  const note = useStore((s) => s.monthNotes[month] ?? '');
  const setSpend = useStore((s) => s.setSpend);
  const fillRecurring = useStore((s) => s.fillRecurring);
  const setMonthNote = useStore((s) => s.setMonthNote);
  const removeSpendCategory = useStore((s) => s.removeSpendCategory);
  const updateSpendCategory = useStore((s) => s.updateSpendCategory);
  const setSpendCategoryOrder = useStore((s) => s.setSpendCategoryOrder);
  const profile = useProfiles((s) => s.active);
  const imported = useLastImport((s) => (s.last?.month === month && s.last.profile === profile ? s.last : null));
  const chain = useFieldChain();
  const [swipes] = useState(() => new SwipeGroup());
  // Hidden rows with an amount stay put while you're on this month, even if you
  // clear the amount, so a row doesn't vanish under your finger mid-typing.
  const [kept, setKept] = useState<{ month: string; ids: Set<string> }>({ month: '', ids: new Set() });
  if (kept.month !== month) {
    setKept({ month, ids: new Set(categories.filter((x) => x.hidden && !!entries[x.id]).map((x) => x.id)) });
  }
  const keep = kept.month === month ? kept.ids : undefined;
  const lists = GROUPS.map((group) => categoriesForMonth(categories, entries, group.key, keep));
  const drag = useDragRows(lists.map((list) => list.map((x) => x.id).join(',')).join('|'));
  const reorder = (ids: string[]) => {
    setSpendCategoryOrder(ids);
    haptics.light();
  };

  const byId = new Map(categories.map((x) => [x.id, x]));
  const totals = monthTotals(entries, byId);
  const prevTotals = monthTotals(previous, byId);
  const prevName = MONTHS[parseMonthKey(previousKey).month - 1];

  const canFill = categoriesForMonth(categories, entries, 'recurring').some(
    (x) => !x.hidden && !entries[x.id] && !!previous?.[x.id],
  );

  const vsPrev = (now: number, before: number): string | undefined => {
    // Nothing entered on this side yet: there's nothing to compare.
    if (!prevTotals.hasData || now === 0) return undefined;
    const d = now - before;
    if (roundsToZero(d)) return `Same as ${prevName.slice(0, 3)}`;
    return `${money(d, { signed: true, whole: true })} vs ${prevName.slice(0, 3)}`;
  };
  const tiles: Tile[] = [
    { label: 'Income', value: money(totals.income), detail: vsPrev(totals.income, prevTotals.income) },
    { label: 'Expenses', value: money(totals.expenses), detail: vsPrev(totals.expenses, prevTotals.expenses) },
  ];

  const go = (step: number) => router.setParams({ month: shiftMonth(month, step) });

  /**
   * Hide a category from months with no amount. Nothing entered is cleared, so
   * there's nothing to confirm; a category that was never used is removed.
   */
  const hide = (cat: SpendCategory) => {
    // Let the tap finish before the row (and its swipe gesture) goes away.
    requestAnimationFrame(() => {
      removeSpendCategory(cat.id);
      haptics.light();
    });
  };
  let index = 0;

  return (
    <Screen
      form
      title={formatMonth(month)}
      right={[
        { label: 'Previous Month', icon: 'chevron.up', onPress: () => go(-1) },
        { label: 'Next Month', icon: 'chevron.down', onPress: () => go(1) },
      ]}>
      <Hero
        label="Net"
        value={money(totals.net)}
        caption={
          <Text variant="subheadline" color="secondary">
            {keptLine(totals, money)}
          </Text>
        }
      />
      <StatTiles tiles={tiles} />

      <Section>
        {features.statementImport && !sample ? (
          <Row
            title="Import Statement"
            titleColor="tint"
            leading={<Icon name="square.and.arrow.down" size={18} color={c.tint} />}
            chevron={false}
            // In the sample it asks to start instead: an import always goes into the real data.
            onPress={guard(() => router.push({ pathname: '/import', params: { month } }))}
          />
        ) : null}
        {canFill && !sample ? (
          <Row
            title={`Copy Recurring from ${prevName}`}
            titleColor="tint"
            leading={<Icon name="doc.on.doc" size={18} color={c.tint} />}
            chevron={false}
            onPress={() => {
              if (fillRecurring(month)) haptics.success();
            }}
          />
        ) : null}
        {features.statementImport && imported && !sample ? (
          <Row
            title={`Undo Import (${imported.count} ${imported.count === 1 ? 'line' : 'lines'})`}
            titleColor="down"
            leading={<Icon name="arrow.uturn.backward" size={18} color={c.down} />}
            chevron={false}
            onPress={() => {
              undoImport();
              haptics.light();
            }}
          />
        ) : null}
      </Section>

      {GROUPS.map((group, g) => {
        const list = lists[g];
        const ids = list.map((x) => x.id);
        const subtotal =
          group.key === 'recurring'
            ? totals.recurring
            : group.key === 'variable'
              ? totals.variable
              : totals.income;
        return (
          <Section key={group.key} title={<SectionTitle title={group.title} value={money(subtotal)} />}>
            {list.map((cat) => {
              const i = index++;
              return (
                <DragRow key={cat.id} drag={drag} id={cat.id} ids={ids} onReorder={guard(reorder)}>
                  <SwipeRow
                    group={swipes}
                    actions={sample ? [] : [
                      {
                        label: 'Edit',
                        color: '#8E8E93',
                        onPress: (close) => {
                          close();
                          router.push({ pathname: '/spend-category-form', params: { id: cat.id } });
                        },
                      },
                      cat.hidden
                        ? {
                            label: 'Unhide',
                            color: c.tint,
                            onPress: (close) => {
                              close();
                              updateSpendCategory(cat.id, { hidden: false });
                              haptics.light();
                            },
                          }
                        : {
                            label: 'Hide',
                            color: '#FF9500',
                            onPress: (close) => {
                              // A row with an amount this month stays, so slide it shut.
                              if (entries[cat.id]) close();
                              hide(cat);
                            },
                          },
                    ]}>
                    {sample ? (
                      <Row
                        title={cat.name}
                        value={entries[cat.id] ? money(entries[cat.id]) : ''}
                        chevron={false}
                        onPress={nudge}
                      />
                    ) : (
                    <Row
                      title={cat.name}
                      accessory={
                        <AmountInput
                          ref={chain.ref(i)}
                          onFocus={chain.onFocus(i)}
                          inputAccessoryViewID={KEYBOARD_BAR_ID}
                          value={entries[cat.id]}
                          hint={previous?.[cat.id]}
                          onChange={(cents) => setSpend(month, cat.id, cents)}
                          accessibilityLabel={`${cat.name} amount`}
                        />
                      }
                    />
                    )}
                  </SwipeRow>
                </DragRow>
              );
            })}
            {sample ? null : (
            <Row
              title={`Add ${group.key === 'income' ? 'Income Source' : 'Category'}`}
              titleColor="tint"
              chevron={false}
              leading={<Icon name="plus" size={17} weight="semibold" color={c.tint} />}
              onPress={() => router.push({ pathname: '/spend-category-form', params: { group: group.key } })}
            />
            )}
          </Section>
        );
      })}

      {sample ? null : (
      <Section header="Notes">
        <Row
          title={
            <TextInput
              value={note}
              onChangeText={(t) => setMonthNote(month, t)}
              placeholder="Anything worth remembering about this month"
              placeholderTextColor={c.tertiary}
              multiline
              style={[styles.note, { color: c.text }]}
            />
          }
        />
      </Section>
      )}

      <Section>
        <Row
          title="Categories"
          value={String(categories.filter((x) => !x.hidden).length)}
          // Someone entering their first month keeps their own categories on the next page too.
          onPress={() => router.push({ pathname: '/spending/categories', params: params.mine ? { mine: '1' } : {} })}
        />
      </Section>
      <KeyboardBar chain={chain} count={index} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: type.body.fontSize,
    minHeight: 60,
    paddingVertical: 4,
    textAlignVertical: 'top',
  },
});
