import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Switch, TextInput, View } from 'react-native';

import { DateField } from '@/components/date-field';
import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { useMoney } from '@/hooks/use-money';
import { useToday } from '@/hooks/use-today';
import { confirm, notify } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';
import { guessMetal, liveCurrencySupported, METALS, metalName } from '@/lib/metals';
import { centsToInput, formatTyping, parseAmount, parseNumber } from '@/lib/money';
import type { CategoryKind, Metal } from '@/lib/types';
import { useStore } from '@/store';
import { loadSpotPrice, useSpotPrice } from '@/store/spot';
import { type, useColors } from '@/theme';

const KIND_TITLES: Record<CategoryKind, string> = { asset: 'Assets', liability: 'Liabilities' };

/** Add a new account (?categoryId= to preselect) or edit one (?id=). */
export default function AccountFormScreen() {
  const params = useLocalSearchParams<{ id?: string; categoryId?: string }>();
  const c = useColors();
  const money = useMoney();
  const today = useToday();
  const categories = useStore((s) => s.nwCategories);
  const currency = useStore((s) => s.settings.currency);
  const existing = useStore((s) => s.accounts.find((a) => a.id === params.id));
  const addAccount = useStore((s) => s.addAccount);
  const updateAccount = useStore((s) => s.updateAccount);
  const isNew = !existing;

  const sorted = [...categories].sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === 'asset' ? -1 : 1));
  const [name, setName] = useState(existing?.name ?? '');
  const [categoryId, setCategoryId] = useState(
    existing?.categoryId ?? params.categoryId ?? sorted.find((x) => x.kind === 'asset')?.id ?? sorted[0]?.id,
  );
  const [pickCategory, setPickCategory] = useState(isNew && !params.categoryId);
  const [byQuantity, setByQuantity] = useState(!!existing?.unit);
  const [unit, setUnit] = useState(existing?.unit ?? 'oz');
  // A new account follows its name ("Silver" → silver) until a live price is picked by hand.
  const [metal, setMetal] = useState<Metal | undefined>(existing?.metal);
  const [metalPicked, setMetalPicked] = useState(!isNew);
  const [pickMetal, setPickMetal] = useState(false);
  const [balance, setBalance] = useState('');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [date, setDate] = useState(today);
  const [apr, setApr] = useState(existing?.apr != null ? String(existing.apr) : '');

  const category = categories.find((x) => x.id === categoryId);
  const isAsset = category?.kind !== 'liability';
  const liveMetal = isAsset ? (metalPicked ? metal : guessMetal(name)) : undefined;
  const tracksQuantity = byQuantity || !!liveMetal;
  const unitLabel = liveMetal ? 'oz' : unit.trim();
  /** The price fills itself in, so only the quantity is needed. */
  const autoPriced = !!liveMetal && liveCurrencySupported(currency);
  const spot = useSpotPrice(isNew && autoPriced ? liveMetal : undefined);

  const quantity = parseNumber(qty);
  const typedPrice = parseAmount(price);
  const unitPrice = typedPrice ?? (autoPriced ? spot.price : null);
  const valueAt = (perUnit: number | null) =>
    tracksQuantity ? (quantity != null && perUnit != null ? Math.round(quantity * perUnit) : null) : parseAmount(balance);
  const value = valueAt(unitPrice);
  const rate = apr.trim() ? parseNumber(apr) : null;
  const rateOk = !apr.trim() || (rate != null && rate >= 0 && rate <= 100);
  const valid = name.trim().length > 0 && !!category && (!tracksQuantity || unitLabel.length > 0) && (isAsset || rateOk);

  const chooseMetal = (next: Metal | undefined) => {
    haptics.selection();
    setMetal(next);
    setMetalPicked(true);
    setByQuantity(true);
    setPickMetal(false);
  };

  const save = async () => {
    if (!valid || !categoryId) return;
    const fields = {
      name: name.trim(),
      categoryId,
      unit: tracksQuantity ? unitLabel : undefined,
      metal: tracksQuantity ? liveMetal : undefined,
      apr: isAsset || rate == null ? undefined : rate,
    };
    if (existing) {
      updateAccount(existing.id, fields);
      router.back();
      return;
    }
    let perUnit = unitPrice;
    if (autoPriced && liveMetal && quantity != null && perUnit == null) {
      // Today's price hasn't arrived yet: give it one more try before asking for it.
      perUnit = await loadSpotPrice(liveMetal, currency, { force: true });
      if (perUnit == null) {
        notify(
          `Couldn’t get the ${metalName(liveMetal).toLowerCase()} price`,
          'Check your connection, or type the price per ounce yourself.',
        );
        return;
      }
    }
    const startValue = valueAt(perUnit);
    if (startValue == null) {
      const ok = await confirm({
        title: 'No balance entered',
        message: 'Add the account without a balance? You can update it any time.',
        confirmLabel: 'Add Account',
      });
      if (!ok) return;
    }
    addAccount({
      ...fields,
      initial:
        startValue != null
          ? {
              value: startValue,
              date: autoPriced ? today : date,
              ...(tracksQuantity ? { quantity: quantity ?? undefined, unitPrice: perUnit ?? undefined } : null),
              ...(autoPriced && typedPrice == null ? { source: 'spot' as const } : null),
            }
          : undefined,
    });
    haptics.success();
    router.back();
  };

  const input = [styles.input, { color: c.text }];
  const numeric = [styles.numeric, { color: c.text }];
  const metalLabel = liveMetal ? metalName(liveMetal).toLowerCase() : '';

  let quantityFooter: string | undefined;
  if (liveMetal) {
    quantityFooter = autoPriced
      ? `Follows today’s ${metalLabel} price on its own. You only enter how many troy ounces you have.`
      : `Live prices aren’t available in ${currency}, so enter the price per ounce yourself.`;
  } else if (tracksQuantity) {
    quantityFooter = `Enter how many ${unitLabel || 'units'} you hold and the price per ${unitLabel || 'unit'}. Good for shares or crypto.`;
  }

  let balanceFooter: string | undefined;
  if (tracksQuantity && value != null) {
    balanceFooter = `Value: ${money(value)}`;
  } else if (autoPriced && typedPrice == null && spot.status === 'loading') {
    balanceFooter = `Getting today’s ${metalLabel} price…`;
  } else if (autoPriced && typedPrice == null && spot.status === 'failed') {
    balanceFooter = `Couldn’t get today’s ${metalLabel} price. Type it in, or try again later.`;
  } else if (!tracksQuantity && category?.kind === 'liability') {
    balanceFooter = 'Enter what you owe as a positive number.';
  }

  return (
    <Screen
      form
      title={isNew ? 'New Account' : 'Edit Account'}
      left={[{ label: 'Cancel', icon: 'xmark', onPress: () => router.back() }]}
      right={[{ label: 'Save', icon: 'checkmark', variant: 'done', disabled: !valid, onPress: save }]}>
      <Section>
        <Row
          title={
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name, e.g. Fidelity 401(k)"
              placeholderTextColor={c.tertiary}
              autoFocus={isNew}
              returnKeyType="done"
              style={input}
            />
          }
        />
        <Row
          title="Category"
          value={category?.name ?? 'Choose'}
          chevron={false}
          accessory={<Icon name="chevron.up.chevron.down" size={14} color={c.tertiary} />}
          onPress={() => setPickCategory((v) => !v)}
        />
      </Section>

      {pickCategory
        ? (['asset', 'liability'] as const).map((kind) => (
            <Section key={kind} header={KIND_TITLES[kind]}>
              {sorted
                .filter((x) => x.kind === kind)
                .map((x) => (
                  <Row
                    key={x.id}
                    title={x.name}
                    chevron={false}
                    accessory={x.id === categoryId ? <Icon name="checkmark" size={17} weight="semibold" color={c.tint} /> : null}
                    onPress={() => {
                      haptics.selection();
                      setCategoryId(x.id);
                      setPickCategory(false);
                    }}
                  />
                ))}
            </Section>
          ))
        : null}

      {!isAsset ? (
        <Section footer="Used to suggest which debt to pay off first, and to estimate what it costs you in interest. Leave it at 0% if there’s none.">
          <Row
            title="Interest Rate (APR)"
            accessory={
              <View style={styles.rate}>
                <TextInput
                  value={apr}
                  onChangeText={(t) => setApr(formatTyping(t, 2))}
                  placeholder="0"
                  placeholderTextColor={c.tertiary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Interest rate"
                  style={[numeric, styles.rateInput]}
                />
                <Text color={apr ? 'secondary' : 'tertiary'}>%</Text>
              </View>
            }
          />
        </Section>
      ) : null}

      <Section footer={pickMetal ? undefined : quantityFooter}>
        <Row
          title="Track by Quantity"
          accessory={
            <Switch
              value={tracksQuantity}
              onValueChange={(on) => {
                setByQuantity(on);
                if (!on) {
                  setMetal(undefined);
                  setMetalPicked(true);
                  setPickMetal(false);
                }
              }}
            />
          }
        />
        {tracksQuantity && isAsset ? (
          <Row
            title="Live Price"
            value={liveMetal ? metalName(liveMetal) : 'Off'}
            chevron={false}
            accessory={<Icon name="chevron.up.chevron.down" size={14} color={c.tertiary} />}
            onPress={() => setPickMetal((v) => !v)}
          />
        ) : null}
        {tracksQuantity && !liveMetal ? (
          <Row
            title="Unit"
            accessory={
              <TextInput
                value={unit}
                onChangeText={setUnit}
                placeholder="oz"
                placeholderTextColor={c.tertiary}
                autoCapitalize="none"
                style={numeric}
              />
            }
          />
        ) : null}
      </Section>

      {pickMetal && tracksQuantity && isAsset ? (
        <Section header="Live Price" footer="Gold, silver, platinum and palladium follow the market price per troy ounce.">
          {[{ key: undefined, name: 'Off' }, ...METALS].map((m) => (
            <Row
              key={m.key ?? 'off'}
              title={m.name}
              chevron={false}
              accessory={m.key === liveMetal ? <Icon name="checkmark" size={17} weight="semibold" color={c.tint} /> : null}
              onPress={() => chooseMetal(m.key)}
            />
          ))}
        </Section>
      ) : null}

      {isNew ? (
        <Section header="Starting Balance" footer={balanceFooter}>
          {tracksQuantity ? (
            <Row
              title={`Quantity (${unitLabel || 'units'})`}
              accessory={
                <TextInput
                  value={qty}
                  onChangeText={(t) => setQty(formatTyping(t, 6))}
                  placeholder="0"
                  placeholderTextColor={c.tertiary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Quantity"
                  style={numeric}
                />
              }
            />
          ) : null}
          {tracksQuantity ? (
            <Row
              title={`Price per ${unitLabel || 'unit'}`}
              accessory={
                <TextInput
                  value={price}
                  onChangeText={(t) => setPrice(formatTyping(t))}
                  placeholder={autoPriced && spot.price != null ? formatTyping(centsToInput(spot.price)) : '0.00'}
                  placeholderTextColor={c.tertiary}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Price per unit"
                  style={numeric}
                />
              }
            />
          ) : null}
          {!tracksQuantity ? (
            <Row
              title={category?.kind === 'liability' ? 'Amount Owed' : 'Balance'}
              accessory={
                <TextInput
                  value={balance}
                  onChangeText={(t) => setBalance(formatTyping(t))}
                  placeholder="0.00"
                  placeholderTextColor={c.tertiary}
                  keyboardType="decimal-pad"
                  style={numeric}
                />
              }
            />
          ) : null}
          {!autoPriced ? (
            <Row title="As of" accessory={<DateField value={date} onChange={setDate} maximum={today} />} />
          ) : null}
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
  rate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  rateInput: {
    width: 100,
  },
  numeric: {
    fontSize: type.body.fontSize,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    width: 140,
    paddingVertical: 6,
  },
});
