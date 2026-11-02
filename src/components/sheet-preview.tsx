import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { formatDate, keyFromDayNumber } from '@/lib/dates';
import { formatMoney, formatPercent, MASK } from '@/lib/money';
import { resolveStyle, type Cell, type Sheet } from '@/lib/xlsx';

import { Text } from './text';

interface Props {
  sheet: Sheet;
  currency: string;
  /** Hide Amounts is on: numbers show as dots. */
  masked?: boolean;
  /** Free users: the bottom fades out, a hint of what the file holds. */
  faded?: boolean;
  rows?: number;
}

/**
 * The top of an export sheet drawn the way it looks in Excel: the same fills,
 * colors and bold rows, from the same cells the file is made of, but only the
 * columns that fit on a phone (the label and the latest few months).
 */
export function SheetPreview({ sheet, currency, masked, faded, rows = 11 }: Props) {
  const columns = previewColumns(sheet);
  const shown = sheet.rows.slice(0, rows);
  return (
    <View style={styles.sheet}>
      {shown.map((row, r) => {
        const height = sheet.heights?.[r] ? Math.min(30, sheet.heights[r]) : 22;
        // A title or a note on its own runs across the whole width, as it does in the sheet.
        const alone = row.slice(1).every((cell) => cell == null || (typeof cell === 'object' && cell.value === ''));
        return (
          <View key={r} style={[styles.row, { height }]}>
            {(alone ? [0] : columns).map((col, i) => (
              <PreviewCell key={col} cell={row[col]} first={i === 0} currency={currency} masked={masked} />
            ))}
          </View>
        );
      })}
      {faded ? (
        <View pointerEvents="none" style={styles.fade}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="sheet-fade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheet-fade)" />
          </Svg>
        </View>
      ) : null}
    </View>
  );
}

function PreviewCell({
  cell,
  first,
  currency,
  masked,
}: {
  cell: Cell;
  first: boolean;
  currency: string;
  masked?: boolean;
}) {
  const { value, style } = cell != null && typeof cell === 'object' ? cell : { value: cell, style: undefined };
  const s = resolveStyle(style);
  const numeric = typeof value === 'number';
  let text = '';
  if (value != null && value !== '') {
    if (!numeric) text = String(value);
    else if (masked && s.format !== 'date') text = MASK;
    else if (s.format === 'money') text = formatMoney(Math.round(value * 100), currency);
    else if (s.format === 'signedMoney') text = formatMoney(Math.round(value * 100), currency, { signed: true });
    else if (s.format === 'percent') text = formatPercent(value);
    else if (s.format === 'date') text = formatDate(keyFromDayNumber(value - 25_569));
    else text = String(value);
  }
  const align = s.align ?? (numeric && s.format !== 'date' ? 'right' : 'left');
  return (
    <View
      style={[
        first ? styles.first : styles.cell,
        s.fill ? { backgroundColor: `#${s.fill}` } : null,
        s.top ? { borderTopWidth: s.top === 'double' ? 2 : 1, borderTopColor: `#${s.borderColor ?? '000000'}` } : null,
      ]}>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        tabular
        color={s.color ? `#${s.color}` : '#1B1F26'}
        weight={s.bold ? '700' : '400'}
        align={align}
        style={[styles.text, s.size ? sized(s.size) : null]}>
        {text}
      </Text>
    </View>
  );
}

/** The file's big title stays big; the Overview's figures shrink a little to fit three across. */
function sized(size: number) {
  const fontSize = size >= 20 ? 22 : size > 11 ? 15 : 10;
  return { fontSize, lineHeight: fontSize + 5 };
}

/** Which columns fit on a phone: the label, then the most recent figures. */
function previewColumns(sheet: Sheet): number[] {
  const width = Math.max(...sheet.rows.map((r) => r.length));
  if (sheet.name === 'Overview') return [0, 1, 2].filter((i) => i < width);
  if (sheet.name === 'Balances') return [0, 1, 4];
  if (sheet.name === 'Net Worth') return [0, ...[width - 3, width - 2, width - 1].filter((i) => i >= 2)];
  // A year of spending: the last two months with something in them, then the year's total.
  const filled = Array.from({ length: 12 }, (_, i) => i + 1).filter((col) =>
    sheet.rows.slice(1).some((r) => {
      const c = r[col];
      return c != null && (typeof c !== 'object' || c.value !== '');
    }),
  );
  return [0, ...filled.slice(-2), 13];
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  first: {
    flex: 1.45,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cell: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  text: {
    fontSize: 12,
    lineHeight: 16,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 150,
  },
});
