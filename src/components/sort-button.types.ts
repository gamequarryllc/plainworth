import type { NWSort } from '@/lib/types';

export interface SortButtonProps {
  value: NWSort;
  onChange: (sort: NWSort) => void;
}
