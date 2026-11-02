import { Stack, useNavigation } from 'expo-router';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  Keyboard,
  LayoutAnimation,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { layout, useColors } from '@/theme';

import { HeaderActions, InlineHeaderButtons, type HeaderItem } from './header-actions';
import { Text } from './text';

interface ScreenProps {
  title?: string;
  /** Tab root screens use the large collapsing title. */
  large?: boolean;
  left?: HeaderItem[];
  right?: HeaderItem[];
  children?: ReactNode;
  scroll?: boolean;
  /** Pull down to refresh. */
  onRefresh?: () => Promise<void>;
  /** The screen has text fields: make room for the keyboard and keep the field being typed in above it. */
  form?: boolean;
}

const isWeb = Platform.OS === 'web';

const ScrollLock = createContext<(locked: boolean) => void>(() => {});

/**
 * Lets something inside a screen, like a chart being dragged, stop the page
 * from scrolling until the finger lifts.
 */
export function useScrollLock() {
  return useContext(ScrollLock);
}

export function Screen({ title, large, left, right, children, scroll = true, onRefresh, form }: ScreenProps) {
  const c = useColors();
  const [refreshing, setRefreshing] = useState(false);
  const [locked, setLocked] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrollY = useRef(0);
  const keyboardRoom = useKeyboardRoom(!!form && scroll, scrollRef, scrollY);
  const refresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
  };
  // The browser preview has no native large titles, so draw one in the content.
  const inlineTitle = isWeb && large;
  return (
    <>
      <Stack.Screen options={{ ...(title != null ? { title } : null), ...(inlineTitle ? { headerShown: false } : null) }} />
      {!inlineTitle ? <HeaderActions left={left} right={right} /> : null}
      {scroll ? (
        <ScrollLock.Provider value={setLocked}>
          <ScrollView
            ref={scrollRef}
            scrollEnabled={!locked}
            style={{ flex: 1, backgroundColor: c.background }}
            contentContainerStyle={styles.content}
            contentInsetAdjustmentBehavior="automatic"
            // React Native's own keyboard handling scrolls the page up under the
            // title bar when the keyboard opens, so forms make room themselves.
            automaticallyAdjustKeyboardInsets={false}
            scrollToOverflowEnabled={form}
            onScroll={form ? onScroll : undefined}
            scrollEventThrottle={form ? 16 : undefined}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} /> : undefined}>
            {inlineTitle ? <LargeTitle title={title ?? ''} left={left} right={right} /> : null}
            {children}
            {keyboardRoom > 0 ? <View style={{ height: keyboardRoom }} /> : null}
          </ScrollView>
        </ScrollLock.Provider>
      ) : (
        <View style={{ flex: 1, backgroundColor: c.background }}>{children}</View>
      )}
    </>
  );
}

/**
 * Space under a form for the keyboard, so every field can be scrolled above
 * it, and a scroll that brings the field being typed in into view when the
 * keyboard would cover it. iOS only: Android resizes the window instead.
 */
function useKeyboardRoom(
  enabled: boolean,
  scrollRef: RefObject<ScrollViewInstance | null>,
  scrollY: RefObject<number>,
): number {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState(0);
  const bottomInset = insets.bottom;

  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios') return;
    // Only the screen in front reacts, not one waiting under a sheet.
    const subs = [
      Keyboard.addListener('keyboardWillShow', (e) => {
        if (navigation.isFocused()) setRoom(Math.max(0, e.endCoordinates.height - bottomInset));
      }),
      Keyboard.addListener('keyboardDidShow', (e) => {
        if (!navigation.isFocused()) return;
        const input = TextInput.State.currentlyFocusedInput();
        input?.measureInWindow((_x, y, _width, height) => {
          const covered = y + height + 16 - e.endCoordinates.screenY;
          if (covered > 0) scrollRef.current?.scrollTo({ y: scrollY.current + covered, animated: true });
        });
      }),
      Keyboard.addListener('keyboardWillHide', (e) => {
        // Shrink along with the keyboard. A sheet that's closing just lets go.
        if (e.duration && navigation.isFocused()) {
          LayoutAnimation.configureNext({
            duration: e.duration,
            update: { duration: e.duration, type: LayoutAnimation.Types[e.easing] ?? LayoutAnimation.Types.keyboard },
          });
        }
        setRoom(0);
      }),
    ];
    return () => subs.forEach((s) => s.remove());
  }, [enabled, navigation, bottomInset, scrollRef, scrollY]);

  return room;
}

/** The buttons in a row along the top, as in the iOS navigation bar, with the title below. */
function LargeTitle({ title, left, right }: { title: string; left?: HeaderItem[]; right?: HeaderItem[] }) {
  return (
    <View style={styles.largeTitle}>
      <View style={styles.titleBar}>
        {left?.length ? <InlineHeaderButtons items={left} /> : <View />}
        {right?.length ? <InlineHeaderButtons items={right} /> : null}
      </View>
      <Text variant="largeTitle" numberOfLines={1}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: isWeb ? 110 : 40,
  },
  largeTitle: {
    paddingHorizontal: layout.margin,
    paddingTop: 8,
    paddingBottom: 4,
  },
  titleBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 40,
    marginHorizontal: -8,
    marginBottom: 6,
  },
});
