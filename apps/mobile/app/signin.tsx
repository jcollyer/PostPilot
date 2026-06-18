import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { authClient } from '../src/lib/auth-client';
import { Button } from '../src/components/Button';
import { TextField } from '../src/components/TextField';

type Mode = 'signin' | 'signup';

/**
 * Email/password sign-in screen. New accounts must verify their email (a link
 * is sent on signup) before they can sign in, so creating an account ends on a
 * "check your email" notice rather than dropping straight into the app.
 */
export default function SignInScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setError(null);
    setNotice(null);
    setPassword('');
    setMode(next);
  }

  async function handleSubmit() {
    setError(null);
    setNotice(null);
    setPending(true);
    try {
      if (mode === 'signup') {
        const { error } = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });
        if (error) {
          setError(error.message ?? 'Could not create your account.');
        } else {
          setNotice('Account created. Check your email to verify it, then sign in.');
          setMode('signin');
          setPassword('');
        }
        return;
      }

      const { error } = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (error) {
        if (error.status === 403) {
          setNotice("Your email isn't verified yet. We've sent a fresh link — check your inbox.");
        } else {
          setError(error.message ?? 'Invalid email or password.');
        }
        return;
      }
      // Session store updates; the (app) group becomes reachable.
      router.replace('/');
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 32 }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8 items-center">
            <View className="bg-primary mb-4 h-16 w-16 items-center justify-center rounded-2xl">
              <Text className="text-3xl font-bold text-white">P</Text>
            </View>
            <Text className="text-3xl font-bold text-slate-900">
              {mode === 'signin' ? 'Welcome back' : 'Create your account'}
            </Text>
            <Text className="mt-2 text-center text-base text-slate-500">
              {mode === 'signin' ? 'Sign in to your queue.' : 'Start building your content queue.'}
            </Text>
          </View>

          {error ? (
            <View className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3">
              <Text className="text-sm text-red-700">{error}</Text>
            </View>
          ) : null}

          {notice ? (
            <View className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <Text className="text-sm text-emerald-800">{notice}</Text>
            </View>
          ) : null}

          <View className="gap-4">
            {mode === 'signup' ? (
              <TextField
                label="Name"
                value={name}
                onChangeText={setName}
                placeholder="Jane Creator"
                autoComplete="name"
                autoCorrect={false}
              />
            ) : null}

            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              autoCorrect={false}
              keyboardType="email-address"
            />

            <TextField
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              autoCapitalize="none"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              secureTextEntry
            />

            <Button onPress={handleSubmit} loading={pending} disabled={pending}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </View>

          <View className="mt-6 flex-row justify-center">
            <Text className="text-sm text-slate-500">
              {mode === 'signin' ? 'New here? ' : 'Already have an account? '}
            </Text>
            <Pressable onPress={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}>
              <Text className="text-primary text-sm font-semibold">
                {mode === 'signin' ? 'Create an account' : 'Sign in'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
