import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Segmented } from '@/components/segmented';
import { confirm, notify } from '@/lib/dialogs';
import type { CategoryKind } from '@/lib/types';
import { useStore } from '@/store';
import { type, useColors } from '@/theme';

/** Add (?kind=) or edit (?id=) a net worth category. */
export default function CategoryFormScreen() {
  const params = useLocalSearchParams<{ id?: string; kind?: CategoryKind }>();
  const c = useColors();
  const existing = useStore((s) => s.nwCategories.find((x) => x.id === params.id));
  const accountCount = useStore((s) => s.accounts.filter((a) => a.categoryId === params.id).length);
  const addNWCategory = useStore((s) => s.addNWCategory);
  const updateNWCategory = useStore((s) => s.updateNWCategory);
  const deleteNWCategory = useStore((s) => s.deleteNWCategory);
  const [name, setName] = useState(existing?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(existing?.kind ?? params.kind ?? 'asset');
  const valid = name.trim().length > 0;

  const save = () => {
    if (!valid) return;
    if (existing) updateNWCategory(existing.id, { name: name.trim(), kind });
    else addNWCategory({ name, kind });
    router.back();
  };

  const remove = async () => {
    if (!existing) return;
    if (accountCount > 0) {
      notify(
        `${existing.name} has accounts`,
        'Move its accounts to another category or delete them first.',
      );
      return;
    }
    const ok = await confirm({ title: `Delete ${existing.name}?`, confirmLabel: 'Delete', destructive: true });
    if (ok) {
      router.back();
      deleteNWCategory(existing.id);
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
        header="Type"
        footer={
          kind === 'liability'
            ? 'Liabilities are debts. Their balances are subtracted from your net worth.'
            : 'Assets add to your net worth.'
        }>
        <Row
          title={
            <Segmented
              options={[
                { value: 'asset', label: 'Asset' },
                { value: 'liability', label: 'Liability' },
              ]}
              value={kind}
              onChange={setKind}
              style={styles.segmented}
            />
          }
        />
      </Section>
      {existing ? (
        <Section>
          <Row title="Delete Category" titleColor="down" centered onPress={remove} />
        </Section>
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
