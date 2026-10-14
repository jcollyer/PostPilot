import { Stack } from 'expo-router';

import { rootScreenOptions, stackScreenOptions } from '../../../src/components/stackOptions';

export default function SettingsStack() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ ...rootScreenOptions, title: 'Settings' }} />
    </Stack>
  );
}
