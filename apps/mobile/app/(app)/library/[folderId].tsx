import { Stack, useLocalSearchParams } from 'expo-router';

import { LibraryBrowser } from '../../../src/components/LibraryBrowser';

/**
 * One folder of the Library, titled with its name (passed by the row that
 * pushed it), so the back button reads as the breadcrumb.
 */
export default function LibraryFolderScreen() {
  const { folderId, name } = useLocalSearchParams<{ folderId: string; name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Folder' }} />
      <LibraryBrowser parentId={folderId} />
    </>
  );
}
