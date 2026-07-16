'use client';

import { useCallback, useState } from 'react';

import {
  ACCEPTED_IMAGE_MIME_TYPES,
  ACCEPTED_VIDEO_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  videoExceedsAiLimit,
} from '@postpilot/types';

import { trpc } from '@/lib/trpc/client';
import { formatBytes, putObject, uploadParts } from './upload';

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
  /**
   * Non-blocking heads-up shown while the file uploads normally: it's within
   * the hard upload cap but over the AI-metadata limit, so it'll post fine but
   * won't get auto-generated metadata. Undefined = no warning.
   */
  warning?: string;
}

/** A file we refused to upload because it exceeds the hard size cap. */
export interface UploadRejection {
  id: string;
  name: string;
  reason: string;
}

/**
 * Read a video's duration in the browser via a throwaway <video> element.
 * Resolves null if the metadata can't be read (unsupported codec, error) so a
 * failed probe simply means "no duration warning", never a broken upload.
 */
function probeVideoDurationSec(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    el.src = url;
  });
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
  const [rejections, setRejections] = useState<UploadRejection[]>([]);

  const initUpload = trpc.media.initUpload.useMutation();
  const completeUpload = trpc.media.completeUpload.useMutation();
  const abortUpload = trpc.media.abortUpload.useMutation();
  const initImageUpload = trpc.media.initImageUpload.useMutation();
  const completeImageUpload = trpc.media.completeImageUpload.useMutation();

  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }, []);

  const isImageFile = (file: File): boolean =>
    (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(file.type);

  const runUpload = useCallback(
    async (item: UploadItem) => {
      try {
        // Photos take the single-PUT path (small files, no multipart); videos
        // go through the multipart engine.
        if (isImageFile(item.file)) {
          const init = await initImageUpload.mutateAsync({
            filename: item.file.name,
            contentType: item.file.type as (typeof ACCEPTED_IMAGE_MIME_TYPES)[number],
            fileSize: item.file.size,
            folderId: item.folderId,
          });
          await putObject(init.url, item.file, item.controller.signal);
          await completeImageUpload.mutateAsync({ imageId: init.imageId });
          patch(item.id, { status: 'done', progress: 1 });
          onUploaded();
          return;
        }

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
    [
      abortUpload,
      completeUpload,
      initUpload,
      completeImageUpload,
      initImageUpload,
      onUploaded,
      patch,
    ],
  );

  const addFiles = useCallback(
    (files: FileList | File[], targetFolderId: string | null = folderId) => {
      const valid: File[] = [];
      const rejected: UploadRejection[] = [];
      for (const f of Array.from(files)) {
        const isVideo = (ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(f.type);
        const isImage = (ACCEPTED_IMAGE_MIME_TYPES as readonly string[]).includes(f.type);
        const id = `${f.name}-${f.size}-${crypto.randomUUID()}`;
        if (isVideo && f.size > MAX_VIDEO_BYTES) {
          rejected.push({ id, name: f.name, reason: `over the 10 GB limit (${formatBytes(f.size)})` });
        } else if (isImage && f.size > MAX_IMAGE_BYTES) {
          rejected.push({ id, name: f.name, reason: `over the 30 MB limit (${formatBytes(f.size)})` });
        } else if (isVideo || isImage) {
          valid.push(f);
        } else {
          rejected.push({ id, name: f.name, reason: 'unsupported file type' });
        }
      }

      if (rejected.length) setRejections((prev) => [...rejected, ...prev]);

      const newItems: UploadItem[] = valid.map((file) => ({
        id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
        file,
        progress: 0,
        status: 'uploading',
        controller: new AbortController(),
        folderId: targetFolderId,
        // Size-based AI warning is known immediately; duration is probed below.
        warning:
          (ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(file.type)
            ? (videoExceedsAiLimit({ sizeBytes: file.size }) ?? undefined)
            : undefined,
      }));
      setItems((prev) => [...newItems, ...prev]);
      newItems.forEach(runUpload);

      // Probe duration for videos not already flagged on size, and add a warning
      // if they're too long. Fire-and-forget: it never blocks the upload.
      for (const item of newItems) {
        if (item.warning) continue;
        if (!(ACCEPTED_VIDEO_MIME_TYPES as readonly string[]).includes(item.file.type)) continue;
        void probeVideoDurationSec(item.file).then((durationSec) => {
          const warning = videoExceedsAiLimit({ durationSec });
          if (warning) patch(item.id, { warning });
        });
      }
    },
    [runUpload, folderId, patch],
  );

  const reset = useCallback(() => {
    setItems([]);
    setRejections([]);
  }, []);

  const clearRejections = useCallback(() => setRejections([]), []);

  const inProgress = items.some((it) => it.status === 'uploading');

  return { items, rejections, addFiles, reset, clearRejections, inProgress };
}
