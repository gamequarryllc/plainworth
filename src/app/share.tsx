import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Platform, StyleSheet, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { updatedLabel } from '@/components/account-row';
import { Button } from '@/components/button';
import { LineChart } from '@/components/line-chart';
import { RangePicker } from '@/components/range-picker';
import { Screen } from '@/components/screen';
import { Sparkline } from '@/components/sparkline';
import { Text } from '@/components/text';
import { useToday } from '@/hooks/use-today';
import { notify } from '@/lib/dialogs';
import { formatMoney, formatPercent } from '@/lib/money';
import {
  buildSeries,
  leadStart,
  rangeCaption,
  seriesChange,
  sliceSeries,
  summarizeAccounts,
  totalsOf,
  updatesByAccount,
} from '@/lib/networth';
import { cleanName, possessive } from '@/lib/name';
import { storage } from '@/lib/storage';
import { useStore } from '@/store';
import { layout, useColors } from '@/theme';

/** Where the share screen kept a name before Settings had one. */
const NAME_KEY = 'plainworth.share.name';
/** Only the biggest accounts, so the image stays about phone-screen shaped. */
const MAX_ROWS = 5;

function readName(): string {
  try {
    return storage.read(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

/**
 * Share your net worth as an image, laid out like the Net Worth tab: your
 * total, the chart for the range you pick, and your accounts with their
 * sparklines, with a small "Made with Plainworth" at the bottom. The gear
 * hides amounts (percentages only), hides the accounts, or adds your name.
 * Free for everyone.
 */
export default function ShareScreen() {
  const c = useColors();
  const today = useToday();
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const categories = useStore((s) => s.nwCategories);
  const currency = useStore((s) => s.settings.currency);
  const hideAmounts = useStore((s) => s.settings.hideAmounts);
  const range = useStore((s) => s.settings.nwRange);
  const updateSettings = useStore((s) => s.updateSettings);
  const [amounts, setAmounts] = useState(!hideAmounts);
  const [showAccounts, setShowAccounts] = useState(true);
  const savedName = useStore((s) => s.settings.name);
  const [oldName] = useState(readName);
  const name = cleanName(savedName ?? oldName);
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);

  const summaries = summarizeAccounts(accounts, snapshots, categories);
  const totals = totalsOf(summaries.values());
  const series = buildSeries(snapshots, accounts, categories, { signed: true });
  const points = sliceSeries(series, range, today);
  const change = seriesChange(points);
  const up = change.delta >= 0;
  const perAccount = updatesByAccount(snapshots);
  const rows = accounts
    .filter((a) => !a.closed)
    .map((a) => summaries.get(a.id)!)
    .filter((s) => s.balance !== 0)
    .sort((x, y) => Math.abs(y.balance) - Math.abs(x.balance));
  const shownRows = rows.slice(0, MAX_ROWS);

  const whole = (cents: number) => formatMoney(cents, currency, { whole: true });
  const compact = (cents: number) => formatMoney(cents, currency, { compact: true, whole: Math.abs(cents) < 100_000 });
  const signed = (cents: number) => formatMoney(cents, currency, { compact: true, signed: true, whole: true });

  const askName = () => {
    if (Platform.OS !== 'ios') return;
    Alert.prompt(
      'Your Name',
      'Shown as “Name’s Net Worth” on the image, and on the Net Worth tab when it fits. Leave it empty for “My Net Worth”.',
      (text) => {
        updateSettings({ name: cleanName(text) });
        storage.write(NAME_KEY, '').catch(() => {});
      },
      'plain-text',
      name,
    );
  };

  const share = async () => {
    if (Platform.OS === 'web') {
      notify('Sharing works in the app', 'Open Plainworth on your phone to share this image.');
      return;
    }
    setBusy(true);
    try {
      const uri = await captureRef(card as unknown as Parameters<typeof captureRef>[0], {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share Your Net Worth' });
    } catch (e) {
      console.warn('Could not share the image', e);
      notify('Couldn’t share', 'Something went wrong making the image. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = name ? `${possessive(name)} Net Worth` : 'My Net Worth';
  return (
    <Screen
      title="Share Your Net Worth"
      left={[{ label: 'Close', icon: 'xmark', onPress: () => router.back() }]}
      right={[
        {
          label: 'Options',
          icon: 'gearshape',
          menu: [
            { label: 'Show Amounts', subtitle: 'Off shares percentages only', isOn: amounts, onPress: () => setAmounts(!amounts) },
            { label: 'Show Accounts', isOn: showAccounts, onPress: () => setShowAccounts(!showAccounts) },
            ...(Platform.OS === 'ios' ? [{ label: name ? 'Change Name…' : 'Add Your Name…', icon: 'person' as const, onPress: askName }] : []),
          ],
        },
      ]}>
      <View ref={card} collapsable={false} style={[styles.card, { backgroundColor: c.background }]}>
        <View style={styles.top}>
          <View style={styles.topText}>
            <Text variant="subheadline" weight="600" color="secondary" numberOfLines={1}>
              {title}
            </Text>
            <Text variant="largeTitle" rounded tabular numberOfLines={1} adjustsFontSizeToFit>
              {amounts ? whole(totals.net) : points.length > 1 ? formatPercent(change.ratio, { signed: true }) : '—'}
            </Text>
            {points.length > 1 ? (
              <Text variant="subheadline" weight="600" color={up ? 'up' : 'down'} numberOfLines={1}>
                {`${amounts ? `${signed(change.delta)} (${formatPercent(change.ratio, { signed: true })})` : up ? 'Up' : 'Down'} · ${rangeCaption(range)}`}
              </Text>
            ) : null}
          </View>
          {name ? (
            <View style={[styles.avatar, { backgroundColor: c.fillStrong }]}>
              <Text variant="title2" weight="600">
                {name[0].toUpperCase()}
              </Text>
            </View>
          ) : null}
        </View>
        {points.length > 1 ? (
          <View style={styles.chart}>
            <LineChart
              points={points}
              color={up ? c.up : c.down}
              baseline={points[0].value}
              from={leadStart(series, range, today)}
              height={130}
              axis
            />
          </View>
        ) : null}
        {showAccounts && shownRows.length ? (
          <View style={styles.list}>
            <Text variant="footnote" weight="600" color="secondary" style={styles.listTitle}>
              {rows.length > MAX_ROWS ? `TOP ${MAX_ROWS} ACCOUNTS` : 'ACCOUNTS'}
            </Text>
            {shownRows.map((s) => {
              const own = sliceSeries(perAccount.get(s.account.id) ?? [], range, today);
              const ch = seriesChange(own);
              const debt = s.kind === 'liability';
              const good = debt ? ch.delta < 0 : ch.delta > 0;
              const tone = ch.delta === 0 ? 'secondary' : good ? 'up' : 'down';
              return (
                <View key={s.account.id} style={[styles.row, { backgroundColor: c.card }]}>
                  <Sparkline
                    points={own}
                    from={leadStart(perAccount.get(s.account.id) ?? [], range, today)}
                    color={ch.delta === 0 ? c.tertiary : good ? c.up : c.down} />
                  <View style={styles.rowText}>
                    <Text numberOfLines={1}>{s.account.name}</Text>
                    <Text variant="footnote" color="secondary" numberOfLines={1}>
                      {updatedLabel(s.latest?.date)}
                    </Text>
                  </View>
                  <View style={styles.rowValue}>
                    <Text weight="600" tabular numberOfLines={1}>
                      {amounts ? `${debt ? '−' : ''}${compact(s.balance)}` : formatPercent(ch.ratio, { signed: true })}
                    </Text>
                    <Text variant="footnote" weight="500" tabular color={tone} numberOfLines={1}>
                      {amounts ? `${formatPercent(ch.ratio, { signed: true })} · ${signed(ch.delta)}` : debt ? 'Debt' : ' '}
                    </Text>
                  </View>
                </View>
              );
            })}
            {rows.length > shownRows.length ? (
              <Text variant="footnote" color="secondary" style={styles.more}>
                {`+ ${rows.length - shownRows.length} more`}
              </Text>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.plug, { borderTopColor: c.separator }]}>
          <Image source={require('@/../assets/images/icon.png')} style={styles.icon} />
          <Text variant="footnote" color="secondary">
            Made with{' '}
            <Text variant="footnote" weight="700">
              Plainworth
            </Text>
            {' · Net Worth Tracker'}
          </Text>
        </View>
      </View>
      <RangePicker value={range} onChange={(r) => updateSettings({ nwRange: r })} />
      <Button
        title={busy ? 'Making Image…' : 'Share Now'}
        icon="square.and.arrow.up"
        onPress={share}
        disabled={busy}
        style={styles.button}
      />
      <Text variant="footnote" color="secondary" align="center" style={styles.footer}>
        {amounts
          ? 'Your balances are on the image. Turn off Show Amounts in the gear to share percentages only.'
          : 'Only percentages are shared, not your balances.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: layout.margin,
  },
  topText: {
    flex: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chart: {
    marginTop: 14,
    paddingHorizontal: layout.margin,
  },
  list: {
    marginTop: 14,
    paddingHorizontal: 10,
    gap: 4,
  },
  listTitle: {
    marginHorizontal: 6,
    marginBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  rowValue: {
    alignItems: 'flex-end',
    gap: 1,
  },
  more: {
    marginHorizontal: 6,
  },
  plug: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginHorizontal: layout.margin,
    paddingTop: 10,
    paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 20,
    height: 20,
    borderRadius: 5,
  },
  button: {
    marginTop: 14,
    marginHorizontal: layout.margin,
  },
  footer: {
    marginTop: 10,
    marginBottom: 20,
    marginHorizontal: layout.margin,
  },
});
