import { StyleSheet, View } from 'react-native';

import { relativeDate } from '@/lib/dates';
import { formatRate, monthlyInterest } from '@/lib/debts';
import { seriesChange, sliceSeries, type AccountSummary, type SeriesPoint } from '@/lib/networth';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';

import { Change } from './change';
import { Row } from './list';
import { Sparkline, SPARKLINE_WIDTH } from './sparkline';
import { Text } from './text';

export function formatQuantity(q: number): string {
  return q.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Separator inset for sections of trend rows, so lines start at the text. */
export const TREND_ROW_INSET = layout.margin + SPARKLINE_WIDTH + 12;

export function updatedLabel(date: string | undefined): string {
  if (!date) return 'No balance yet';
  const rel = relativeDate(date);
  return `Updated ${rel === 'Today' || rel === 'Yesterday' ? rel.toLowerCase() : rel}`;
}

/**
 * A compact list row: mini chart for the selected range, name and a detail line,
 * value with its latest change underneath.
 */
export function TrendRow({
  title,
  subtitle,
  value,
  change,
  changeRatio,
  invert,
  series,
  tag,
  onPress,
}: {
  title: string;
  subtitle: string;
  value: string;
  /** A short label beside the name, like "Pay first". */
  tag?: string;
  change?: number | null;
  /** The change as a share of the earlier value, shown as a percent beside it. */
  changeRatio?: number | null;
  /** For debts: a falling balance is good news. */
  invert?: boolean;
  /** Full history; it is cut to the range picked on the chart above. */
  series?: SeriesPoint[];
  onPress: () => void;
}) {
  const c = useColors();
  const today = useToday();
  const range = useStore((s) => s.settings.nwRange);

  let leading;
  if (series) {
    const points = sliceSeries(series, range, today);
    const { delta } = seriesChange(points);
    const good = invert ? delta < 0 : delta > 0;
    leading = (
      <Sparkline
        points={points}
        color={delta === 0 ? c.tertiary : good ? c.up : c.down}
      />
    );
  }

  return (
    <Row
      leading={leading}
      title={
        tag ? (
          <View style={styles.titleRow}>
            <Text numberOfLines={1} style={styles.titleText}>
              {title}
            </Text>
            <View style={[styles.tag, { backgroundColor: `${c.tint}26` }]}>
              <Text variant="caption" weight="600" color="tint">
                {tag}
              </Text>
            </View>
          </View>
        ) : (
          title
        )
      }
      subtitle={
        <Text variant="footnote" color="secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      }
      value={
        <Text variant="body" weight="600" tabular numberOfLines={1}>
          {value}
        </Text>
      }
      detail={change ? <Change delta={change} ratio={changeRatio} invert={invert} variant="footnote" weight="500" /> : undefined}
      chevron={false}
      onPress={onPress}
    />
  );
}

export function AccountRow({
  summary,
  series,
  tag,
  onPress,
}: {
  summary: AccountSummary;
  series?: SeriesPoint[];
  tag?: string;
  onPress: () => void;
}) {
  const money = useMoney();
  const today = useToday();
  const { account, latest, previous, lastChange, kind } = summary;
  // Percent change versus the entry before, the same basis as the dollar change.
  const changeRatio = lastChange && previous?.value ? lastChange / Math.abs(previous.value) : null;
  let subtitle = updatedLabel(latest?.date);
  if (account.unit && latest?.quantity != null) {
    // A metal on today's price shows the price; anything else shows when it was last updated.
    const detail =
      account.metal && latest.date === today && latest.unitPrice != null
        ? `${money(latest.unitPrice)}/${account.unit}`
        : subtitle;
    subtitle = `${formatQuantity(latest.quantity)} ${account.unit} · ${detail}`;
  } else if (kind === 'liability' && summary.balance > 0) {
    // A debt shows what it costs: "24.99% · $46/mo interest", or "0% APR" with no rate set.
    const interest = monthlyInterest(summary.balance, account.apr);
    subtitle = `${formatRate(account.apr ?? 0)}${interest > 0 ? ` · ${money(interest, { whole: true })}/mo interest` : ' APR'}`;
  }
  return (
    <TrendRow
      title={account.name}
      subtitle={subtitle}
      value={money(summary.balance)}
      change={lastChange}
      changeRatio={changeRatio}
      invert={kind === 'liability'}
      series={series}
      tag={tag}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  tag: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
});
