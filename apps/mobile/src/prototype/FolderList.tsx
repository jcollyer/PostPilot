import { Link } from 'expo-router';
import { ChevronRight, Folder } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Card } from '../components/Card';
import { trpc } from '../lib/trpc';

/**
 * PROTOTYPE: real folder tree from `folder.children`, used only to exercise
 * drill-in on the Library tab's own stack. What Library actually shows is
 * decided by its own ticket.
 */
export function FolderList({ parentId }: { parentId: string | null }) {
  const q = trpc.folder.children.useQuery({ parentId });

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-slate-50"
      contentContainerStyle={{ padding: 20, gap: 12, paddingBottom: 120 }}
    >
      {q.isLoading ? (
        <ActivityIndicator color="#2d3f63" />
      ) : q.error ? (
        <Text className="text-sm text-red-700">{q.error.message}</Text>
      ) : !q.data?.length ? (
        <Text className="text-xs text-slate-500">No subfolders here.</Text>
      ) : (
        <Card className="overflow-hidden">
          {q.data.map((f, i) => (
            <Link
              key={f.id}
              href={{ pathname: '/library/[folderId]', params: { folderId: f.id, name: f.name } }}
              asChild
            >
              <Pressable
                className={`flex-row items-center gap-3 px-4 py-3 active:opacity-80 ${
                  i > 0 ? 'border-t border-slate-200' : ''
                }`}
              >
                <Folder size={20} color="#64748b" />
                <View className="flex-1">
                  <Text className="text-sm font-semibold text-slate-900">{f.name}</Text>
                  <Text className="text-xs text-slate-500">
                    {f.itemCount} items · {f.childFolderCount} folders
                  </Text>
                </View>
                <ChevronRight size={18} color="#94a3b8" />
              </Pressable>
            </Link>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}
