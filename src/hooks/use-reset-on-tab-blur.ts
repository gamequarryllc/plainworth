import { useNavigation, useRoute } from 'expo-router';
import { useEffect } from 'react';

/**
 * For a tab's stack layout: when the user switches to another tab, go back to
 * the tab's first screen, so coming back opens Spending (not last January).
 */
export function useResetOnTabBlur() {
  const navigation = useNavigation();
  const route = useRoute();

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        const tab = navigation.getState()?.routes.find((r) => r.key === route.key);
        const stack = tab?.state;
        if (stack?.key && (stack.index ?? 0) > 0) {
          navigation.dispatch({ type: 'POP_TO_TOP', target: stack.key });
        }
      }),
    [navigation, route.key],
  );
}
