import { Fragment } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

export interface TableCell {
  text: string;
  color?: 'up' | 'down' | 'tertiary';
}

export interface TableRow {
  key: string;
  name: string;
  /** One per column; null leaves the cell empty. */
  cells: (TableCell | null)[];
  /** Dims the name, e.g. a month that hasn't happened yet. */
  muted?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
}

/** Widest a number column gets. */
const COLUMN = 72;
/** Room kept for the row name ("September") before the columns narrow. */
const NAME_MIN = 78;
/** Room for the chevron at the end of each row. */
const CHEVRON = 21;

/**
 * Rows of numbers in columns, like a statement: the column names sit in the
 * section header, the amounts line up under them, and a bold total closes it.
 */
export function MonthsTable({
  title,
  columns,
  rows,
  total,
}: {
  title: string;
  columns: string[];
  rows: TableRow[];
  total?: TableRow;
}) {
  const c = useColors();
  const { width } = useWindowDimensions();
  // Columns narrow on small phones so the names still fit.
  const fit = Math.floor((width - 2 * layout.margin - CHEVRON - NAME_MIN) / Math.max(1, columns.length));
  const column = { width: Math.max(52, Math.min(COLUMN, fit)) };
  return (
    <View style={styles.section}>
      <View style={styles.header} accessibilityRole="header">
        <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.name}>
          {title.toUpperCase()}
        </Text>
        {columns.map((col) => (
          <Text
            key={col}
            variant="footnote"
            color="secondary"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={[styles.column, column]}>
            {col.toUpperCase()}
          </Text>
        ))}
        <View style={{ width: CHEVRON }} />
      </View>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.separator }]}>
        {[...rows, ...(total ? [total] : [])].map((row, i) => {
          const isTotal = row === total;
          const content = (
            <>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
                weight={isTotal ? '600' : undefined}
                color={row.muted ? 'tertiary' : 'text'}
                style={styles.name}>
                {row.name}
              </Text>
              {row.cells.map((cell, j) => (
                <Text
                  key={j}
                  variant="callout"
                  tabular
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  weight={isTotal ? '600' : undefined}
                  color={cell?.color ?? 'text'}
                  style={[styles.column, column]}>
                  {cell?.text ?? ''}
                </Text>
              ))}
              {row.onPress ? (
                <Icon name="chevron.right" size={13} weight="semibold" color={c.tertiary} style={styles.chevron} />
              ) : (
                <View style={{ width: CHEVRON }} />
              )}
            </>
          );
          return (
            <Fragment key={row.key}>
              {i > 0 ? <View style={[styles.separator, { backgroundColor: c.separator }]} /> : null}
              {row.onPress ? (
                <Pressable
                  onPress={row.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={row.accessibilityLabel}
                  style={({ pressed }) => [styles.row, pressed && { backgroundColor: c.cardPressed }]}>
                  {content}
                </Pressable>
              ) : (
                <View style={styles.row} accessible accessibilityLabel={row.accessibilityLabel}>
                  {content}
                </View>
              )}
            </Fragment>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginHorizontal: layout.margin,
    marginBottom: 6,
  },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: layout.margin,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: layout.rowHeight,
    paddingHorizontal: layout.margin,
  },
  name: {
    flex: 1,
    minWidth: 0,
  },
  column: {
    textAlign: 'right',
  },
  chevron: {
    width: 13,
    marginLeft: CHEVRON - 13,
  },
});
