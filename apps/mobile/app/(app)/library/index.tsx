import { ScrollView, Text } from 'react-native';

/** Placeholder until the Library slice lands. */
export default function LibraryScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1"
      contentContainerStyle={{ padding: 20 }}
    >
      <Text className="text-xs text-mutedForeground">Your media from PostPilot on the web will show here.</Text>
    </ScrollView>
  );
}
