'use client';

import { useState } from 'react';
import { Instagram, Layers, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { trpc } from '@/lib/trpc/client';
import { HashtagInput } from './EditMetadataDialog';
import {
  useConnectedPlatforms,
  usePlatformAccountLabels,
  usePlatformAvatarUrls,
} from './PlatformTargets';
import type { ImageDto } from './types';

/**
 * Edit-details panel for a photo / carousel. Deliberately simpler than the video
 * editor: images are Instagram-only, so there's no "AI thumbnail suggestions"
 * section (the photo is the visual) and no "Per-platform data" section (only one
 * destination). Instead it shows an image preview with a "Make carousel" button.
 */
export function ImageEditDialog({
  image,
  open,
  onOpenChange,
  onSaved,
  onMakeCarousel,
}: {
  image: ImageDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onMakeCarousel: () => void;
}) {
  const [title, setTitle] = useState(image.title ?? '');
  const [caption, setCaption] = useState(image.caption ?? '');
  const [hashtags, setHashtags] = useState<string[]>(image.hashtags ?? []);
  const [categoryId, setCategoryId] = useState(image.categoryId ?? '');

  const isCarousel = image.mediaType === 'CAROUSEL';

  // Images are Instagram-only, so surface which IG account this will post to.
  const { connected } = useConnectedPlatforms();
  const igConnected = connected.has('INSTAGRAM');
  const igLabel = usePlatformAccountLabels().INSTAGRAM;
  const igAvatar = usePlatformAvatarUrls().INSTAGRAM;
  const igHandle = igLabel ? (igLabel.startsWith('@') ? igLabel : `@${igLabel}`) : null;

  const categories = trpc.media.listCategories.useQuery();
  const detail = trpc.media.getImage.useQuery({ imageId: image.id }, { enabled: open });
  const updateMetadata = trpc.media.updateImageMetadata.useMutation();

  const slides = detail.data
    ? [detail.data.cdnUrl, ...detail.data.carouselChildren.map((c) => c.cdnUrl)].filter(
        (u): u is string => Boolean(u),
      )
    : [image.thumbnailUrl].filter((u): u is string => Boolean(u));

  const save = async () => {
    await updateMetadata.mutateAsync({
      imageId: image.id,
      title: title.trim() || null,
      caption: caption.trim() || null,
      hashtags,
      categoryId: categoryId || null,
    });
    onSaved();
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="gap-0 p-0">
        <SheetHeader className="border-b p-6 pr-12">
          <SheetTitle>Edit details</SheetTitle>
          <SheetDescription>
            Title, caption, and hashtags for this {isCarousel ? 'carousel' : 'photo'}.
          </SheetDescription>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-muted-foreground text-xs">Posting to</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border bg-muted/40 py-0.5 pl-0.5 pr-2 text-xs font-medium">
              {igConnected && igAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={igAvatar}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-red-500 to-amber-400 text-white">
                  <Instagram className="h-3 w-3" />
                </span>
              )}
              <span>Instagram</span>
              {igConnected && igHandle ? (
                <span className="text-muted-foreground font-normal">· {igHandle}</span>
              ) : !igConnected ? (
                <span className="text-muted-foreground font-normal">· not connected yet</span>
              ) : null}
            </span>
          </div>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {/* Preview + Make carousel */}
          <div className="space-y-2">
            <div className="bg-muted relative overflow-hidden rounded-md border">
              {slides[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slides[0]}
                  alt={image.title ?? 'Photo'}
                  className="max-h-64 w-full object-contain"
                />
              ) : null}
              {isCarousel ? (
                <span className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  <Layers className="h-3 w-3" /> {slides.length} slides
                </span>
              ) : null}
            </div>
            {isCarousel && slides.length > 1 ? (
              <div className="grid grid-cols-4 gap-1.5">
                {slides.slice(1).map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    alt={`Slide ${i + 2}`}
                    className="aspect-square w-full rounded border object-cover"
                  />
                ))}
                <button
                  type="button"
                  onClick={onMakeCarousel}
                  className="text-muted-foreground hover:border-foreground/30 hover:bg-muted hover:text-foreground flex aspect-square w-full flex-col items-center justify-center gap-1 rounded border border-dashed text-xs font-medium transition"
                >
                  <Layers className="h-4 w-4" />
                  Edit
                </button>
              </div>
            ) : (
              <Button variant="outline" className="w-full" onClick={onMakeCarousel}>
                <Layers className="mr-2 h-4 w-4" />
                {isCarousel ? 'Edit carousel' : 'Make carousel'}
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image-title">Title</Label>
            <Input
              id="image-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Give this photo a title"
              maxLength={150}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image-caption">Caption</Label>
            <textarea
              id="image-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write a caption…"
              rows={4}
              className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image-hashtags">Hashtags</Label>
            <HashtagInput
              id="image-hashtags"
              value={hashtags}
              onChange={setHashtags}
              placeholder="travel sunset city"
            />
            <p className="text-muted-foreground text-xs">
              Press Enter or comma to turn text into a tag.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="image-category">Category</Label>
            <Select
              value={categoryId || 'none'}
              onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}
            >
              <SelectTrigger id="image-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No category</SelectItem>
                {categories.data?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <SheetFooter className="border-t p-6">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateMetadata.isPending}
          >
            Cancel
          </Button>
          <Button onClick={save} disabled={updateMetadata.isPending}>
            {updateMetadata.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
