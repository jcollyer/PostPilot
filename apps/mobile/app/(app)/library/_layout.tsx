import { Stack } from 'expo-router';

import { rootScreenOptions, stackScreenOptions } from '../../../src/components/stackOptions';

export default function LibraryStack() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="index" options={{ ...rootScreenOptions, title: 'Library' }} />
      <Stack.Screen name="[folderId]" />
    </Stack>
  );
}
