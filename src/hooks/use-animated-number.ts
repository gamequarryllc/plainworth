import { useEffect, useRef, useState } from 'react';

/**
 * Smoothly counts from the previous value to a new one (used for the big
 * balance so an update feels like something happened).
 */
export function useAnimatedNumber(target: number, duration = 650): number {
  const [shown, setShown] = useState(target);
  const fromRef = useRef(target);
  const shownRef = useRef(target);

  useEffect(() => {
    const from = shownRef.current;
    if (from === target) return;
    fromRef.current = from;
    const start = Date.now();
    let frame: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = t >= 1 ? target : Math.round(from + (target - from) * eased);
      shownRef.current = value;
      setShown(value);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);

  return shown;
}
