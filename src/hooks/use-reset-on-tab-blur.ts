import { useNavigation, useRoute } from 'expo-router';
import { useEffect } from 'react';

/**
 * For a tab's stack layout: when the user switches to another tab, go back to
 * the tab's first screen, so coming back opens Spending (not last January).
 *
 * A tab also gets a blur event when a sheet (a root modal such as New
 * Category) opens over it. That must not reset the stack, or closing the
 * sheet lands on the tab's first screen instead of where the user was.
 */
export function useResetOnTabBlur() {
  const navigation = useNavigation();
  const route = useRoute();

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        const tabs = navigation.getState();
        if (!tabs) return;
        // Still the selected tab: something opened on top, not a tab switch.
        if (tabs.routes[tabs.index]?.key === route.key) return;
        const stack = tabs.routes.find((r) => r.key === route.key)?.state;
        if (stack?.key && (stack.index ?? 0) > 0) {
          navigation.dispatch({ type: 'POP_TO_TOP', target: stack.key });
        }
      }),
    [navigation, route.key],
  );
}
