import { Stack } from 'expo-router';

import { isGroup, type HeaderActionsProps, type HeaderItem, type MenuItem } from './header-actions.types';

export type { HeaderItem, MenuItem } from './header-actions.types';

function renderMenuItem(m: MenuItem, i: number) {
  if (isGroup(m)) {
    return (
      <Stack.Toolbar.Menu key={i} title={m.label || undefined} icon={m.icon} inline={m.inline}>
        {m.items.map(renderMenuItem)}
      </Stack.Toolbar.Menu>
    );
  }
  return (
    <Stack.Toolbar.MenuAction
      key={i}
      icon={m.icon}
      subtitle={m.subtitle}
      isOn={m.isOn}
      destructive={m.destructive}
      onPress={m.onPress}>
      {m.label}
    </Stack.Toolbar.MenuAction>
  );
}

function renderItem(item: HeaderItem, i: number) {
  if (item.menu) {
    return (
      <Stack.Toolbar.Menu key={i} icon={item.icon ?? 'ellipsis'} accessibilityLabel={item.label}>
        {item.menu.map(renderMenuItem)}
      </Stack.Toolbar.Menu>
    );
  }
  return (
    <Stack.Toolbar.Button
      key={i}
      icon={item.icon}
      onPress={item.onPress}
      disabled={item.disabled}
      variant={item.variant === 'done' ? 'done' : 'plain'}
      accessibilityLabel={item.label}>
      {item.icon ? undefined : item.label}
    </Stack.Toolbar.Button>
  );
}

/** Native navigation bar buttons (Liquid Glass on iOS 26). */
export function HeaderActions({ left, right }: HeaderActionsProps) {
  return (
    <>
      {left?.length ? <Stack.Toolbar placement="left">{left.map(renderItem)}</Stack.Toolbar> : null}
      {right?.length ? <Stack.Toolbar placement="right">{right.map(renderItem)}</Stack.Toolbar> : null}
    </>
  );
}

/** Only used by the browser preview. */
export function InlineHeaderButtons(_: { items: HeaderItem[] }) {
  return null;
}
