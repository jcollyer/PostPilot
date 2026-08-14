'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { trpc } from '@/lib/trpc/client';
import { CarouselBuilderDialog } from '@/features/media/CarouselBuilderDialog';
import { EditMetadataPanel } from '@/features/media/EditMetadataDialog';
import { ImageEditPanel } from '@/features/media/ImageEditDialog';

/** The library record behind a queue row — what to edit, and with which editor. */
export interface QueueEditTarget {
  mediaId: string;
  mediaType: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
}

/**
 * The Media Library's "Edit details" panel, opened from a queue row.
 *
 * Reuses the library's editors as-is (video vs photo/carousel) instead of
 * duplicating them, so a post edited from the queue behaves exactly as it does
 * from the library. Queue rows carry only a title and thumbnail, so the record
 * is fetched here first — the sheet opens right away and the editor drops into
 * it once loaded. Rendering the loading state as its own sheet instead would
 * tear that sheet down when the data landed, which reads as the panel closing
 * and reopening.
 */
export function QueueItemEditDialog({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: QueueEditTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isVideo = target.mediaType === 'VIDEO';
  const video = trpc.media.get.useQuery({ videoId: target.mediaId }, { enabled: open && isVideo });
  const image = trpc.media.getImage.useQuery(
    { imageId: target.mediaId },
    { enabled: open && !isVideo },
  );
  // A photo can become a carousel from its edit panel, same as in the library.
  const [buildingCarousel, setBuildingCarousel] = useState(false);

  const close = () => onOpenChange(false);

  // The carousel builder is a centered dialog of its own, so it replaces the
  // sheet outright — the same hand-off the library makes.
  if (buildingCarousel && image.data) {
    return (
      <CarouselBuilderDialog
        image={image.data}
        open={open}
        onOpenChange={(o) => {
          if (o) return;
          setBuildingCarousel(false);
          close();
        }}
        onSaved={onSaved}
      />
    );
  }

  const error = isVideo ? video.error : image.error;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0">
        {isVideo && video.data ? (
          <EditMetadataPanel video={video.data} onClose={close} onSaved={onSaved} />
        ) : !isVideo && image.data ? (
          <ImageEditPanel
            image={image.data}
            onClose={close}
            onSaved={onSaved}
            onMakeCarousel={() => setBuildingCarousel(true)}
          />
        ) : (
          <>
            <SheetHeader className="border-b p-6 pr-12">
              <SheetTitle>Edit details</SheetTitle>
              <SheetDescription>
                {error ? "This post's details couldn't be loaded." : 'Loading this post…'}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-1 items-center justify-center p-6">
              {error ? (
                <p className="text-destructive text-sm">{error.message}</p>
              ) : (
                <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
