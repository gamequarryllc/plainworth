import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { DateField } from '@/components/date-field';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { formatDate } from '@/lib/dates';
import { confirm } from '@/lib/dialogs';
import { centsToInput, formatTyping, parseAmount, parseNumber } from '@/lib/money';
import { useStore } from '@/store';
import { type, useColors } from '@/theme';

/** Edit or delete a single balance entry. */
export default function EntryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const snap = useStore((s) => s.snapshots.find((x) => x.id === id));
  const account = useStore((s) => s.accounts.find((a) => a.id === snap?.accountId));
  const updateSnapshot = useStore((s) => s.updateSnapshot);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);

  const byQuantity = !!account?.unit && snap?.quantity != null;
  const [text, setText] = useState(snap ? formatTyping(centsToInput(snap.value)) : '');
  const [qty, setQty] = useState(snap?.quantity != null ? formatTyping(String(snap.quantity), 6) : '');
  const [price, setPrice] = useState(snap?.unitPrice != null ? formatTyping(centsToInput(snap.unitPrice)) : '');
  const [date, setDate] = useState(snap?.date ?? today);
  const [note, setNote] = useState(snap?.note ?? '');

  if (!snap || !account) return <Screen title="Entry" />;

  const quantity = parseNumber(qty);
  const unitPrice = parseAmount(price);
  const value = byQuantity
    ? quantity != null && unitPrice != null
      ? Math.round(quantity * unitPrice)
      : null
    : parseAmount(text);

  const save = () => {
    if (value == null) return;
    updateSnapshot(snap.id, {
      value,
      date,
      note: note.trim() || undefined,
      ...(byQuantity ? { quantity: quantity ?? undefined, unitPrice: unitPrice ?? undefined } : null),
      // An edited price is now yours, so the live price no longer replaces it.
      ...(snap.source && (unitPrice !== snap.unitPrice || !byQuantity) ? { source: undefined } : null),
    });
    router.back();
  };

  const remove = async () => {
    const ok = await confirm({
      title: 'Delete this entry?',
      message: `${money(snap.value)} on ${formatDate(snap.date)}. Charts and totals will use the entries that remain.`,
      confirmLabel: 'Delete Entry',
      destructive: true,
    });
    if (ok) {
      router.back();
      deleteSnapshot(snap.id);
    }
  };

  const numeric = [styles.numeric, { color: c.text }];

  return (
    <Screen
      form
      title={account.name}
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', disabled: value == null, onPress: save }]}>
      <Section footer={byQuantity && value != null ? `Value: ${money(value)}` : undefined}>
        {byQuantity ? (
          <Row
            title={`Quantity (${account.unit})`}
            accessory={
              <TextInput
                value={qty}
                onChangeText={(t) => setQty(formatTyping(t, 6))}
                keyboardType="decimal-pad"
                accessibilityLabel="Quantity"
                style={numeric}
              />
            }
          />
        ) : null}
        {byQuantity ? (
          <Row
            title={`Price per ${account.unit}`}
            accessory={
              <TextInput
                value={price}
                onChangeText={(t) => setPrice(formatTyping(t))}
                keyboardType="decimal-pad"
                accessibilityLabel="Price per unit"
                style={numeric}
              />
            }
          />
        ) : null}
        {!byQuantity ? (
          <Row
            title="Balance"
            accessory={
              <TextInput
                value={text}
                onChangeText={(t) => setText(formatTyping(t))}
                keyboardType="decimal-pad"
                accessibilityLabel="Balance"
                style={numeric}
              />
            }
          />
        ) : null}
        <Row title="Date" accessory={<DateField value={date} onChange={setDate} maximum={today} />} />
        <Row
          title={
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional)"
              placeholderTextColor={c.tertiary}
              style={[styles.note, { color: c.text }]}
            />
          }
        />
      </Section>
      <Section>
        <Row title="Delete Entry" titleColor="down" centered onPress={remove} />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  numeric: {
    fontSize: type.body.fontSize,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    width: 140,
    paddingVertical: 6,
  },
  note: {
    fontSize: type.body.fontSize,
    paddingVertical: 4,
  },
});
