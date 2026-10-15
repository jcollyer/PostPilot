import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  PlatformColor,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { keepPreviousData } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';

import { PLATFORM_LABEL } from '../lib/dashboard-format';
import { trpc } from '../lib/trpc';
import {
  buildLibraryModel,
  searchQuery,
  type LibraryFolderRow,
  type LibraryMediaRow,
  type LibrarySource,
  type LibraryStatusTone,
} from '../models/library';
import { Disclosure } from './Disclosure';
import { Cell, Rule } from './GroupedCell';
import { PlatformGlyphs } from './PlatformGlyphs';

/**
 * One level of the Library: its folders, then its media, as two inset-grouped
 * lists. A folder row pushes another level (`/library/[folderId]`), so the
 * back button is the breadcrumb. The root also carries the header search bar;
 * a query swaps the level for a flat search across every folder. Media rows
 * show thumbnails only (videos never play here) and do nothing on tap yet.
 * All derivation lives in the Library model; this only maps it to views.
 */

const PAGE_SIZE = 30;
const SEARCH_DEBOUNCE_MS = 300;

type Section =
  | { key: 'folders'; data: LibraryFolderRow[] }
  | { key: 'media'; data: LibraryMediaRow[] };

const TONE_TEXT: Record<LibraryStatusTone, string> = {
  critical: 'text-signal-critical',
  warn: 'text-signal-warn',
  muted: 'text-ink-tertiary',
};

