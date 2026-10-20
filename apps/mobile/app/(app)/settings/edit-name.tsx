import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';

import { trpc } from '../../../src/lib/trpc';
import { nameDraft } from '../../../src/models/settings';

/**
 * Edit Name, pushed from Settings' Name row: one field, Save in the nav bar.
 * Save stays disabled until the draft is a valid 1–80 character name that
 * differs from the saved one. Saving writes the result into `user.me`, so
 * Settings already shows the new name when this screen pops.
 */
export default function EditNameScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  const saved = me.data?.name ?? null;
  const [draft, setDraft] = useState(saved ?? '');
  const [touched, setTouched] = useState(false);

  // Fill the field once `user.me` arrives, unless the creator already typed.
  useEffect(() => {
    if (!touched && saved != null) setDraft(saved);
  }, [saved, touched]);

  const updateProfile = trpc.user.updateProfile.useMutation({
    onSuccess: (user) => {
      utils.user.me.setData(undefined, user);
      void utils.user.getSession.invalidate();
      router.back();
    },
    onError: (err) => Alert.alert('Couldn’t save your name', err.message),
  });

  const { name, canSave, note } = nameDraft(draft, saved);
  const saving = updateProfile.isPending;
  const enabled = canSave && !saving;

  function save() {
    if (enabled) updateProfile.mutate({ name });
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={save}
              disabled={!enabled}
              accessibilityRole="button"
              accessibilityLabel="Save name"
              accessibilityState={{ disabled: !enabled, busy: saving }}
              hitSlop={8}
              className="min-h-[44px] justify-center px-2 active:opacity-60"
            >
              {saving ? (
                <ActivityIndicator color="#2d3f63" />
              ) : (
                <Text
                  className={`text-[17px] font-semibold ${enabled ? 'text-primary' : 'text-ink-tertiary'}`}
                >
                  Save
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1 bg-ground"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
          <TextInput
            value={draft}
            onChangeText={(text) => {
              setTouched(true);
              setDraft(text);
            }}
            onSubmitEditing={save}
            editable={!saving}
            autoFocus
            accessibilityLabel="Name"
            placeholder="Your name"
            placeholderTextColor="#94a3b8"
            autoCapitalize="words"
            autoCorrect={false}
            textContentType="name"
            autoComplete="name"
            returnKeyType="done"
            clearButtonMode="while-editing"
            className="min-h-[44px] px-4 py-2.5 text-[17px] text-ink"
          />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          className={`mt-2 px-1 text-[13px] leading-[18px] ${
            note.tone === 'over' ? 'text-signal-critical' : 'text-ink-tertiary'
          }`}
        >
          {note.text}
        </Text>
      </ScrollView>
    </>
  );
}
