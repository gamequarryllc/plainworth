import { router } from 'expo-router';

import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { haptics } from '@/lib/haptics';
import { CURRENCIES, currencySymbol } from '@/lib/money';
import { useStore } from '@/store';
import { useColors } from '@/theme';

export default function CurrencyScreen() {
  const c = useColors();
  const currency = useStore((s) => s.settings.currency);
  const updateSettings = useStore((s) => s.updateSettings);
  return (
    <Screen title="Currency">
      <Section footer="Changes how amounts are shown. Amounts you already entered are not converted.">
        {CURRENCIES.map((x) => (
          <Row
            key={x.code}
            title={x.name}
            subtitle={`${x.code} · ${currencySymbol(x.code)}`}
            chevron={false}
            accessory={x.code === currency ? <Icon name="checkmark" size={17} weight="semibold" color={c.tint} /> : null}
            onPress={() => {
              haptics.selection();
              updateSettings({ currency: x.code });
              router.back();
            }}
          />
        ))}
      </Section>
    </Screen>
  );
}
