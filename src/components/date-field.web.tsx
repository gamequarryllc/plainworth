import { createElement } from 'react';

import type { DateKey } from '@/lib/types';
import { type, useColors } from '@/theme';

interface Props {
  value: DateKey;
  onChange: (value: DateKey) => void;
  maximum?: DateKey;
}

/** Browser preview: a plain date input. */
export function DateField({ value, onChange, maximum }: Props) {
  const c = useColors();
  return createElement('input', {
    type: 'date',
    value,
    max: maximum,
    onChange: (e: { target: { value: string } }) => e.target.value && onChange(e.target.value),
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
