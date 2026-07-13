/**
 * Read a drag-and-drop `DataTransfer` into loose files plus dropped folders.
 *
 * A plain multi-file drop still lands in `looseFiles`. When a directory is
 * dragged in, browsers expose it through the (non-standard but widely
 * supported) `webkitGetAsEntry` API; we walk each directory tree and preserve
 * its full nested structure — a folder's own files land in `files`, and any
 * child directories become nested `DroppedFolder`s under `folders`. MIME/size
 * filtering happens later in `useVideoUpload.addFiles`, so we return everything.
 */

export interface DroppedFolder {
  /** The dropped directory's own name (used as the new folder's name). */
  name: string;
  /** Files directly inside this directory (not inside a child directory). */
  files: File[];
  /** Child directories, each preserved as its own nested folder. */
  folders: DroppedFolder[];
}

export interface DroppedContents {
  /** Files dropped directly (not inside a folder). */
  looseFiles: File[];
  /** One entry per top-level directory that was dropped, with its subtree. */
  folders: DroppedFolder[];
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDir(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject));
}

/**
 * Recursively read a directory entry into a nested `DroppedFolder`, keeping
 * each level's own files separate from its child directories.
 */
async function readFolderTree(entry: FileSystemDirectoryEntry): Promise<DroppedFolder> {
  const reader = entry.createReader();
  const files: File[] = [];
  const folders: DroppedFolder[] = [];
  // `readEntries` yields the directory in batches; keep reading until drained.
  for (;;) {
    const batch = await readDir(reader);
    if (batch.length === 0) break;
    for (const child of batch) {
      if (child.isDirectory) {
        folders.push(await readFolderTree(child as FileSystemDirectoryEntry));
      } else {
        files.push(await readFile(child as FileSystemFileEntry));
      }
    }
  }
  return { name: entry.name, files, folders };
}

/**
 * Split a drop into loose files and dropped folders. Entries are captured
 * synchronously up front because the `DataTransferItemList` is emptied as soon
 * as the drop handler returns.
 */
export async function readDroppedContents(dataTransfer: DataTransfer): Promise<DroppedContents> {
  const items = dataTransfer.items;

  // Older browsers without the entry API: treat everything as loose files.
  if (!items || items.length === 0 || typeof items[0]?.webkitGetAsEntry !== 'function') {
    return { looseFiles: Array.from(dataTransfer.files), folders: [] };
  }

  // Grab every entry (and any non-entry files) synchronously.
  const entries: FileSystemEntry[] = [];
  const looseFiles: File[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      entries.push(entry);
    } else {
      const file = item.getAsFile();
      if (file) looseFiles.push(file);
    }
  }

  const folders: DroppedFolder[] = [];
  for (const entry of entries) {
    if (entry.isDirectory) {
      folders.push(await readFolderTree(entry as FileSystemDirectoryEntry));
    } else {
      looseFiles.push(await readFile(entry as FileSystemFileEntry));
    }
  }

  return { looseFiles, folders };
}
