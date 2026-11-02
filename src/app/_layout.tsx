import '@/global.css';

import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LockGate } from '@/components/lock-gate';
import { useStackOptions } from '@/components/stack-options';
import { flushSave } from '@/store';
import { startPro } from '@/store/pro';
import { useSpotPriceRefresh } from '@/store/spot';
import { useColors } from '@/theme';

export default function RootLayout() {
  const scheme = useColorScheme();
  const c = useColors();
  const stackOptions = useStackOptions();
  useSpotPriceRefresh();

  useEffect(() => {
    startPro();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') flushSave();
    });
    return () => sub.remove();
  }, []);

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
        </Stack>
        <LockGate />
        <StatusBar style="auto" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
