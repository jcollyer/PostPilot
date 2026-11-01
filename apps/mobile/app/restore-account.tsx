import { Redirect, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '../src/components/Button';
import { useAuth } from '../src/lib/AuthContext';
import { trpc } from '../src/lib/trpc';

/**
 * Offered to an account scheduled for deletion when it signs back in: restore
 * it, or sign out and let the deletion go ahead. Sits outside the `(app)`
 * group, which redirects here while the account is pending deletion.
 */
export default function RestoreAccountScreen() {
  const router = useRouter();
  const { session, isLoading, signOut, refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const restore = trpc.user.restoreAccount.useMutation({
    onSuccess: async () => {
      // The (app) guard reads the session, which no longer carries the flag.
      await refresh();
      router.replace('/');
    },
    onError: (err) => setError(err.message),
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  if (!session) return <Redirect href="/signin" />;

  const scheduledFor = session.user.deletionScheduledFor;
  if (!scheduledFor) return <Redirect href="/" />;

  const date = new Date(scheduledFor).toLocaleDateString(undefined, { dateStyle: 'long' });

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace('/signin');
  }

  const busy = restore.isPending || signingOut;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}>
        <View className="mb-8 items-center">
          <Text className="text-center text-3xl font-bold text-slate-900">
            Restore your account?
          </Text>
          <Text className="mt-2 text-center text-base text-slate-500">
            {session.user.email} is scheduled to be permanently deleted on {date}.
          </Text>
        </View>

        <Text className="mb-6 text-center text-sm text-slate-500">
          Restoring keeps your media library, queue and settings. Your queue comes back paused and
          your platforms need reconnecting — they were disconnected when you deleted the account.
        </Text>

        {error ? (
          <View className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
            <Text className="text-sm text-red-700">{error}</Text>
          </View>
        ) : null}

        <View className="gap-3">
          <Button onPress={() => restore.mutate()} loading={restore.isPending} disabled={busy}>
            Restore account
          </Button>
          <Button variant="ghost" onPress={handleSignOut} loading={signingOut} disabled={busy}>
            Keep it deleted and sign out
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
