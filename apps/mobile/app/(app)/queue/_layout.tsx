import { Stack } from 'expo-router';

import { TabStack } from '../../../src/components/TabStack';

// Opened from another tab (Library's "View in Queue"), the item sheet still
// needs the Queue list under it.
export const unstable_settings = { initialRouteName: 'index' };

export default function QueueStack() {
  return (
    <TabStack title="Queue">
      {/* Addressed by item id, so other tabs can open it. System sheet shape and grabber. */}
      <Stack.Screen
        name="[itemId]"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 1],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
    </TabStack>
  );
}
