import { useState } from 'react';
import {
  FlatList,
  PlatformColor,
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';

import type { LibraryItemPreview as Preview, LibraryItemSlide } from '../models/library-item';

/**
 * The media at the top of a Library item's detail: a video's poster that
 * plays inline on tap, or a swipeable pager of a photo's or carousel's slides
 * with page dots. The frame takes the media's own shape, capped so a vertical
 * video leaves the details in view.
 */

/** Screen gutter each side; matches the detail screen's padding. */
const GUTTER = 20;
/** Tallest the frame gets, as a share of the screen height. */
const MAX_HEIGHT_SHARE = 0.6;

export function LibraryItemPreview({ preview, title }: { preview: Preview; title: string }) {
  const window = useWindowDimensions();
  const maxWidth = window.width - GUTTER * 2;
  const height = Math.min(maxWidth / preview.aspectRatio, window.height * MAX_HEIGHT_SHARE);
  const frame = { width: Math.round(height * preview.aspectRatio), height: Math.round(height) };

  return preview.kind === 'video' ? (
    <VideoPreview preview={preview} title={title} frame={frame} />
  ) : (
    <SlidePager slides={preview.slides} frame={frame} />
  );
}

type Frame = { width: number; height: number };

function VideoPreview({
  preview,
  title,
  frame,
}: {
  preview: Extract<Preview, { kind: 'video' }>;
  title: string;
  frame: Frame;
}) {
  const [playing, setPlaying] = useState(false);
  const uri = preview.uri;

  return (
    <View className="items-center gap-3">
      <View className="overflow-hidden rounded-xl bg-black" style={frame}>
        {playing && uri ? (
          <InlineVideo uri={uri} />
        ) : (
          <Pressable
            onPress={() => setPlaying(true)}
            disabled={!uri}
            accessibilityRole="button"
            accessibilityLabel={uri ? `Play ${title}` : `${title}, video`}
            accessibilityState={{ disabled: !uri }}
            className="flex-1 items-center justify-center active:opacity-80"
          >
            {preview.posterUrl ? (
              <Image
                source={{ uri: preview.posterUrl }}
                style={{ position: 'absolute', width: '100%', height: '100%' }}
                contentFit="cover"
                transition={150}
                accessibilityIgnoresInvertColors
              />
            ) : null}
            {uri ? (
              // A scrim, not a shadow: it keeps the glyph legible on any frame.
              <View className="h-16 w-16 items-center justify-center rounded-full bg-black/50">
                <SymbolView
                  name="play.fill"
                  size={28}
                  tintColor="white"
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
              </View>
            ) : null}
          </Pressable>
        )}
      </View>
      {preview.unavailable ? (
        <Text className="text-center text-[13px] leading-[18px] text-ink-tertiary">
          {preview.unavailable}
        </Text>
      ) : null}
    </View>
  );
}

/** Mounted on the first tap, so the list and the detail never load a player unasked. */
function InlineVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => p.play());
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ width: '100%', height: '100%' }}
    />
  );
}

function SlidePager({ slides, frame }: { slides: LibraryItemSlide[]; frame: Frame }) {
  const [page, setPage] = useState(0);

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / frame.width);
    if (next !== page) setPage(Math.min(Math.max(next, 0), slides.length - 1));
  }

  return (
    <View className="items-center gap-3">
      <View className="overflow-hidden rounded-xl bg-surface" style={frame}>
        <FlatList
          data={slides}
          keyExtractor={(slide) => slide.key}
          horizontal
          pagingEnabled
          bounces={slides.length > 1}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={32}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item.uri }}
              style={frame}
              contentFit="contain"
              transition={150}
              accessible
              accessibilityRole="image"
              accessibilityLabel={item.label}
              accessibilityIgnoresInvertColors
            />
          )}
        />
      </View>
      {slides.length > 1 ? <PageDots count={slides.length} page={page} /> : null}
    </View>
  );
}

/** iOS page-control dots: the current page in the label colour, the rest quieter. */
function PageDots({ count, page }: { count: number; page: number }) {
  return (
    <View
      className="flex-row items-center gap-2"
      // The pages carry "Slide N of M" themselves.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          className="h-[7px] w-[7px] rounded-full"
          style={{
            backgroundColor: PlatformColor(i === page ? 'label' : 'tertiaryLabel'),
          }}
        />
      ))}
    </View>
  );
}
