import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../src/lib/AuthContext';

/**
 * Sign-in screen. One button kicks off the hosted auth flow in an in-app
 * browser; the web app handles Google / magic link and redirects back with a
 * session token that we persist in SecureStore.
 */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    setPending(true);
    try {
      await signIn();
      router.replace('/');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong.';
      if (message !== 'Sign in was cancelled.') {
        Alert.alert('Sign in failed', message);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-8">
        <View className="mb-10 items-center">
          <View className="bg-primary mb-4 h-16 w-16 items-center justify-center rounded-2xl">
            <Text className="text-3xl font-bold text-white">S</Text>
          </View>
          <Text className="text-3xl font-bold text-slate-900">SaaS Template</Text>
          <Text className="mt-2 text-center text-base text-slate-500">
            Sign in to get started.
          </Text>
        </View>

        <Pressable
          onPress={handleSignIn}
          disabled={pending}
          className="bg-primary w-full flex-row items-center justify-center rounded-lg px-4 py-4 active:opacity-80 disabled:opacity-60"
        >
          {pending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">Continue</Text>
          )}
        </Pressable>

        <Text className="mt-6 px-4 text-center text-xs text-slate-400">
          You&apos;ll be taken to your browser to sign in with Google or a magic link, then bounced
          right back here.
        </Text>
      </View>
    </SafeAreaView>
  );
}
