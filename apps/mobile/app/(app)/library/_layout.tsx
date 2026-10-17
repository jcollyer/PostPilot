import { Stack } from 'expo-router';

import { TabStack } from '../../../src/components/TabStack';

export default function LibraryStack() {
  return (
    <TabStack title="Library">
      {/* TikTok's consent before adding a video to the queue: a medium form sheet. */}
      <Stack.Screen
        name="add-to-queue/[mediaId]"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5],
          sheetGrabberVisible: true,
          headerShown: false,
        }}
      />
    </TabStack>
  );
}
