import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SFSymbol } from 'sf-symbols-typescript';

import { useColors } from '@/theme';

import { Icon } from './icon';
import { Text } from './text';

export function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: SFSymbol;
  title: string;
  message: string;
  children?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      <Icon name={icon} size={44} color={c.tertiary} />
      <Text variant="title2" align="center" style={styles.title}>
        {title}
      </Text>
      <Text variant="callout" color="secondary" align="center" style={styles.message}>
        {message}
      </Text>
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingTop: 70,
    paddingHorizontal: 32,
  },
  title: {
    marginTop: 18,
  },
  message: {
    marginTop: 8,
  },
  actions: {
    marginTop: 26,
    alignSelf: 'stretch',
  },
});
