import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput } from 'react-native';

import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { confirm } from '@/lib/dialogs';
import { GROUPS } from '@/lib/spending';
import type { SpendGroup } from '@/lib/types';
import { useStore } from '@/store';
import { type, useColors } from '@/theme';

/** Add (?group=) or edit (?id=) a spending category. */
export default function SpendCategoryFormScreen() {
  const params = useLocalSearchParams<{ id?: string; group?: SpendGroup }>();
  const c = useColors();
  const existing = useStore((s) => s.spendCategories.find((x) => x.id === params.id));
  const usedMonths = useStore((s) =>
    params.id ? Object.values(s.spend).filter((entries) => !!entries[params.id!]).length : 0,
  );
  const addSpendCategory = useStore((s) => s.addSpendCategory);
  const updateSpendCategory = useStore((s) => s.updateSpendCategory);
  const deleteSpendCategory = useStore((s) => s.deleteSpendCategory);
  const [name, setName] = useState(existing?.name ?? '');
  const [group, setGroup] = useState<SpendGroup>(existing?.group ?? params.group ?? 'variable');
  const [hidden, setHidden] = useState(existing?.hidden ?? false);
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    if (existing) updateSpendCategory(existing.id, { name: name.trim(), group, hidden });
    else addSpendCategory({ name, group });
    router.back();
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: `Delete ${existing.name}?`,
      message: usedMonths
        ? `It has amounts in ${usedMonths} ${usedMonths === 1 ? 'month' : 'months'}, and those will be removed from your totals. To keep them, turn off Track in New Months instead.`
        : undefined,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (ok) {
      router.back();
      deleteSpendCategory(existing.id);
    }
  };

  return (
    <Screen
      form
      title={existing ? 'Edit Category' : 'New Category'}
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', disabled: !valid, onPress: save }]}>
      <Section>
        <Row
          title={
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Category name"
              placeholderTextColor={c.tertiary}
              autoFocus={!existing}
              style={[styles.input, { color: c.text }]}
            />
          }
        />
      </Section>
      <Section
        header="Group"
        footer="Recurring is for fixed monthly bills. Spending is everything that varies. Income is money coming in.">
        <Row
          title={
            <Segmented
              options={GROUPS.map((g) => ({ value: g.key, label: g.title }))}
              value={group}
              onChange={setGroup}
              style={styles.segmented}
            />
          }
        />
      </Section>
      {existing ? (
        <>
          <Section footer="Turn this off when you’re done with a category, like paying a friend back. It stops showing up in new months, and months that already use it keep their amounts.">
            <Row title="Track in New Months" accessory={<Switch value={!hidden} onValueChange={(on) => setHidden(!on)} />} />
          </Section>
          <Section>
            <Row title="Delete Category" titleColor="down" centered onPress={remove} />
          </Section>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: type.body.fontSize,
    paddingVertical: 4,
  },
  segmented: {
    marginHorizontal: 0,
  },
});
