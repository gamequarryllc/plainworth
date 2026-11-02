import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { BigAmountInput } from '@/components/big-amount-input';
import { Change } from '@/components/change';
import { DateField } from '@/components/date-field';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { relativeDate } from '@/lib/dates';
import { haptics } from '@/lib/haptics';
import { liveCurrencySupported, metalName } from '@/lib/metals';
import { centsToInput, formatTyping, parseAmount, parseNumber } from '@/lib/money';
import { compareSnapshots } from '@/lib/networth';
import { useStore } from '@/store';
import { offerReminder } from '@/store/reminder-offer';
import { useSpotPrice } from '@/store/spot';
import { type, useColors } from '@/theme';

export default function UpdateBalanceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const account = useStore((s) => s.accounts.find((a) => a.id === id));
  const kind = useStore((s) => s.nwCategories.find((x) => x.id === account?.categoryId)?.kind);
  const snapshots = useStore((s) => s.snapshots);
  const currency = useStore((s) => s.settings.currency);
  const addSnapshots = useStore((s) => s.addSnapshots);

  const latest = snapshots
    .filter((s) => s.accountId === id)
    .sort(compareSnapshots)
    .pop();
  const unit = account?.unit;
  // Metal accounts take today's live price, so only the quantity needs typing.
  const live = account?.metal && liveCurrencySupported(currency) ? account.metal : undefined;
  const spot = useSpotPrice(live);

  const [text, setText] = useState('');
  const [qty, setQty] = useState(latest?.quantity != null ? formatTyping(String(latest.quantity), 6) : '');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  if (!account) return <Screen title="Update Balance" />;

  const quantity = parseNumber(qty);
  const typedPrice = price ? parseAmount(price) : null;
  /** What the price field falls back to: today's live price, else the last one entered. */
  const suggestedPrice = (live ? spot.price : null) ?? latest?.unitPrice ?? null;
  const unitPrice = typedPrice ?? suggestedPrice;
  const value = unit
    ? quantity != null && unitPrice != null
      ? Math.round(quantity * unitPrice)
      : null
    : parseAmount(text);
  const changed = value != null && (!unit || touched);
  const delta = value != null && latest ? value - latest.value : null;

  const save = () => {
    if (value == null) return;
    addSnapshots([
      {
        accountId: account.id,
        value,
        date: live ? today : date,
        note: note.trim() || undefined,
        ...(unit ? { quantity: quantity ?? undefined, unitPrice: unitPrice ?? undefined } : null),
        // A price nobody typed keeps following the market for the rest of the day.
        ...(live && typedPrice == null ? { source: 'spot' as const } : null),
      },
    ]);
    haptics.success();
    router.back();
    offerReminder();
  };

  const placeholder = latest ? formatTyping(centsToInput(latest.value)) : '0';

  return (
    <Screen
      form
      title={account.name}
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', disabled: !changed, onPress: save }]}>
      {unit ? (
        <BigAmountInput text={value != null ? formatTyping(centsToInput(value)) : ''} placeholder={placeholder} readOnly />
      ) : (
        <BigAmountInput text={text} onChangeText={setText} placeholder={placeholder} autoFocus />
      )}

      <View style={styles.status}>
        {delta != null && changed ? (
          <Change delta={delta} ratio={latest?.value ? delta / Math.abs(latest.value) : null} invert={kind === 'liability'} variant="callout" />
        ) : (
          <Text variant="callout" color="secondary">
            {latest ? `${money(latest.value)} · updated ${relativeDate(latest.date).toLowerCase()}` : 'First balance'}
          </Text>
        )}
      </View>

      {unit ? (
        <Section
          footer={
            live && typedPrice == null
              ? `Value is quantity × today’s ${metalName(live).toLowerCase()} price. Type a price to use your own.`
              : `Value is quantity × price per ${unit}.`
          }>
          <Row
            title={`Quantity (${unit})`}
            accessory={
              <TextInput
                value={qty}
                onChangeText={(t) => {
                  setQty(formatTyping(t, 6));
                  setTouched(true);
                }}
                placeholder="0"
                placeholderTextColor={c.tertiary}
                keyboardType="decimal-pad"
                autoFocus
                accessibilityLabel="Quantity"
                style={[styles.inline, { color: c.text }]}
              />
            }
          />
          <Row
            title={`Price per ${unit}`}
            accessory={
              <TextInput
                value={price}
                onChangeText={(t) => {
                  setPrice(formatTyping(t));
                  setTouched(true);
                }}
                placeholder={suggestedPrice != null ? formatTyping(centsToInput(suggestedPrice)) : '0.00'}
                placeholderTextColor={c.tertiary}
                keyboardType="decimal-pad"
                accessibilityLabel="Price per unit"
                style={[styles.inline, { color: c.text }]}
              />
            }
          />
        </Section>
      ) : null}

      <Section>
        {!live ? <Row title="Date" accessory={<DateField value={date} onChange={setDate} maximum={today} />} /> : null}
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: {
    alignItems: 'center',
    marginTop: -12,
  },
  inline: {
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
