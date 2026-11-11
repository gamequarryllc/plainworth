import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Icon } from '@/components/icon';
import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import { notify } from '@/lib/dialogs';
import { haptics } from '@/lib/haptics';
import { LIFETIME_PRICE, PRO_FEATURES, type ProFeature } from '@/lib/pro';
import { purchasesAvailable } from '@/lib/purchases';
import { buyPro, loadOffer, restorePurchases, setTestPro, useProStore } from '@/store/pro';
import { layout, useColors } from '@/theme';

const DEVICE = Platform.OS === 'android' ? 'phone' : 'iPhone';
const ACCOUNT = Platform.OS === 'android' ? 'Google account' : 'Apple ID';

/** The Plainworth Pro sheet: what Pro adds, the lifetime offer, and Restore Purchases. */
export default function ProScreen() {
  const c = useColors();
  const source = useProStore((s) => s.source);
  const { feature } = useLocalSearchParams<{ feature?: ProFeature }>();
  // The feature that was tapped goes first.
  const features = [...PRO_FEATURES].sort((a, b) => Number(b.key === feature) - Number(a.key === feature));

  const offer = useProStore((s) => s.offer);
  const [busy, setBusy] = useState(false);
  // The store's price, in the buyer's currency, once it loads.
  const price = offer?.price ?? LIFETIME_PRICE;

  useEffect(() => {
    if (purchasesAvailable && !source) loadOffer();
  }, [source]);

  const buy = async () => {
    if (!purchasesAvailable) {
      if (__DEV__) {
        // Expo Go and the web can't buy anything: a test build just switches Pro on.
        setTestPro(true);
        haptics.success();
      } else {
        notify('Purchases aren’t available', 'This copy of Plainworth can’t reach the App Store.');
      }
      return;
    }
    setBusy(true);
    try {
      const current = offer ?? (await loadOffer());
      if (!current) {
        notify('Couldn’t reach the App Store', 'Check your connection and try again.');
        return;
      }
      const res = await buyPro(current);
      if (res.result === 'bought') haptics.success();
      else if (res.result === 'pending')
        notify('Waiting for approval', 'Pro turns on by itself as soon as the purchase is approved.');
      else if (res.result === 'failed') notify('Purchase didn’t go through', res.message ?? 'Nothing was charged. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      await restorePurchases();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Plainworth Pro"
      right={[{ label: 'Done', icon: 'checkmark', variant: 'done', onPress: () => router.back() }]}>
      <View style={styles.top}>
        <View style={[styles.appIcon, { backgroundColor: c.tint }]}>
          <Icon name="chart.line.uptrend.xyaxis" size={30} weight="semibold" color={c.onTint} />
        </View>
        <Text variant="subheadline" color="secondary" align="center">
          Tracking your net worth and spending is always free. Pro adds the extras.
        </Text>
      </View>

      <Section>
        {features.map((f) => (
          <Row
            key={f.key}
            leading={<Icon name={f.icon} size={20} color={c.tint} />}
            title={
              <Text variant="body" weight="600">
                {f.title}
              </Text>
            }
            subtitle={
              <Text variant="subheadline" color="secondary">
                {f.text}
              </Text>
            }
          />
        ))}
      </Section>

      {source ? (
        <Section
          footer={
            source === 'test'
              ? 'Turned on for testing. Nothing was bought. Switch it off in Settings › Developer.'
              : `Thank you for supporting Plainworth. Pro stays with your ${ACCOUNT}, including everything added to Pro later.`
          }>
          <Row
            leading={<Icon name="checkmark.seal.fill" size={20} color={c.up} />}
            title="You have Plainworth Pro"
            value={source === 'test' ? 'Test' : 'Lifetime'}
          />
        </Section>
      ) : (
        <View style={styles.offer}>
          <Text variant="headline" align="center">
            Lifetime Pro · {price}
          </Text>
          <Text variant="footnote" color="secondary" align="center" style={styles.offerText}>
            Pay once and keep Pro for good, including everything added to it later. It comes back on any {DEVICE}{' '}
            signed in to your {ACCOUNT}.
          </Text>
          <Button title={`Unlock Pro for ${price}`} onPress={buy} disabled={busy} style={styles.buy} />
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={onRestore}
            disabled={busy}
            style={({ pressed }) => [styles.restore, pressed && { opacity: 0.5 }]}>
            <Text variant="subheadline" weight="500" color="tint">
              Restore Purchases
            </Text>
          </Pressable>
          {busy ? <ActivityIndicator style={styles.dev} /> : null}
          {__DEV__ && !purchasesAvailable ? (
            <Text variant="caption" color="tertiary" align="center" style={styles.dev}>
              Test build: Unlock turns Pro on without charging anything.
            </Text>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    marginBottom: 4,
    marginHorizontal: layout.margin * 2,
  },
  appIcon: {
    width: 64,
    height: 64,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offer: {
    marginTop: 28,
  },
  offerText: {
    marginTop: 4,
    marginHorizontal: layout.margin * 2,
  },
  buy: {
    marginTop: 18,
  },
  restore: {
    alignSelf: 'center',
    marginTop: 16,
  },
  dev: {
    marginTop: 14,
    marginHorizontal: layout.margin * 2,
  },
});
