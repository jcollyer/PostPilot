'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, Upload, X, AlertCircle, TriangleAlert } from 'lucide-react';

import { ACCEPTED_IMAGE_MIME_TYPES, ACCEPTED_VIDEO_MIME_TYPES } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import { formatBytes } from './upload';
import { useVideoUpload, type UploadItem, type UploadRejection } from './useVideoUpload';
import { readDroppedContents } from './dropped-entries';
import { importDroppedFolders } from './import-dropped';

const ACCEPT = [...ACCEPTED_VIDEO_MIME_TYPES, ...ACCEPTED_IMAGE_MIME_TYPES].join(',');

export function UploadDialog({
  onUploaded,
  folderId = null,
}: {
  onUploaded: () => void;
  /** Folder new uploads land in (null = the root). */
  folderId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { items, rejections, addFiles, reset, clearRejections, inProgress } = useVideoUpload({
    folderId,
    onUploaded,
  });
  const utils = trpc.useUtils();
  const createFolder = trpc.folder.create.useMutation();

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  };

  const handleDrop = async (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(false);
    const { looseFiles, folders } = await readDroppedContents(e.dataTransfer);

    if (looseFiles.length) addFiles(looseFiles);

    // Rebuild each dropped folder tree (subfolders included) under the current
    // folder, uploading every file into its matching folder.
    const touchedFolders = await importDroppedFolders(folders, {
      parentId: folderId,
      createFolder: (name, parentId) => createFolder.mutateAsync({ name, parentId }),
      fetchSiblings: (parentId) => utils.folder.children.fetch({ parentId }),
      addFiles,
    });

    if (touchedFolders) {
      void utils.folder.list.invalidate();
      void utils.folder.children.invalidate();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Don't let the dialog close out from under an active upload.
        if (!next && inProgress) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Upload videos
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload videos</DialogTitle>
          <DialogDescription>
            Drop a batch of videos here — they upload straight to storage. You can keep working;
            we&apos;ll process them in the background.
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
        >
          <Upload className="text-muted-foreground h-6 w-6" />
          <span className="font-medium">Drop videos or a folder, or click to browse</span>
          <span className="text-muted-foreground text-xs">
            MP4, MOV, or WebM · up to 10 GB each · drop a folder to keep it grouped
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={onSelect}
        />

        <UploadItemList items={items} rejections={rejections} onDismissRejections={clearRejections} />
      </DialogContent>
    </Dialog>
  );
}

export function UploadItemList({
  items,
  rejections = [],
  onDismissRejections,
}: {
  items: UploadItem[];
  rejections?: UploadRejection[];
  onDismissRejections?: () => void;
}) {
  if (items.length === 0 && rejections.length === 0) return null;
  return (
    <div className="space-y-2">
      {rejections.length > 0 ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-md border p-3 text-left text-xs">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">
                {rejections.length === 1
                  ? "1 file wasn't uploaded"
                  : `${rejections.length} files weren't uploaded`}
              </p>
              <ul className="mt-1 space-y-0.5">
                {rejections.map((r) => (
                  <li key={r.id} className="truncate">
                    <span className="font-medium">{r.name}</span> — {r.reason}
                  </li>
                ))}
              </ul>
            </div>
            {onDismissRejections ? (
              <button
                type="button"
                onClick={onDismissRejections}
                aria-label="Dismiss"
                className="hover:text-foreground shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="max-h-64 space-y-2 overflow-y-auto">
          {items.map((it) => (
            <li key={it.id} className="rounded-md border p-3 text-left">
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{it.file.name}</span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatBytes(it.file.size)}
                </span>
                <UploadStatusIcon item={it} onCancel={() => it.controller.abort()} />
              </div>
              {it.status === 'uploading' ? (
                <div className="bg-muted mt-2 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-[width]"
                    style={{ width: `${Math.round(it.progress * 100)}%` }}
                  />
                </div>
              ) : null}
              {it.status === 'error' ? (
                <p className="text-destructive mt-1 text-xs">{it.error}</p>
              ) : null}
              {it.warning && it.status !== 'error' ? (
                <p className="text-muted-foreground mt-1 flex items-start gap-1 text-xs">
                  <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                  <span>{it.warning}</span>
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function UploadStatusIcon({ item, onCancel }: { item: UploadItem; onCancel: () => void }) {
  if (item.status === 'done') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (item.status === 'error') return <AlertCircle className="text-destructive h-4 w-4 shrink-0" />;
  if (item.status === 'canceled')
    return <span className="text-muted-foreground shrink-0 text-xs">Canceled</span>;
  return (
    <button
      type="button"
      onClick={onCancel}
      aria-label="Cancel upload"
      className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1"
    >
      <Loader2 className="h-4 w-4 animate-spin" />
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
