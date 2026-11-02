import { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';

import { authenticate, systemAppLock } from '@/lib/auth';
import { useStore } from '@/store';
import { useColors } from '@/theme';

import { Button } from './button';
import { Icon } from './icon';
import { Text } from './text';

/**
 * When Plainworth's own lock is on (Android and older iPhones): covers the app until
 * unlocked, and hides balances from the app switcher preview. Newer iPhones use
 * the system's Require Face ID instead, even if the old setting was left on.
 */
export function LockGate() {
  const c = useColors();
  const required = useStore((s) => s.settings.requireUnlock) && !systemAppLock;
  const [locked, setLocked] = useState(required);
  const [covered, setCovered] = useState(false);
  const busy = useRef(false);

  const unlock = () => {
    if (busy.current) return;
    busy.current = true;
    authenticate('Unlock Plainworth').then((ok) => {
      busy.current = false;
      if (ok) setLocked(false);
    });
  };

  useEffect(() => {
    if (!required) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setCovered(false);
      } else {
        setCovered(true);
        // The Face ID prompt itself makes the app briefly inactive; only relock on a real background.
        if (state === 'background' && !busy.current) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [required]);

  // Ask right away whenever the app is showing and locked.
  useEffect(() => {
    if (!required || !locked || covered || AppState.currentState !== 'active' || busy.current) return;
    busy.current = true;
    authenticate('Unlock Plainworth').then((ok) => {
      busy.current = false;
      if (ok) setLocked(false);
    });
  }, [required, locked, covered]);

  if (!required || (!locked && !covered)) return null;

  return (
    <View style={[StyleSheet.absoluteFill, styles.cover, { backgroundColor: c.background }]}>
      <Icon name="lock.fill" size={40} color={c.secondary} />
      <Text variant="title3" style={styles.title}>
        Plainworth is locked
      </Text>
      {locked && !covered ? <Button title="Unlock" onPress={unlock} style={styles.button} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  title: {
    marginTop: 14,
  },
  button: {
    marginTop: 28,
    alignSelf: 'stretch',
    marginHorizontal: 48,
  },
});
