import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '../../../../src/components/Button';
import { TONE_TEXT } from '../../../../src/components/LibraryBrowser';
import { LibraryItemPreview } from '../../../../src/components/LibraryItemPreview';
import { PlatformGlyphs } from '../../../../src/components/PlatformGlyphs';
import { trpc } from '../../../../src/lib/trpc';
import { useAddToQueue } from '../../../../src/lib/use-add-to-queue';
import {
  buildLibraryItemDetail,
  type LibraryItemDetail,
  type LibraryItemPost,
} from '../../../../src/models/library-item';

/**
 * Library item detail, pushed from a media row at `/library/item/<mediaId>`.
 * The row passes its media type (videos and images are separate procedures)
 * and title (so the header reads right while loading). Shows the media (an
 * inline video, or a slide pager), then the item's read-only details and a
 * View post link per platform it went out to. All derivation lives in the
 * Library item model.
 *
 * Its one action, Add to queue, sits under the status. A TikTok-bound video
 * asks for TikTok's consent in a sheet (`/library/add-to-queue/<mediaId>`);
 * anything else asks in a plain alert.
 */

export default function LibraryItemScreen() {
  const { mediaId, mediaType, title } = useLocalSearchParams<{
    mediaId: string;
    mediaType: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
    title?: string;
  }>();
  const isVideo = mediaType === 'VIDEO';
  const [refreshing, setRefreshing] = useState(false);

  const connections = trpc.connections.overview.useQuery();
  const video = trpc.media.get.useQuery({ videoId: mediaId }, { enabled: isVideo });
  const image = trpc.media.getImage.useQuery({ imageId: mediaId }, { enabled: !isVideo });
  const item = isVideo ? video : image;

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([item.refetch(), connections.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  const detail = item.data
    ? buildLibraryItemDetail(item.data, connections.data ?? [], new Date())
    : null;
  const header = <Stack.Screen options={{ title: detail?.title ?? title ?? '' }} />;

  if (item.isLoading || connections.isLoading) {
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

  if (!detail) {
    return (
      <>
        {header}
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          className="flex-1 bg-ground"
          contentContainerStyle={{ padding: 20 }}
          refreshControl={refreshControl}
        >
          <Text className="text-[15px] leading-5 text-ink-tertiary">
            {item.error?.data?.code === 'NOT_FOUND'
              ? 'This item is no longer in your library.'
              : 'Couldn’t reach PostPilot. Pull down to try again.'}
          </Text>
        </ScrollView>
      </>
    );
  }

  return (
    <>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1 bg-ground"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
        refreshControl={refreshControl}
      >
        <LibraryItemPreview preview={detail.preview} title={detail.title} />

        <View className="mt-6 gap-0.5">
          <Text
            accessibilityRole="header"
            selectable
            className="text-[20px] font-semibold leading-7 text-ink"
          >
            {detail.title}
          </Text>
          <Text className={`text-[15px] leading-5 ${TONE_TEXT[detail.status.tone]}`}>
            {detail.status.label}
          </Text>
        </View>

        <QueueAction detail={detail} mediaType={mediaType} />

        <Details detail={detail} />
        <Words detail={detail} />
        {detail.posts.length > 0 ? <Posts posts={detail.posts} /> : null}
      </ScrollView>
    </>
  );
}

/** Add to queue, disabled with its reason, or View in Queue once it's queued. */
function QueueAction({
  detail,
  mediaType,
}: {
  detail: LibraryItemDetail;
  mediaType: 'VIDEO' | 'IMAGE' | 'CAROUSEL';
}) {
  const router = useRouter();
  const { add, isPending } = useAddToQueue();
  const action = detail.queue;

  function onPress() {
    switch (action.kind) {
      case 'viewInQueue':
        router.navigate('/queue');
        return;
      case 'disabled':
        return;
      case 'add': {
        const { confirm } = action;
        if (confirm.kind === 'tiktokConsent') {
          router.push({
            pathname: '/library/add-to-queue/[mediaId]',
            params: { mediaId: detail.id },
          });
          return;
        }
        Alert.alert(confirm.title, confirm.message, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: action.label,
            isPreferred: true,
            onPress: () => add({ id: detail.id, mediaType }),
          },
        ]);
      }
    }
  }

  return (
    <View className="mt-5 gap-2">
      <Button
        variant={action.kind === 'viewInQueue' ? 'outline' : 'primary'}
        disabled={action.kind === 'disabled'}
        loading={isPending}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityHint={
          action.kind === 'disabled'
            ? action.reason
            : action.kind === 'viewInQueue'
              ? 'Opens the Queue tab'
              : undefined
        }
        accessibilityState={{ disabled: action.kind === 'disabled', busy: isPending }}
      >
        {action.label}
      </Button>
      {action.kind === 'disabled' ? (
        <Text className="text-[13px] leading-[18px] text-ink-tertiary">{action.reason}</Text>
      ) : null}
    </View>
  );
}

/** Where it posts and how it's filed. */
function Details({ detail }: { detail: LibraryItemDetail }) {
  return (
    <Group>
      <Field label="Posts to" value={detail.postsTo.label} first>
        <PlatformGlyphs platforms={detail.postsTo.platforms} />
      </Field>
      <Field label="Category" value={detail.category ?? 'None'} />
    </Group>
  );
}

/** What it says when it posts: caption, then hashtags. */
function Words({ detail }: { detail: LibraryItemDetail }) {
  return (
    <Group heading="Caption">
      <View className="gap-2 px-4 py-3">
        <Text
          selectable
          className={`text-[15px] leading-5 ${detail.caption ? 'text-ink' : 'text-ink-tertiary'}`}
        >
          {detail.caption ?? 'No caption'}
        </Text>
        {detail.hashtags ? (
          <Text selectable className="text-[15px] leading-5 text-ink-secondary">
            {detail.hashtags}
          </Text>
        ) : null}
      </View>
    </Group>
  );
}

function Posts({ posts }: { posts: LibraryItemPost[] }) {
  return (
    <Group heading="Posted">
      {posts.map((post, i) => (
        <View key={post.key}>
          {/* Starts at the platform name, past the 13pt glyph and its 8pt gap. */}
          {i > 0 ? <View className="ml-[37px] h-px bg-hairline" /> : null}
          <View className="gap-1 px-4 py-3">
            <View accessible accessibilityLabel={`${post.name}. ${post.posted}`} className="gap-0.5">
              <View className="flex-row items-center gap-2">
                <PlatformGlyphs platforms={[post.platform]} />
                <Text className="text-[15px] font-semibold leading-5 text-ink">{post.name}</Text>
              </View>
              <Text className="text-[13px] leading-[18px] text-ink-tertiary">{post.posted}</Text>
            </View>
            {post.postUrl ? <ViewPostLink url={post.postUrl} name={post.name} /> : null}
          </View>
        </View>
      ))}
    </Group>
  );
}

function ViewPostLink({ url, name }: { url: string; name: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => Alert.alert('Couldn’t open the post', url))}
      accessibilityRole="link"
      accessibilityLabel={`View post on ${name}`}
      hitSlop={8}
      className="min-h-[32px] justify-center self-start active:opacity-60"
    >
      <Text className="text-[15px] text-primary">View post</Text>
    </Pressable>
  );
}

/** An inset-grouped list with an optional section heading above it. */
function Group({ heading, children }: { heading?: string; children: React.ReactNode }) {
  return (
    <View className="mt-7">
      {heading ? (
        <Text
          accessibilityRole="header"
          className="mb-1.5 px-4 text-[12px] font-medium uppercase leading-4 tracking-wide text-ink-tertiary"
        >
          {heading}
        </Text>
      ) : null}
      <View className="overflow-hidden rounded-xl border border-hairline bg-surface">
        {children}
      </View>
    </View>
  );
}

/** A label on the left, its value on the right, like a native read-only cell. */
function Field({
  label,
  value,
  first = false,
  children,
}: {
  label: string;
  value: string;
  first?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      {first ? null : <View className="ml-4 h-px bg-hairline" />}
      <View
        accessible
        accessibilityLabel={`${label}, ${value}`}
        className="min-h-[44px] flex-row items-center justify-between gap-4 px-4 py-3"
      >
        <Text className="text-[15px] leading-5 text-ink">{label}</Text>
        <View className="shrink flex-row items-center gap-2">
          {children}
          <Text className="shrink text-right text-[15px] leading-5 text-ink-tertiary">{value}</Text>
        </View>
      </View>
    </>
  );
}
