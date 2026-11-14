import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';

import { LockGate } from '@/components/lock-gate';
import { useStackOptions } from '@/components/stack-options';
import { syncReminders, useReminderTaps } from '@/lib/notifications';
import { STORE_SHOTS } from '@/lib/store-shots';
import { flushSave, useStore } from '@/store';
import { startPro } from '@/store/pro';
import { hideSample } from '@/store/sample-hidden';
import { noteLaunch } from '@/store/review-prompt';
import { useSpotPriceRefresh } from '@/store/spot';
import { startSync } from '@/store/sync';
import { useColors } from '@/theme';

// The swipe rows' library (Gesture Handler's Swipeable) reads its own animated
// values while drawing, which only trips Reanimated's strict-mode warning in
// development. It's harmless, so keep warnings but turn the strict check off.
configureReanimatedLogger({ level: ReanimatedLogLevel.warn, strict: false });

// App Store screenshot builds open filled with the sample, as real data.
if (STORE_SHOTS) {
  useStore.getState().loadSampleData(36);
  hideSample();
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const stackOptions = useStackOptions();
  useSpotPriceRefresh();

  useEffect(() => {
    noteLaunch();
    startPro();
    startSync();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushSave();
      // Top up the reminders each time the app comes back.
      else syncReminders(useStore.getState().settings.reminder);
    });
    return () => sub.remove();
  }, []);

  const reminder = useStore((s) => s.settings.reminder);
  useEffect(() => {
    syncReminders(reminder);
  }, [reminder]);
  useReminderTaps();

  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.background, text: c.text },
  };

  const modal = { presentation: 'modal' as const };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={theme}>
        <Stack screenOptions={stackOptions}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="account-form" options={modal} />
          <Stack.Screen name="update" options={modal} />
          <Stack.Screen name="update-all" options={modal} />
          <Stack.Screen name="entry" options={modal} />
          <Stack.Screen name="category-form" options={modal} />
          <Stack.Screen name="spend-category-form" options={modal} />
          <Stack.Screen name="settings" options={{ ...modal, headerShown: false }} />
          <Stack.Screen name="pro" options={modal} />
          <Stack.Screen name="share" options={modal} />
          <Stack.Screen name="export" options={modal} />
          <Stack.Screen name="goal" options={modal} />
          <Stack.Screen name="spending-goal" options={modal} />
          <Stack.Screen name="emergency-fund" options={modal} />
          <Stack.Screen name="import" options={modal} />
        </Stack>
        <LockGate />
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
