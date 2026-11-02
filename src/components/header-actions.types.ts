import type { SFSymbol } from 'sf-symbols-typescript';

export interface MenuAction {
  label: string;
  icon?: SFSymbol;
  /** A second line under the label. */
  subtitle?: string;
  destructive?: boolean;
  /** Shows a checkmark, for options that are on or picked. */
  isOn?: boolean;
  onPress: () => void;
}

/** A group of actions inside a menu: a submenu, or with `inline`, a section set off by separators. */
export interface MenuGroup {
  /** Shown on the submenu's row, or as a small heading over an inline section. */
  label?: string;
  icon?: SFSymbol;
  inline?: boolean;
  items: MenuItem[];
}

export type MenuItem = MenuAction | MenuGroup;

export function isGroup(item: MenuItem): item is MenuGroup {
  return 'items' in item;
}

export interface HeaderItem {
  /** Text for the button (shown on web, read by VoiceOver). */
  label: string;
  icon?: SFSymbol;
  onPress?: () => void;
  /** `done` draws the confirm button in the accent color. */
  variant?: 'plain' | 'done';
  disabled?: boolean;
  /** Turns the button into a pull-down menu. */
  menu?: MenuItem[];
}

export interface HeaderActionsProps {
  left?: HeaderItem[];
  right?: HeaderItem[];
}
