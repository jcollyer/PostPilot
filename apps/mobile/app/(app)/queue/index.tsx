import { ScrollView, Text } from 'react-native';

/** Placeholder until the Queue slice lands. */
export default function QueueScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
      contentContainerStyle={{ padding: 20 }}
    >
      <Text className="text-xs text-mutedForeground">Your posting queue will show here.</Text>
    </ScrollView>
  );
}
