import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { SheetPreview } from '@/components/sheet-preview';
import { Text } from '@/components/text';
import { useToday } from '@/hooks/use-today';
import { notify } from '@/lib/dialogs';
import { exportContents, exportFileName, exportSheets, exportWorkbook } from '@/lib/export';
import { LIFETIME_PRICE } from '@/lib/pro';
import { EXCEL, shareFile } from '@/lib/share-file';
import { currentData, useStore } from '@/store';
import { openPaywall, useProStore } from '@/store/pro';
import { sampleData } from '@/store/sample';
import { layout, useColors } from '@/theme';

/**
 * Export to Excel. Everyone can open it: the top of each sheet is drawn from
 * their own numbers, so free users see what Pro would hand them (faded at the
 * bottom) before the Unlock button. With nothing entered yet, it shows an
 * example instead.
 */
export default function ExportScreen() {
  const c = useColors();
  const today = useToday();
  const pro = useProStore((s) => s.source != null);
  const price = useProStore((s) => s.offer?.price) ?? LIFETIME_PRICE;
  const currency = useStore((s) => s.settings.currency);
  const masked = useStore((s) => s.settings.hideAmounts);
  const hasData = useStore((s) => s.accounts.length > 0 || Object.keys(s.spend).length > 0);
  // Changes whenever anything is saved, so the preview stays current.
  const accounts = useStore((s) => s.accounts);
  const snapshots = useStore((s) => s.snapshots);
  const spend = useStore((s) => s.spend);
  const [busy, setBusy] = useState(false);

  const data = useMemo(
    () => (hasData ? currentData() : sampleData(4)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasData, accounts, snapshots, spend],
  );
  const sheets = useMemo(() => exportSheets(data, today), [data, today]);
  const contents = useMemo(() => exportContents(data, today), [data, today]);
  // Start on Net Worth, the sheet most people have filled in, or the first year of spending if not.
  const [tab, setTab] = useState(() => (data.snapshots.length ? 1 : Math.min(3, sheets.length - 1)));
  const sheet = sheets[Math.min(tab, sheets.length - 1)];

  const onExport = async () => {
    setBusy(true);
    try {
      await shareFile(exportFileName(today), exportWorkbook(currentData(), today), EXCEL, 'Export to Excel');
    } catch (e) {
      console.warn('Export failed', e);
      notify('Couldn’t export', 'Something went wrong making the spreadsheet. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Export to Excel" left={[{ label: 'Close', icon: 'xmark', onPress: () => router.back() }]}>
      <Text variant="footnote" color="secondary" style={styles.caption}>
        {hasData ? exportFileName(today).toUpperCase() : 'EXAMPLE SPREADSHEET'}
      </Text>
      <View style={[styles.preview, { borderColor: c.separator }]}>
        <SheetPreview sheet={sheet} currency={currency} masked={masked && hasData} faded={!pro} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabs}
          contentContainerStyle={styles.tabsContent}>
          {sheets.map((s, i) => {
            const on = s === sheet;
            return (
              <Pressable
                key={s.name}
                onPress={() => setTab(i)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.tab, on && styles.tabOn]}>
                <Text variant="footnote" weight={on ? '700' : '400'} color={on ? '#111111' : '#4A515D'}>
                  {s.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      <Text variant="footnote" color="secondary" style={styles.note}>
        {hasData
          ? pro
            ? 'The top of each sheet, from your numbers. Tap a tab to see another.'
            : 'The top of each sheet, from your numbers. The file has every month and every balance.'
          : 'An example with made-up numbers. Yours fills in as you add accounts and spending.'}
      </Text>

      <Section header="In the File" footer="One .xlsx file that opens in Excel, Numbers or Google Sheets.">
        {contents.map((x) => (
          <Row key={x.name} title={x.name} value={x.detail} />
        ))}
      </Section>

      {pro ? (
        <Button
          title={busy ? 'Making Spreadsheet…' : 'Export'}
          icon="square.and.arrow.up"
          onPress={onExport}
          disabled={!hasData || busy}
          style={styles.button}
        />
      ) : (
        <Button title={`Unlock Pro · ${price}`} onPress={() => openPaywall('export')} style={styles.button} />
      )}
      <Text variant="footnote" color="secondary" align="center" style={styles.footer}>
        {pro
          ? hasData
            ? 'Shared through the share sheet, so you choose where it goes.'
            : 'Add an account or a month of spending to export.'
          : 'One time. Also unlocks Insights and exact chart values.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  caption: {
    marginTop: 8,
    marginBottom: 6,
    marginHorizontal: layout.margin,
  },
  preview: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    backgroundColor: '#FFFFFF',
  },
  tabs: {
    backgroundColor: '#EEF0F2',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#D5D9DE',
  },
  tabsContent: {
    paddingHorizontal: 6,
  },
  tab: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tabOn: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 2,
    borderTopColor: '#30D158',
    paddingTop: 6,
  },
  note: {
    marginTop: 8,
    marginHorizontal: layout.margin,
  },
  button: {
    marginTop: 24,
  },
  footer: {
    marginTop: 10,
    marginHorizontal: layout.margin * 2,
  },
});
