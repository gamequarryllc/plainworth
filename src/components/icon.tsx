import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useColors } from '@/theme';

type MaterialName = Extract<SymbolViewProps['name'], { android?: unknown }>['android'];

/** SF Symbols on iOS, Material Symbols on Android and web. */
const MATERIAL: Partial<Record<SFSymbol, MaterialName>> = {
  plus: 'add',
  minus: 'remove',
  'plus.circle.fill': 'add_circle',
  'chevron.right': 'chevron_right',
  'chevron.left': 'chevron_left',
  'chevron.up': 'keyboard_arrow_up',
  'chevron.down': 'keyboard_arrow_down',
  'chevron.up.chevron.down': 'unfold_more',
  checkmark: 'check',
  xmark: 'close',
  eye: 'visibility',
  'eye.slash': 'visibility_off',
  ellipsis: 'more_horiz',
  'ellipsis.circle': 'more_horiz',
  trash: 'delete',
  pencil: 'edit',
  flag: 'flag',
  'square.and.pencil': 'edit_square',
  'arrow.clockwise': 'refresh',
  'arrow.up.arrow.down': 'swap_vert',
  'arrow.uturn.backward': 'undo',
  lock: 'lock',
  person: 'person',
  'person.crop.circle': 'account_circle',
  'person.2': 'group',
  icloud: 'cloud',
  'lock.fill': 'lock',
  'lock.shield.fill': 'shield_lock',
  'arrow.up.right': 'arrow_outward',
  faceid: 'face',
  calendar: 'calendar_month',
  'chart.line.uptrend.xyaxis': 'show_chart',
  'chart.bar': 'bar_chart',
  'chart.bar.fill': 'bar_chart',
  'chart.pie': 'pie_chart',
  'chart.pie.fill': 'pie_chart',
  creditcard: 'credit_card',
  'creditcard.fill': 'credit_card',
  gearshape: 'settings',
  'gearshape.fill': 'settings',
  'list.bullet': 'list',
  'list.number': 'format_list_numbered',
  'rectangle.stack': 'layers',
  folder: 'folder',
  'archivebox': 'inventory_2',
  'tray.and.arrow.down': 'move_to_inbox',
  'doc.on.doc': 'content_copy',
  'square.and.arrow.down': 'download',
  'square.and.arrow.up': 'ios_share',
  'dollarsign.circle': 'paid',
  'chart.bar.xaxis': 'bar_chart',
  'hand.draw': 'gesture',
  tablecells: 'table',
  'checkmark.seal.fill': 'verified',
  doc: 'description',
  'doc.fill': 'description',
  'building.columns': 'account_balance',
  banknote: 'payments',
  'arrow.left.arrow.right': 'swap_horiz',
  checklist: 'checklist',
  sparkles: 'auto_awesome',
};

export interface IconProps {
  name: SFSymbol;
  size?: number;
  color?: ColorValue;
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 20, color, weight = 'regular', style }: IconProps) {
  const c = useColors();
  return (
    <SymbolView
      name={{ ios: name, android: MATERIAL[name] ?? 'circle', web: MATERIAL[name] ?? 'circle' }}
      size={size}
      tintColor={color ?? c.text}
      weight={weight}
      resizeMode="scaleAspectFit"
      style={style}
    />
  );
}
