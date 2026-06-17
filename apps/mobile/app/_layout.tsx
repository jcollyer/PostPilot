import 'react-native-gesture-handler';
import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from '../src/lib/AuthContext';
import { TRPCProvider } from '../src/lib/TRPCProvider';

/**
 * Root layout. Order matters:
 *   SafeAreaProvider  — geometry for notches / home indicators
 *     AuthProvider    — session state (must exist before tRPC reads it)
 *       TRPCProvider  — tRPC + React Query, reads the session token
 *         Stack       — navigation
 *
 * The `(app)` group owns the authenticated screens and guards itself.
 * `/signin` sits outside the group so it's reachable while signed out.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <TRPCProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="signin" />
            <Stack.Screen name="(app)" />
          </Stack>
        </TRPCProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
