'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, ImageIcon, Loader2, Plus, X } from 'lucide-react';

import { MAX_CAROUSEL_ITEMS } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { FolderTree } from './FolderTree';
import type { ImageDto } from './types';

/** A slide in the working carousel: the child image's id + its thumbnail. */
interface Slide {
  id: string;
  cdnUrl: string | null;
}

/**
 * Build (or edit) a carousel. The parent image is always slide 1 and can't be
 * removed; the remaining slides are other library images added via the picker.
 * Saving persists the ordered child-image ids; an empty list turns the carousel
 * back into a single photo.
 */
export function CarouselBuilderDialog({
  image,
  open,
  onOpenChange,
  onSaved,
}: {
  image: ImageDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  // Load fresh detail so we start from the current, persisted slide list.
  const detail = trpc.media.getImage.useQuery({ imageId: image.id }, { enabled: open });

  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  // Initialize the working list once detail arrives (children only — slide 1 is
  // the parent's own file, rendered separately and never in this array). Memoized
  // so it's a stable reference (it feeds the excludeIds useMemo below).
  const current: Slide[] = useMemo(
    () =>
      slides ??
      (detail.data?.carouselChildren.map((c) => ({ id: c.id, cdnUrl: c.cdnUrl })) ?? []),
    [slides, detail.data],
  );

  const setItems = trpc.media.setCarouselItems.useMutation({
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
  });

  const remaining = MAX_CAROUSEL_ITEMS - 1 - current.length; // extra slides left

  const removeAt = (i: number) =>
    setSlides(current.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= current.length) return;
    const next = [...current];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSlides(next);
  };

  const addSlides = (added: Slide[]) => {
    const existing = new Set(current.map((s) => s.id));
    const merged = [...current];
    for (const s of added) {
      if (!existing.has(s.id) && merged.length < MAX_CAROUSEL_ITEMS - 1) merged.push(s);
    }
    setSlides(merged);
    setPickerOpen(false);
  };

  const save = () =>
    setItems.mutate({ imageId: image.id, childImageIds: current.map((s) => s.id) });

  const parentUrl = detail.data?.cdnUrl ?? image.thumbnailUrl ?? null;

  // The parent and current children can't be re-added in the picker.
  const excludeIds = useMemo(
    () => new Set([image.id, ...current.map((s) => s.id)]),
    [image.id, current],
  );

  return (
    <>
      <Dialog open={open && !pickerOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{current.length > 0 ? 'Edit carousel' : 'Make carousel'}</DialogTitle>
            <DialogDescription>
              The first slide is this photo. Add up to {MAX_CAROUSEL_ITEMS - 1} more, then drag the
              arrows to reorder. Posts to Instagram as a carousel.
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-y-auto p-1 sm:grid-cols-4">
            {/* Slide 1 — the parent image, fixed. */}
            <div className="relative aspect-square overflow-hidden rounded-md border">
              {parentUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={parentUrl} alt="Slide 1" className="h-full w-full object-cover" />
              ) : (
                <ImageIcon className="text-muted-foreground absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" />
              )}
              <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                1
              </span>
            </div>

            {/* Added child slides. */}
            {current.map((slide, i) => (
              <div
                key={slide.id}
                className="group relative aspect-square overflow-hidden rounded-md border"
              >
                {slide.cdnUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.cdnUrl}
                    alt={`Slide ${i + 2}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="text-muted-foreground absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" />
                )}
                <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {i + 2}
                </span>
                <button
                  type="button"
                  aria-label="Remove slide"
                  onClick={() => removeAt(i)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="Move earlier"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-white disabled:opacity-30"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move later"
                    onClick={() => move(i, 1)}
                    disabled={i === current.length - 1}
                    className="text-white disabled:opacity-30"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {/* Trailing "add" tile — always last. */}
            {remaining > 0 ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-muted-foreground hover:border-primary hover:text-foreground flex aspect-square items-center justify-center rounded-md border border-dashed"
              >
                <Plus className="h-6 w-6" />
              </button>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={setItems.isPending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={setItems.isPending}>
              {setItems.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {current.length > 0 ? 'Save carousel' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImagePickerModal
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        excludeIds={excludeIds}
        maxAddable={remaining}
        onAdd={addSlides}
      />
    </>
  );
}

/**
 * The picker: a folder tree on the left and the opened folder's images on the
 * right. Multi-select photos, then "Add to carousel" appends them and closes.
 */
function ImagePickerModal({
  open,
  onOpenChange,
  excludeIds,
  maxAddable,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  excludeIds: Set<string>;
  maxAddable: number;
  onAdd: (slides: Slide[]) => void;
}) {
  const [folderId, setFolderId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, Slide>>(new Map());

  const images = trpc.media.listImagesInFolder.useQuery(
    { folderId },
    { enabled: open },
  );

  // Only plain photos can be slides — carousels and the excluded ids are hidden.
  const selectable = (images.data ?? []).filter(
    (img) => img.mediaType === 'IMAGE' && !excludeIds.has(img.id),
  );

  const toggle = (img: (typeof selectable)[number]) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(img.id)) {
        next.delete(img.id);
      } else if (next.size < maxAddable) {
        next.set(img.id, { id: img.id, cdnUrl: img.cdnUrl });
      }
      return next;
    });
  };

  const confirm = () => {
    onAdd([...picked.values()]);
    setPicked(new Map());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPicked(new Map());
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add photos to the carousel</DialogTitle>
          <DialogDescription>
            Pick a folder on the left, then select photos to add ({maxAddable} slot
            {maxAddable === 1 ? '' : 's'} left).
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-[55vh] gap-4">
          <div className="w-52 shrink-0 overflow-y-auto border-r pr-2">
            <FolderTree currentFolderId={folderId} onSelect={setFolderId} />
          </div>

          <div className="flex-1 overflow-y-auto">
            {images.isLoading ? (
              <div className="text-muted-foreground flex items-center gap-2 py-16 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading photos…
              </div>
            ) : selectable.length === 0 ? (
              <div className="text-muted-foreground py-16 text-center text-sm">
                No photos in this folder.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {selectable.map((img) => {
                  const isPicked = picked.has(img.id);
                  const atLimit = !isPicked && picked.size >= maxAddable;
                  return (
                    <button
                      key={img.id}
                      type="button"
                      onClick={() => toggle(img)}
                      disabled={atLimit}
                      className={cn(
                        'relative aspect-square overflow-hidden rounded-md border-2 transition disabled:cursor-not-allowed disabled:opacity-40',
                        isPicked ? 'border-primary' : 'border-transparent hover:border-muted-foreground/40',
                      )}
                    >
                      {img.cdnUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={img.cdnUrl}
                          alt={img.title ?? 'Photo'}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="text-muted-foreground absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2" />
                      )}
                      {isPicked ? (
                        <span className="bg-primary absolute right-1 top-1 rounded-full p-0.5 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={picked.size === 0}>
            <Plus className="mr-2 h-4 w-4" />
            Add to carousel{picked.size > 0 ? ` (${picked.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
