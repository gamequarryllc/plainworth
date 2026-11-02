import { Alert } from 'react-native';

export function confirm(opts: {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirmLabel,
          style: opts.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

export function notify(title: string, message?: string) {
  Alert.alert(title, message);
}

/** Several choices plus Cancel. Resolves to the chosen index, or null for Cancel. */
export function choose(opts: {
  title: string;
  message?: string;
  options: { label: string; destructive?: boolean }[];
}): Promise<number | null> {
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        ...opts.options.map((o, i) => ({
          text: o.label,
          style: o.destructive ? ('destructive' as const) : ('default' as const),
          onPress: () => resolve(i),
        })),
        { text: 'Cancel', style: 'cancel' as const, onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) },
    );
  });
}
