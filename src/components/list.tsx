import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

interface SectionProps {
  /** Small caption above the group. */
  header?: string;
  /** Shown at the right end of the header, e.g. the group's total. */
  headerValue?: string;
  /** Large header row, e.g. a category name with its total. */
  title?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Separator inset from the left, to line up with row text. */
  inset?: number;
}

/** A grouped list section, edge to edge with hairlines above and below, like iOS's plain grouped tables. */
export function Section({ header, headerValue, title, footer, children, style, inset = layout.margin }: SectionProps) {
  const c = useColors();
  const rows = Children.toArray(children).filter((child) => isValidElement(child));
  return (
    <View style={[styles.section, style]}>
      {title}
      {header ? (
        <View style={styles.header}>
          <Text variant="footnote" color="secondary" numberOfLines={1} style={styles.headerText}>
            {header.toUpperCase()}
          </Text>
          {headerValue ? (
            <Text variant="footnote" color="secondary" tabular numberOfLines={1}>
              {headerValue}
            </Text>
          ) : null}
        </View>
      ) : null}
      {rows.length > 0 ? (
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.separator }]}>
          {rows.map((row, i) => (
            <Fragment key={(isValidElement(row) && row.key) || i}>
              {i > 0 ? (
                <View style={[styles.separator, { marginLeft: inset, backgroundColor: c.separator }]} />
              ) : null}
              {row}
            </Fragment>
          ))}
        </View>
      ) : null}
      {typeof footer === 'string' ? (
        <Text variant="footnote" color="secondary" style={styles.footer}>
          {footer}
        </Text>
      ) : (
        footer
      )}
    </View>
  );
}

interface RowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  detail?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  /** Something on the right instead of a value, e.g. a Switch. */
  accessory?: ReactNode;
  /** Something on the left, e.g. an icon. */
  leading?: ReactNode;
  titleColor?: 'text' | 'tint' | 'down' | 'secondary';
  disabled?: boolean;
  /** Center the title (for action rows like "Delete Account"). */
  centered?: boolean;
  accessibilityLabel?: string;
}

export function Row({
  title,
  subtitle,
  value,
  detail,
  onPress,
  chevron,
  accessory,
  leading,
  titleColor = 'text',
  disabled,
  centered,
  accessibilityLabel,
}: RowProps) {
  const c = useColors();
  const showChevron = chevron ?? (!!onPress && !centered);
  const content = (
    <>
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      <View style={[styles.main, centered && styles.centered]}>
        {typeof title === 'string' ? (
          <Text variant="body" color={titleColor} numberOfLines={1} style={centered ? styles.centeredText : null}>
            {title}
          </Text>
        ) : (
          title
        )}
        {typeof subtitle === 'string' ? (
          <Text variant="subheadline" color="secondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : (
          subtitle
        )}
      </View>
      {value != null || detail != null ? (
        <View style={styles.trailing}>
          {typeof value === 'string' ? (
            <Text variant="body" color={onPress && !detail ? 'secondary' : 'text'} tabular numberOfLines={1}>
              {value}
            </Text>
          ) : (
            value
          )}
          {typeof detail === 'string' ? (
            <Text variant="subheadline" color="secondary" tabular numberOfLines={1}>
              {detail}
            </Text>
          ) : (
            detail
          )}
        </View>
      ) : null}
      {accessory}
      {showChevron ? (
        <Icon name="chevron.right" size={13} weight="semibold" color={c.tertiary} style={styles.chevron} />
      ) : null}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, { minHeight: layout.rowHeight }]}>{content}</View>;
  }
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.row,
        { minHeight: layout.rowHeight },
        pressed && { backgroundColor: c.cardPressed },
        disabled && { opacity: 0.4 },
      ]}>
      {content}
    </Pressable>
  );
}

/** Large section header with an optional trailing value, like Health and Fitness use. */
export function SectionTitle({
  title,
  value,
  onPress,
}: {
  title: string;
  value?: ReactNode;
  onPress?: () => void;
}) {
  const c = useColors();
  const inner = (
    <>
      <Text variant="title3" weight="700" numberOfLines={1} style={styles.titleText}>
        {title}
      </Text>
      {onPress ? <Icon name="chevron.right" size={14} weight="bold" color={c.tertiary} /> : null}
      <View style={styles.titleSpacer} />
      {typeof value === 'string' ? (
        <Text variant="headline" color="secondary" tabular>
          {value}
        </Text>
      ) : (
        value
      )}
    </>
  );
  if (!onPress) return <View style={styles.titleRow}>{inner}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.titleRow, pressed && { opacity: 0.5 }]}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginHorizontal: layout.margin,
    marginBottom: 6,
  },
  headerText: {
    flex: 1,
  },
  footer: {
    marginHorizontal: layout.margin,
    marginTop: 6,
  },
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.margin,
    paddingVertical: 8,
    gap: 12,
  },
  leading: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  main: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  centered: {
    alignItems: 'center',
  },
  centeredText: {
    textAlign: 'center',
  },
  trailing: {
    alignItems: 'flex-end',
    gap: 1,
    flexShrink: 0,
    maxWidth: '60%',
  },
  chevron: {
    marginLeft: -4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: layout.margin,
    marginBottom: 6,
  },
  titleText: {
    flexShrink: 1,
  },
  titleSpacer: {
    flex: 1,
  },
});