export function LibraryBrowser({
  parentId,
  searchable = false,
}: {
  parentId: string | null;
  searchable?: boolean;
}) {
  const router = useRouter();
  const [searchText, setSearchText] = useState('');
  const query = searchQuery(useDebounced(searchText, SEARCH_DEBOUNCE_MS));
  const [refreshing, setRefreshing] = useState(false);

  const connections = trpc.connections.overview.useQuery();
  const browse = trpc.folder.list.useInfiniteQuery(
    { parentId, limit: PAGE_SIZE },
    { getNextPageParam: (page) => page.media.nextCursor, enabled: query === null },
  );
  const search = trpc.media.list.useInfiniteQuery(
    { search: query ?? '', limit: PAGE_SIZE },
    {
      getNextPageParam: (page) => page.nextCursor,
      enabled: query !== null,
      // Keep the last results up while the next keystroke's search loads.
      placeholderData: keepPreviousData,
    },
  );
  const active = query === null ? browse : search;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([active.refetch(), connections.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  function onEndReached() {
    if (active.hasNextPage && !active.isFetchingNextPage) void active.fetchNextPage();
  }

  const header = searchable ? (
    <Stack.Screen
      options={{
        headerSearchBarOptions: {
          placeholder: 'Search media',
          autoCapitalize: 'none',
          hideWhenScrolling: false,
          onChangeText: (e) => setSearchText(e.nativeEvent.text),
          onCancelButtonPress: () => setSearchText(''),
        },
      }}
    />
  ) : null;

  const source: LibrarySource | null =
    query === null
      ? browse.data
        ? { kind: 'folder', pages: browse.data.pages }
        : null
      : search.data
        ? { kind: 'search', query, pages: search.data.pages }
        : null;

  if (active.isLoading || connections.isLoading) {
    return (
      <>
        {header}
        <View className="flex-1 items-center justify-center bg-ground">
          <ActivityIndicator size="large" color="#2d3f63" />
        </View>
      </>
    );
  }

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />;

  if (!source) {
    return (
      <>
        {header}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          className="flex-1 bg-ground"
          contentContainerStyle={{ padding: 20 }}
          refreshControl={refreshControl}
        >
          <Text className="text-sm text-ink-tertiary">
            Couldn’t reach PostPilot. Pull down to try again.
          </Text>
        </ScrollView>
      </>
    );
  }

  const model = buildLibraryModel(source, connections.data ?? [], new Date());
  const sections: Section[] = [];
  if (model.folders.length > 0) sections.push({ key: 'folders', data: model.folders });
  if (model.media.length > 0) sections.push({ key: 'media', data: model.media });

  return (
    <>
      {header}
      <SectionList<LibraryFolderRow | LibraryMediaRow, Section>
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        className="flex-1 bg-ground"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
        refreshControl={refreshControl}
        stickySectionHeadersEnabled={false}
        sections={sections}
        keyExtractor={(row) => row.id}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        // Folders then media, as two groups with the system's section gap between.
        renderSectionHeader={({ section }) =>
          section.key === 'media' && model.folders.length > 0 ? <View className="h-7" /> : null
        }
        renderItem={({ item, index, section }) => (
          <Cell first={index === 0} last={index === section.data.length - 1}>
            {index > 0 ? <Rule inset /> : null}
            {section.key === 'folders' ? (
              <FolderRow
                folder={item as LibraryFolderRow}
                onPress={() =>
                  router.push({
                    pathname: '/library/[folderId]',
                    params: { folderId: item.id, name: (item as LibraryFolderRow).name },
                  })
                }
              />
            ) : (
              <MediaRow row={item as LibraryMediaRow} />
            )}
          </Cell>
        )}
        ListEmptyComponent={
          model.empty ? (
            <Cell first last>
              <Text className="px-4 py-3.5 text-[15px] leading-5 text-ink-tertiary">
                {model.empty}
              </Text>
            </Cell>
          ) : null
        }
        ListFooterComponent={
          active.isFetchingNextPage ? (
            <View className="py-5">
              <ActivityIndicator color="#2d3f63" />
            </View>
          ) : null
        }
      />
    </>
  );
}

function FolderRow({ folder, onPress }: { folder: LibraryFolderRow; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${folder.name}, folder`}
      className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5 active:opacity-60"
    >
      {/* Same width as a thumbnail, so folder and media names share one edge. */}
      <View className="w-9 items-center">
        <SymbolView
          name="folder"
          size={22}
          tintColor={PlatformColor('secondaryLabel')}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      </View>
      <Text numberOfLines={1} className="flex-1 text-[15px] leading-5 text-ink">
        {folder.name}
      </Text>
      <Disclosure />
    </Pressable>
  );
}

function MediaRow({ row }: { row: LibraryMediaRow }) {
  const platforms = row.platforms.map((p) => PLATFORM_LABEL[p] ?? p).join(', ');
  return (
    <View
      accessible
      accessibilityLabel={[
        row.title,
        row.status.label,
        row.length?.label,
        platforms && `Posts to ${platforms}`,
      ]
        .filter(Boolean)
        .join('. ')}
      className="min-h-[68px] flex-row items-center gap-3 px-4 py-2.5"
    >
      {/* Portrait, because the library is short-form vertical video. */}
      <View className="h-12 w-9 overflow-hidden rounded-md bg-ground">
        {row.thumbnailUrl ? (
          <Image
            source={{ uri: row.thumbnailUrl }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            transition={150}
            recyclingKey={row.id}
            accessibilityIgnoresInvertColors
          />
        ) : null}
      </View>
      <View className="flex-1 gap-0.5">
        <Text numberOfLines={1} className="text-[15px] font-semibold leading-5 text-ink">
          {row.title}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text
            numberOfLines={1}
            className={`shrink text-[13px] leading-[18px] ${TONE_TEXT[row.status.tone]}`}
          >
            {row.status.label}
          </Text>
          {row.length ? <Length length={row.length} /> : null}
          <PlatformGlyphs platforms={row.platforms} />
        </View>
      </View>
    </View>
  );
}

/** "0:45", or a stacked glyph and "3 slides" for a carousel. */
function Length({ length }: { length: NonNullable<LibraryMediaRow['length']> }) {
  return (
    <View className="flex-row items-center gap-1">
      {length.kind === 'slides' ? (
        <SymbolView
          name="square.stack"
          size={12}
          tintColor={PlatformColor('secondaryLabel')}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      ) : null}
      <Text
        className="text-[13px] leading-[18px] text-ink-tertiary"
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {length.label}
      </Text>
    </View>
  );
}

/** `value`, once it has held still for `ms`. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return settled;
}
