import { Stack, useLocalSearchParams } from 'expo-router';

import { FolderList } from '../../../src/prototype/FolderList';

/** Drill-in: a folder pushed onto the Library tab's own stack. */
export default function FolderScreen() {
  const { folderId, name } = useLocalSearchParams<{ folderId: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Folder' }} />
      <FolderList parentId={folderId} />
    </>
  );
}
