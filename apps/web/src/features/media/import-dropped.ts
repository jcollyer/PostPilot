import type { DroppedFolder } from './dropped-entries';

/**
 * Recreate a dropped folder tree in the library and upload its files.
 *
 * Both drop targets (the media library dropzone and the upload dialog) share
 * this so a dropped directory — however deeply nested — is rebuilt folder for
 * folder: each directory becomes a subfolder under its parent, its own files
 * upload into it, and its child directories recurse the same way.
 */
export interface ImportDroppedDeps {
  /** Folder the top-level dropped folders are created under (null = root). */
  parentId: string | null;
  /** Create a folder under `parentId` and resolve to its id. Throws on a name clash. */
  createFolder: (name: string, parentId: string | null) => Promise<{ id: string }>;
  /** List existing folders directly under `parentId` (used to reuse on a clash). */
  fetchSiblings: (parentId: string | null) => Promise<{ id: string; name: string }[]>;
  /** Queue files for upload into a specific folder. */
  addFiles: (files: File[], folderId: string | null) => void;
}

/** True when this folder, or anything nested inside it, contains a file. */
function subtreeHasFiles(folder: DroppedFolder): boolean {
  return folder.files.length > 0 || folder.folders.some(subtreeHasFiles);
}

/**
 * Resolve a folder name to an id under `parentId`, creating it when needed. If a
 * sibling with that name already exists (e.g. a repeat drop), reuse it instead
 * of surfacing a conflict.
 */
async function resolveFolderId(
  name: string,
  parentId: string | null,
  deps: ImportDroppedDeps,
): Promise<string | null> {
  const trimmed = name.trim().slice(0, 120);
  if (!trimmed) return null;
  try {
    const created = await deps.createFolder(trimmed, parentId);
    return created.id;
  } catch {
    const siblings = await deps.fetchSiblings(parentId);
    return siblings.find((f) => f.name === trimmed)?.id ?? null;
  }
}

/**
 * Walk `folders` (a dropped directory tree), rebuilding it under `deps.parentId`
 * and uploading every file into its matching folder. Returns whether any folder
 * was created/resolved so callers can decide whether to invalidate folder lists.
 */
export async function importDroppedFolders(
  folders: DroppedFolder[],
  deps: ImportDroppedDeps,
): Promise<boolean> {
  let touchedFolders = false;

  const walk = async (list: DroppedFolder[], parentId: string | null): Promise<void> => {
    for (const folder of list) {
      // Skip a branch that carries no files at all — nothing to upload and no
      // reason to materialize empty folders.
      if (!subtreeHasFiles(folder)) continue;

      const targetId = await resolveFolderId(folder.name, parentId, deps);
      if (!targetId) continue;
      touchedFolders = true;

      if (folder.files.length) deps.addFiles(folder.files, targetId);
      if (folder.folders.length) await walk(folder.folders, targetId);
    }
  };

  await walk(folders, deps.parentId);
  return touchedFolders;
}
