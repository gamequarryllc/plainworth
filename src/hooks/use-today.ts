import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { todayKey } from '@/lib/dates';

/** Today's date, refreshed when the app comes back to the foreground. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(todayKey());
    });
    return () => sub.remove();
  }, []);
  return today;
}
