import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { authClient } from '../src/lib/auth-client';
import { Button } from '../src/components/Button';
import { TextField } from '../src/components/TextField';

type Mode = 'signin' | 'signup';

/**
 * Sign-in screen: Google SSO plus email/password, matching the web AuthForm.
 * New email/password accounts must verify their email (a link is sent on
 * signup) before they can sign in, so creating an account ends on a "check
 * your email" notice rather than dropping straight into the app.
 */
export default function SignInScreen() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  function switchMode(next: Mode) {
    setError(null);
    setNotice(null);
    setPassword('');
    setMode(next);
  }

  /**
   * Google via Better Auth's browser-redirect flow: the Expo plugin opens an
   * auth session, then stores the session cookie from the deep-link return.
   * A cancelled sheet resolves without an error, so confirm a session exists
   * before leaving this screen.
   */
  async function handleGoogle() {
    setError(null);
    setNotice(null);
    setGooglePending(true);
    try {
      const { error } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
        errorCallbackURL: '/signin',
      });
      if (error) {
        setError(error.message ?? 'Could not sign in with Google.');
        return;
      }
      const { data } = await authClient.getSession();
      if (data?.session) router.replace('/');
    } finally {
      setGooglePending(false);
    }
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
          // The server re-sends the link on sign-in (sendOnSignIn, at most
          // once a minute per address).
          setNotice(
            "Your email isn't verified yet. We've emailed you a verification link — check your inbox.",
          );
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

          <Button
            variant="outline"
            onPress={handleGoogle}
            loading={googlePending}
            disabled={googlePending || pending}
          >
            <GoogleIcon />
            <Text className="ml-2 font-semibold text-slate-900">Continue with Google</Text>
          </Button>

          <View className="my-5 flex-row items-center">
            <View className="h-px flex-1 bg-slate-200" />
            <Text className="mx-3 text-xs uppercase text-slate-400">or</Text>
            <View className="h-px flex-1 bg-slate-200" />
          </View>

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

            <Button onPress={handleSubmit} loading={pending} disabled={pending || googlePending}>
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

/** Google "G" mark, same path as the web AuthForm's icon. */
function GoogleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M21.35 11.1H12v3.2h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.84-2.66-5.84-5.95s2.62-5.95 5.84-5.95c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.9 3.95 14.7 3 12 3 6.92 3 2.8 7.13 2.8 12.2S6.92 21.4 12 21.4c6.92 0 9.55-4.85 9.55-7.36 0-.5-.05-.83-.2-1.94z"
        fill="#0f172a"
      />
    </Svg>
  );
}
