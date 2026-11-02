import { createElement } from 'react';

import { type, useColors } from '@/theme';

interface Props {
  /** Minutes after midnight. */
  value: number;
  onChange: (value: number) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Browser preview: a plain time input. */
export function TimeField({ value, onChange }: Props) {
  const c = useColors();
  return createElement('input', {
    type: 'time',
    step: 300,
    value: `${pad(Math.floor(value / 60))}:${pad(value % 60)}`,
    onChange: (e: { target: { value: string } }) => {
      const [h, m] = e.target.value.split(':').map(Number);
      if (Number.isFinite(h) && Number.isFinite(m)) onChange(h * 60 + m);
    },
    style: {
      font: 'inherit',
      fontSize: type.body.fontSize,
      color: c.text,
      background: c.fill,
      border: 'none',
      borderRadius: 8,
      padding: '6px 10px',
      colorScheme: 'light dark',
    },
  });
}
