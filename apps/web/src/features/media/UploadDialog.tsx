'use client';

import { useRef, useState } from 'react';
import { CheckCircle2, Loader2, Upload, X, AlertCircle } from 'lucide-react';

import { ACCEPTED_VIDEO_MIME_TYPES } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { formatBytes } from './upload';
import { useVideoUpload, type UploadItem } from './useVideoUpload';

const ACCEPT = ACCEPTED_VIDEO_MIME_TYPES.join(',');

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

  const { items, addFiles, reset, inProgress } = useVideoUpload({ folderId, onUploaded });

  const onSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
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
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
          }}
          className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm transition-colors ${
            dragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
        >
          <Upload className="text-muted-foreground h-6 w-6" />
          <span className="font-medium">Drop videos or click to browse</span>
          <span className="text-muted-foreground text-xs">
            MP4, MOV, or WebM · up to 10 GB each
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

        <UploadItemList items={items} />
      </DialogContent>
    </Dialog>
  );
}

export function UploadItemList({ items }: { items: UploadItem[] }) {
  if (items.length === 0) return null;
  return (
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
        </li>
      ))}
    </ul>
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
