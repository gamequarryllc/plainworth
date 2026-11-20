import { router } from 'expo-router';
import { useState } from 'react';

import { Row, Section } from '@/components/list';
import { ReorderButtons } from '@/components/reorder-buttons';
import { useSampleGuard } from '@/components/sample';
import { Screen } from '@/components/screen';
import { GROUPS } from '@/lib/spending';
import { useStore } from '@/store';

export default function SpendCategoriesScreen() {
  const categories = useStore((s) => s.spendCategories);
  const moveSpendCategory = useStore((s) => s.moveSpendCategory);
  const [reordering, setReordering] = useState(false);
  // The sample's categories can be looked at, not changed.
  const guard = useSampleGuard();

  return (
    <Screen
      title="Spending Categories"
      right={[
        {
          label: reordering ? 'Done' : 'Reorder',
          icon: reordering ? 'checkmark' : 'arrow.up.arrow.down',
          variant: reordering ? 'done' : 'plain',
          onPress: guard(() => setReordering((v) => !v)),
        },
        { label: 'Add Category', icon: 'plus', onPress: guard(() => router.push('/spend-category-form')) },
      ]}>
      {GROUPS.map((group) => {
        const list = categories.filter((x) => x.group === group.key).sort((a, b) => a.order - b.order);
        return (
          <Section key={group.key} header={group.title}>
            {list.map((cat, i) => (
              <Row
                key={cat.id}
                title={cat.name}
                value={cat.hidden ? 'Hidden' : undefined}
                chevron={!reordering}
                accessory={
                  reordering ? (
                    <ReorderButtons
                      canUp={i > 0}
                      canDown={i < list.length - 1}
                      onUp={() => moveSpendCategory(cat.id, -1)}
                      onDown={() => moveSpendCategory(cat.id, 1)}
                    />
                  ) : null
                }
                onPress={
                  reordering ? undefined : guard(() => router.push({ pathname: '/spend-category-form', params: { id: cat.id } }))
                }
              />
            ))}
            <Row
              title={`Add ${group.key === 'income' ? 'Income Source' : 'Category'}`}
              titleColor="tint"
              chevron={false}
              onPress={guard(() => router.push({ pathname: '/spend-category-form', params: { group: group.key } }))}
            />
          </Section>
        );
      })}
    </Screen>
  );
}
