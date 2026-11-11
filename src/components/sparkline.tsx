import { useId } from 'react';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import type { SeriesPoint } from '@/lib/networth';

export const SPARKLINE_WIDTH = 52;
const HEIGHT = 30;
const PAD = 2;

/** A tiny trend line for list rows, like the ones in Stocks. */
export function Sparkline({ points, color, from }: { points: SeriesPoint[]; color: string; from?: number }) {
  const gradientId = `spark${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const width = SPARKLINE_WIDTH;
  if (points.length === 0) return <Svg width={width} height={HEIGHT} />;

  // As on the big chart: flat at zero from the start of the range until the first entry.
  const lead = from != null && from < points[0].day ? from : null;
  const minDay = lead ?? points[0].day;
  const spanX = points[points.length - 1].day - minDay || 1;
  let min = lead != null ? 0 : Infinity;
  let max = lead != null ? 0 : -Infinity;
  for (const p of points) {
    min = Math.min(min, p.value);
    max = Math.max(max, p.value);
  }
  const spanY = max - min;
  const innerH = HEIGHT - PAD * 2;
  const y = (v: number) => (spanY === 0 ? HEIGHT / 2 : PAD + innerH - ((v - min) / spanY) * innerH);
  const coords = points.map((p) => [((p.day - minDay) / spanX) * width, y(p.value)] as const);
  if (lead != null) coords.unshift([0, y(0)], [coords[0][0], y(0)]);
  const line = coords.map(([x, yy], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yy.toFixed(1)}`).join('');
  const area = `${line}L${width},${HEIGHT}L0,${HEIGHT}Z`;

  return (
    <Svg width={width} height={HEIGHT}>
      <Defs>
        <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0.25} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      {spanY > 0 ? <Path d={area} fill={`url(#${gradientId})`} opacity={0.5} /> : null}
      <Path d={line} stroke={color} strokeWidth={1.4} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
