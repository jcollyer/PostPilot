import { ScrollView, Text } from 'react-native';

import { Card } from '../../../src/components/Card';

/** PROTOTYPE placeholder: content is decided by the Queue grilling ticket. */
export default function QueueScreen() {
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 120 }}
    >
      {Array.from({ length: 14 }, (_, i) => (
        <Card key={i} className="p-4">
          <Text className="text-sm font-semibold text-slate-900">Queue item {i + 1}</Text>
          <Text className="text-xs text-slate-500">Placeholder row: scroll to see the tab bar and title behave.</Text>
        </Card>
      ))}
    </ScrollView>
  );
}
