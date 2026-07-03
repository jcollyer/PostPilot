'use client';

import { useCallback, useState } from 'react';

import { ACCEPTED_VIDEO_MIME_TYPES, MAX_VIDEO_BYTES } from '@postpilot/types';

import { trpc } from '@/lib/trpc/client';
import { uploadParts } from './upload';

export type ItemStatus = 'uploading' | 'done' | 'error' | 'canceled';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: ItemStatus;
  error?: string;
  controller: AbortController;
  /** Folder this specific file lands in (null = the root). */
  folderId: string | null;
}

/**
 * Shared multipart-upload engine used by both the UploadDialog and the
 * drag-and-drop empty state. Owns the list of in-flight uploads and the
 * init → part upload → complete lifecycle for each file.
 */
export function useVideoUpload({
  folderId = null,
  onUploaded,
}: {
  /** Folder new uploads land in (null = the root). */
  folderId?: string | null;
  onUploaded: () => void;
}) {
  const [items, setItems] = useState<UploadItem[]>([]);

  const initUpload = trpc.media.initUpload.useMutation();
  const completeUpload = trpc.media.completeUpload.useMutation();
  const abortUpload = trpc.media.abortUpload.useMutation();

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  const runUpload = useCallback(
    async (item: UploadItem) => {
      try {
        const init = await initUpload.mutateAsync({
          filename: item.file.name,
          contentType: item.file.type as (typeof ACCEPTED_VIDEO_MIME_TYPES)[number],
          fileSize: item.file.size,
          folderId: item.folderId,
        });

        const parts = await uploadParts({
          file: item.file,
          parts: init.parts,
          partSize: init.partSize,
          signal: item.controller.signal,
          onProgress: (fraction) => patch(item.id, { progress: fraction }),
        });

        await completeUpload.mutateAsync({
          videoId: init.videoId,
          uploadId: init.uploadId,
          parts,
        });

        patch(item.id, { status: 'done', progress: 1 });
        onUploaded();

        // Best-effort cleanup if the user cancelled mid-finalize.
        if (item.controller.signal.aborted) {
          abortUpload.mutate({ videoId: init.videoId, uploadId: init.uploadId });
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          patch(item.id, { status: 'canceled' });
        } else {
          patch(item.id, {
            status: 'error',
            error: err instanceof Error ? err.message : 'Upload failed',
          });
        }
      }
    },
    [abortUpload, completeUpload, initUpload, onUploaded, patch],
  );

  const addFiles = useCallback(
    (files: FileList | File[], targetFolderId: string | null = folderId) => {
      const valid = Array.from(files).filter(
        (f) =>
          (ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(f.type) &&
          f.size <= MAX_VIDEO_BYTES,
      );
      const newItems: UploadItem[] = valid.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        progress: 0,
        status: 'uploading',
        controller: new AbortController(),
        folderId: targetFolderId,
      }));
      setItems((prev) => [...newItems, ...prev]);
      newItems.forEach(runUpload);
    },
    [runUpload, folderId],
  );

  const reset = useCallback(() => setItems([]), []);

  const inProgress = items.some((it) => it.status === 'uploading');

  return { items, addFiles, reset, inProgress };
}
