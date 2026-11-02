import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

import { Button } from '@/components/button';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { Text } from '@/components/text';
import { useToday } from '@/hooks/use-today';
import { MONTHS, parseDateKey } from '@/lib/dates';
import { notify } from '@/lib/dialogs';
import { formatMoney, formatPercent } from '@/lib/money';
import { buildSeries, seriesChange, sliceSeries, type SeriesPoint } from '@/lib/networth';
import { useStore } from '@/store';
import { layout } from '@/theme';

type Show = 'amount' | 'growth';
const SHOW: { value: Show; label: string }[] = [
  { value: 'amount', label: 'Net Worth' },
  { value: 'growth', label: 'Growth Only' },
];

// The card always uses the dark look, so the image looks the same wherever it's posted.
const CARD = { bg: '#0B0B0D', text: '#FFFFFF', secondary: 'rgba(235,235,245,0.6)', up: '#30D158', down: '#FF453A', line: 'rgba(84,84,88,0.65)' };
const CARD_W = 340;
const CHART_H = 110;

/**
 * Share your net worth as an image: the amount (or only how much it grew, for
 * anyone who'd rather keep the number private), the past year as a line, and
 * a small "Made with Plainworth" at the bottom. Free for everyone.
 */
export default function ShareScreen() {
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const currency = useStore((s) => s.settings.currency);
  const hidden = useStore((s) => s.settings.hideAmounts);
  const [show, setShow] = useState<Show>(hidden ? 'growth' : 'amount');
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);

  const all = buildSeries(snapshots, accounts, categories, { signed: true });
  const year = sliceSeries(all, '1Y', today);
  const current = all.length ? all[all.length - 1].value : 0;
  const { delta, ratio } = seriesChange(year);
  const canGrow = year.length >= 2 && year[0].value > 0;
  const up = delta >= 0;
  const t = parseDateKey(today);
  const money = (cents: number, signed?: boolean) => formatMoney(cents, currency, { whole: true, signed });

  const share = async () => {
    if (Platform.OS === 'web') {
      notify('Sharing works in the app', 'Open Plainworth on your phone to share this card.');
      return;
    }
    setBusy(true);
    try {
      const uri = await captureRef(card as unknown as Parameters<typeof captureRef>[0], { format: 'png', quality: 1, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share Net Worth' });
    } catch (e) {
      console.warn('Could not share the card', e);
      notify('Couldn’t share', 'Something went wrong making the image. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const growthOnly = show === 'growth';
  return (
    <Screen title="Share Net Worth" left={[{ label: 'Close', icon: 'xmark', onPress: () => router.back() }]}>
      <Segmented options={SHOW} value={show} onChange={setShow} style={styles.picker} />
      <View style={styles.center}>
        <View ref={card} collapsable={false} style={styles.card}>
          <Text variant="subheadline" weight="600" color={CARD.secondary}>
            {growthOnly ? 'My net worth, past year' : 'My net worth'}
          </Text>
          <Text variant="largeTitle" rounded tabular color={growthOnly ? (up ? CARD.up : CARD.down) : CARD.text} numberOfLines={1} adjustsFontSizeToFit>
            {growthOnly ? (canGrow ? formatPercent(ratio, { signed: true }) : '—') : money(current)}
          </Text>
          {canGrow ? (
            <Text variant="subheadline" color={up ? CARD.up : CARD.down}>
              {growthOnly ? (up ? 'Up over the past year' : 'Down over the past year') : `${money(delta, true)} (${formatPercent(ratio, { signed: true })}) this past year`}
            </Text>
          ) : null}
          <YearLine points={year} color={up ? CARD.up : CARD.down} />
          <Text variant="footnote" color={CARD.secondary}>
            {`${MONTHS[t.m - 1]} ${t.y}`}
          </Text>
          <View style={[styles.plug, { borderTopColor: CARD.line }]}>
            <Image source={require('@/../assets/images/icon.png')} style={styles.icon} />
            <Text variant="footnote" color={CARD.secondary}>
              Made with{' '}
              <Text variant="footnote" weight="700" color={CARD.text}>
                Plainworth
              </Text>
            </Text>
          </View>
        </View>
      </View>
      <Button title={busy ? 'Making Image…' : 'Share'} icon="square.and.arrow.up" onPress={share} disabled={busy} style={styles.button} />
      <Text variant="footnote" color="secondary" align="center" style={styles.footer}>
        {growthOnly ? 'Only the percentage is shared, not your balance.' : 'Your balance is on the image. Pick Growth Only to keep it private.'}
      </Text>
    </Screen>
  );
}

/** The past year as a plain line, like the Stocks share card. */
function YearLine({ points, color }: { points: SeriesPoint[]; color: string }) {
  const width = CARD_W - 40;
  if (points.length < 2) return <View style={{ height: CHART_H, marginVertical: 14 }} />;
  const minDay = points[0].day;
  const spanX = points[points.length - 1].day - minDay || 1;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const y = (v: number) => (max === min ? CHART_H / 2 : 6 + (CHART_H - 12) * (1 - (v - min) / (max - min)));
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${(((p.day - minDay) / spanX) * width).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  return (
    <Svg width={width} height={CHART_H} style={{ marginVertical: 14 }}>
      <Defs>
        <LinearGradient id="shareFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.3} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Path d={`${line}L${width},${CHART_H}L0,${CHART_H}Z`} fill="url(#shareFill)" />
      <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  picker: {
    marginTop: 8,
    marginBottom: 16,
  },
  center: {
    alignItems: 'center',
  },
  card: {
    width: CARD_W,
    padding: 20,
    paddingBottom: 14,
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: CARD.bg,
  },
  plug: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  button: {
    marginTop: 20,
    marginHorizontal: layout.margin,
  },
  footer: {
    marginTop: 10,
    marginHorizontal: layout.margin,
  },
});
