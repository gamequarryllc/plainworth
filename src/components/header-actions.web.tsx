import { Stack } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { layout, useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';
import { isGroup, type HeaderActionsProps, type HeaderItem, type MenuAction, type MenuItem } from './header-actions.types';

export type { HeaderItem, MenuItem } from './header-actions.types';

/** Browser preview stand-in for the native toolbar buttons and pull-down menus. */
export function InlineHeaderButtons({ items }: { items: HeaderItem[] }) {
  const c = useColors();
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  return (
    <View style={styles.row}>
      {items.map((item, i) => (
        <Pressable
          key={i}
          onPress={item.menu ? () => setMenu(item.menu!) : item.onPress}
          disabled={item.disabled}
          accessibilityRole="button"
          accessibilityLabel={item.label}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: c.fill },
            pressed && { opacity: 0.5 },
            item.disabled ? { opacity: 0.35 } : null,
          ]}>
          {item.icon || item.menu ? (
            <Icon name={item.icon ?? 'ellipsis'} size={18} color={item.variant === 'done' ? c.tint : c.text} />
          ) : (
            <Text variant="subheadline" weight="600" color={item.variant === 'done' ? 'tint' : 'text'}>
              {item.label}
            </Text>
          )}
        </Pressable>
      ))}
      <Modal visible={!!menu} transparent animationType="fade" onRequestClose={() => setMenu(null)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(null)}>
          <View style={[styles.menu, { backgroundColor: c.elevated }]}>
            {menu ? <MenuList items={menu} close={() => setMenu(null)} /> : null}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

/**
 * The menu's rows. Submenus and sections show as headed groups, since the
 * preview only needs to show what's in them.
 */
function MenuList({ items, close }: { items: MenuItem[]; close: () => void }) {
  const c = useColors();
  const rows: { action?: MenuAction; heading?: string; gap?: boolean }[] = [];
  const add = (list: MenuItem[]) => {
    for (const item of list) {
      if (isGroup(item)) {
        rows.push({ gap: true, heading: item.label });
        add(item.items);
        rows.push({ gap: true });
      } else {
        rows.push({ action: item });
      }
    }
  };
  add(items);
  // Headings stay; a plain gap only goes between two actions.
  const tidy = rows.filter(
    (r, i) => !r.gap || !!r.heading || (i > 0 && i < rows.length - 1 && !rows[i - 1].gap && !rows[i + 1].gap),
  );
  // Leave room for checkmarks if any option has one.
  const anyChecks = tidy.some((x) => x.action?.isOn != null);
  return (
    <>
      {tidy.map((r, i) => {
        if (r.gap) {
          return (
            <View key={i} style={[styles.gap, { backgroundColor: c.background }]}>
              {r.heading ? (
                <Text variant="footnote" color="secondary" style={styles.heading}>
                  {r.heading}
                </Text>
              ) : null}
            </View>
          );
        }
        const m = r.action!;
        return (
          <Pressable
            key={i}
            onPress={() => {
              close();
              m.onPress();
            }}
            accessibilityRole="menuitem"
            accessibilityState={m.isOn != null ? { checked: m.isOn } : undefined}
            style={({ pressed }) => [
              styles.menuItem,
              i > 0 && !tidy[i - 1].gap && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
              pressed && { backgroundColor: c.cardPressed },
            ]}>
            {anyChecks ? (
              <View style={styles.check}>
                {m.isOn ? <Icon name="checkmark" size={15} weight="semibold" color={c.text} /> : null}
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              <Text color={m.destructive ? 'down' : 'text'}>{m.label}</Text>
              {m.subtitle ? (
                <Text variant="footnote" color="secondary">
                  {m.subtitle}
                </Text>
              ) : null}
            </View>
            {m.icon ? <Icon name={m.icon} size={18} color={m.destructive ? c.down : c.text} /> : null}
          </Pressable>
        );
      })}
    </>
  );
}

export function HeaderActions({ left, right }: HeaderActionsProps) {
  return (
    <>
      {left?.length ? (
        <Stack.Toolbar placement="left" asChild>
          <InlineHeaderButtons items={left} />
        </Stack.Toolbar>
      ) : null}
      {right?.length ? (
        <Stack.Toolbar placement="right" asChild>
          <InlineHeaderButtons items={right} />
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 8,
  },
  button: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: 10,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    flex: 1,
    alignItems: 'flex-end',
    paddingTop: 56,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  menu: {
    width: 270,
    borderRadius: Math.min(layout.radius, 14),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 12,
  },
  check: {
    width: 15,
    marginRight: -4,
  },
  gap: {
    minHeight: 8,
  },
  heading: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
});
