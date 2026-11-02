import { router } from 'expo-router';
import { useState } from 'react';

import { Row, Section } from '@/components/list';
import { ReorderButtons } from '@/components/reorder-buttons';
import { Screen } from '@/components/screen';
import type { CategoryKind } from '@/lib/types';
import { useStore } from '@/store';

const KINDS: { kind: CategoryKind; title: string }[] = [
  { kind: 'asset', title: 'Assets' },
  { kind: 'liability', title: 'Liabilities' },
];

export default function NetWorthCategoriesScreen() {
  const categories = useStore((s) => s.nwCategories);
  const accounts = useStore((s) => s.accounts);
  const moveNWCategory = useStore((s) => s.moveNWCategory);
  const [reordering, setReordering] = useState(false);

  return (
    <Screen
      title="Net Worth Categories"
      right={[
        {
          label: reordering ? 'Done' : 'Reorder',
          icon: reordering ? 'checkmark' : 'arrow.up.arrow.down',
          variant: reordering ? 'done' : 'plain',
          onPress: () => setReordering((v) => !v),
        },
        { label: 'Add Category', icon: 'plus', onPress: () => router.push('/category-form') },
      ]}>
      {KINDS.map(({ kind, title }) => {
        const list = categories.filter((x) => x.kind === kind).sort((a, b) => a.order - b.order);
        return (
          <Section key={kind} header={title}>
            {list.map((cat, i) => {
              const count = accounts.filter((a) => a.categoryId === cat.id).length;
              return (
                <Row
                  key={cat.id}
                  title={cat.name}
                  subtitle={count ? `${count} ${count === 1 ? 'account' : 'accounts'}` : undefined}
                  chevron={!reordering}
                  accessory={
                    reordering ? (
                      <ReorderButtons
                        canUp={i > 0}
                        canDown={i < list.length - 1}
                        onUp={() => moveNWCategory(cat.id, -1)}
                        onDown={() => moveNWCategory(cat.id, 1)}
                      />
                    ) : null
                  }
                  onPress={reordering ? undefined : () => router.push({ pathname: '/category-form', params: { id: cat.id } })}
                />
              );
            })}
            <Row
              title={`Add ${kind === 'asset' ? 'Asset' : 'Liability'} Category`}
              titleColor="tint"
              chevron={false}
              onPress={() => router.push({ pathname: '/category-form', params: { kind } })}
            />
          </Section>
        );
      })}
    </Screen>
  );
}
