import { router } from 'expo-router';
import { createContext, useContext, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { currentMonthKey } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import { SampleContext, useStore } from '@/store';
import { hideSample, useSampleOn } from '@/store/sample-hidden';
import { layout, useColors } from '@/theme';

import { Button } from './button';
import { Text } from './text';

/**
 * Everything inside draws from made-up sample data instead of the real data:
 * what a page looks like once it's in use, shown before anything is entered.
 */
export function SampleData({ children, start }: { children: ReactNode; start?: () => void }) {
  return (
    <SampleContext.Provider value={true}>
      <StartContext.Provider value={start ?? null}>{children}</StartContext.Provider>
    </SampleContext.Provider>
  );
}

/**
 * Around each page of a tab's stack: while the tab shows the sample, every
 * page opened from it shows the sample too, so it can be looked through.
 * The tab's first page decides for itself, and a page opened with `mine`
 * (someone entering their first real month) shows the real data.
 */
export function SampleScreen({
  on,
  start,
  route,
  children,
}: {
  on: boolean;
  start: () => void;
  route: { name: string; params?: object };
  children: ReactNode;
}) {
  const mine = !!(route.params as { mine?: string } | undefined)?.mine;
  // Always the same providers, so a page isn't rebuilt when the sample goes away.
  return (
    <SampleContext.Provider value={on && route.name !== 'index' && !mine}>
      <StartContext.Provider value={start}>{children}</StartContext.Provider>
    </SampleContext.Provider>
  );
}

/** How to leave the sample and start with real numbers, for the page being shown. */
// Null where sample data only fills in an example (a blurred card), which isn't a sample page.
const StartContext = createContext<(() => void) | null>(null);

/** Leaves whatever sample page is open and adds a first account. */
export function startNetWorth() {
  if (router.canDismiss()) router.dismissAll();
  router.push('/account-form');
}

/**
 * Leaves whatever sample page is open and opens this month to enter a first
 * amount. `mine` keeps that month, and pages opened from it, out of the sample.
 */
export function startSpending() {
  if (router.canDismiss()) router.dismissAll();
  router.push({ pathname: '/spending/[month]', params: { month: currentMonthKey(), mine: '1' } });
}

/** True while the Net Worth tab is showing the sample: no accounts yet, and not hidden. */
export function useNetWorthSample(): boolean {
  const empty = useStore((s) => s.accounts.length === 0);
  return useSampleOn() && empty;
}

/** True while the Spending tab is showing the sample: nothing entered yet, and not hidden. */
export function useSpendingSample(): boolean {
  const empty = useStore((s) => Object.values(s.spend).every((month) => Object.keys(month).length === 0));
  return useSampleOn() && empty;
}

/** True on a sample page, or a page opened from one. */
export function useSamplePage(): boolean {
  const sample = useContext(SampleContext);
  const start = useContext(StartContext);
  return sample && start != null;
}

/**
 * For anything that would change data. On a sample page it asks to start
 * with real numbers instead, since the sample can be looked through but not
 * changed. Elsewhere it's the action itself.
 */
export function useSampleGuard() {
  const sample = useContext(SampleContext);
  const start = useContext(StartContext);
  return function guard<A extends unknown[]>(action: (...args: A) => void): (...args: A) => void {
    return sample && start ? () => askToStart(start) : action;
  };
}

async function askToStart(start: () => void) {
  const yes = await confirm({ title: 'This is the sample', confirmLabel: 'Start My Own', cancelLabel: 'Keep Looking' });
  if (yes) start();
}

/** Top of a sample page: says the numbers are made up, with a way to start and a way to hide it. */
export function SampleBanner({ action, icon, onAction }: { action: string; icon?: SFSymbol; onAction: () => void }) {
  const c = useColors();
  return (
    <View style={[styles.banner, { borderColor: c.separator }]}>
      <View style={styles.line}>
        <View style={[styles.badge, { backgroundColor: c.tint }]}>
          <Text variant="caption" weight="700" color="#FFFFFF" style={styles.badgeText}>
            SAMPLE
          </Text>
        </View>
        <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.note}>
          Made-up numbers. Yours go here.
        </Text>
      </View>
      <View style={styles.buttons}>
        <Button title={action} icon={icon} onPress={onAction} style={styles.button} />
        <Button title="Hide Sample" kind="tinted" onPress={hideSample} style={styles.button} />
      </View>
    </View>
  );
}

/** Top of a page opened from a sample page: a reminder that it's still the sample. */
export function SampleStrip() {
  const c = useColors();
  return (
    <View style={[styles.line, styles.strip]}>
      <View style={[styles.badge, { backgroundColor: c.tint }]}>
        <Text variant="caption" weight="700" color="#FFFFFF" style={styles.badgeText}>
          SAMPLE
        </Text>
      </View>
      <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.note}>
        Made-up numbers.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: layout.margin,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
    gap: 10,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    letterSpacing: 0.4,
  },
  note: {
    flexShrink: 1,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    marginHorizontal: 0,
    height: 38,
  },
  strip: {
    paddingHorizontal: layout.margin,
    paddingTop: 4,
    paddingBottom: 6,
  },
});
