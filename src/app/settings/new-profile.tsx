import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Row, Section } from '@/components/list';
import { Screen } from '@/components/screen';
import { haptics } from '@/lib/haptics';
import { cleanName, NAME_MAX } from '@/lib/name';
import { addProfile, switchProfile } from '@/store/profiles';
import { type, useColors } from '@/theme';

/** Name a new profile. It opens right away, empty, ready for its first account. */
export default function NewProfileScreen() {
  const c = useColors();
  const [name, setName] = useState('');
  const ready = cleanName(name).length > 0;

  const add = () => {
    if (!ready) return;
    switchProfile(addProfile({ name }));
    haptics.success();
    router.back();
  };

  return (
    <Screen title="New Profile" form right={[{ label: 'Add', variant: 'done', disabled: !ready, onPress: add }]}>
      <Section footer="It starts empty and opens right away. Your other profiles stay as they are.">
        <Row
          title="Name"
          accessory={
            <TextInput
              value={name}
              onChangeText={setName}
              onSubmitEditing={add}
              placeholder="Sam, Business…"
              placeholderTextColor={c.tertiary}
              maxLength={NAME_MAX}
              autoFocus
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              textAlign="right"
              accessibilityLabel="Profile Name"
              style={[styles.input, { color: c.text }]}
            />
          }
        />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    flex: 1,
    marginLeft: 16,
    fontSize: type.body.fontSize,
    paddingVertical: 4,
  },
});
