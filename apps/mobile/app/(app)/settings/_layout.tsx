import { Stack } from 'expo-router';

import { TabStack } from '../../../src/components/TabStack';

export default function SettingsStack() {
  return (
    <TabStack title="Settings">
      <Stack.Screen name="edit-name" options={{ title: 'Name' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Delete Account' }} />
    </TabStack>
  );
}
