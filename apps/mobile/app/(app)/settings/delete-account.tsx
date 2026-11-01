import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ACCOUNT_DELETION_GRACE_DAYS, accountDeletionDate } from '@postpilot/types';

import { trpc } from '../../../src/lib/trpc';
import { useAuth } from '../../../src/lib/AuthContext';
import { Button } from '../../../src/components/Button';
import { TextField } from '../../../src/components/TextField';

/**
 * Delete account, pushed from Settings. Apple requires deletion in the app, so
 * this stays reachable here; it is guarded by typing the account email, then
 * signs out. The account is deactivated at once and purged after
 * ACCOUNT_DELETION_GRACE_DAYS, and the copy says when, as Apple asks of a
 * deletion that takes time to complete.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { data: me } = trpc.user.me.useQuery();
  const [typed, setTyped] = useState('');
  const purgeDate = accountDeletionDate(new Date()).toLocaleDateString(undefined, {
    dateStyle: 'long',
  });

  const deleteAccount = trpc.user.deleteAccount.useMutation({
    onSuccess: async () => {
      await signOut();
    },
    onError: (err) => Alert.alert('Couldn’t delete your account', err.message),
  });

  function handleDelete() {
    const typedEmail = typed.trim();
    const accountEmail = (me?.email ?? '').trim();
    if (typedEmail.toLowerCase() !== accountEmail.toLowerCase()) {
      Alert.alert('Email doesn’t match', 'Type your account email exactly to confirm.');
      return;
    }
    deleteAccount.mutate({ confirmEmail: typedEmail });
  }

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-ground"
      contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 20 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-1">
        <Text className="text-[15px] font-semibold leading-5 text-signal-critical">
          Permanently deleted on {purgeDate}
        </Text>
        <Text className="text-[15px] leading-5 text-ink-secondary">
          Your account is deactivated right away: you’re signed out everywhere, your platforms are
          disconnected, nothing more is published, and any paid plan won’t renew. After{' '}
          {ACCOUNT_DELETION_GRACE_DAYS} days your account and media library are permanently
          deleted. Sign in before then to restore it.
        </Text>
        <Text className="text-[15px] leading-5 text-ink-secondary">
          Type your account email to confirm.
        </Text>
      </View>

      <TextField
        label={`Type “${me?.email ?? 'your email'}” to confirm`}
        value={typed}
        onChangeText={setTyped}
        placeholder={me?.email ?? 'your@email.com'}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={!deleteAccount.isPending}
      />

      <View className="gap-3">
        <Button
          variant="destructive"
          onPress={handleDelete}
          disabled={deleteAccount.isPending || !typed.trim()}
          loading={deleteAccount.isPending}
        >
          Delete account
        </Button>
        <Button variant="outline" onPress={() => router.back()} disabled={deleteAccount.isPending}>
          Cancel
        </Button>
      </View>
    </ScrollView>
  );
}
