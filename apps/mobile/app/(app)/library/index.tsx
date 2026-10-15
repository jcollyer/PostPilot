import { LibraryBrowser } from '../../../src/components/LibraryBrowser';

/** Library = the root of the creator's media library, with search. */
export default function LibraryScreen() {
  return <LibraryBrowser parentId={null} searchable />;
}
