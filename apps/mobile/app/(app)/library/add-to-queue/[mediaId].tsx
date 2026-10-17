import { ActivityIndicator, Alert, Linking, ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Button } from '../../../../src/components/Button';
import { trpc } from '../../../../src/lib/trpc';
import { useAddToQueue } from '../../../../src/lib/use-add-to-queue';
import { buildLibraryItemDetail } from '../../../../src/models/library-item';

/**
 * TikTok's consent before a video joins the queue, as a medium form sheet over
 * the item's detail at `/library/add-to-queue/<mediaId>`. TikTok requires the
 * creator to agree to its declaration (the policy names link to TikTok's legal
 * pages) and to be told posts take a while to process. Only TikTok-bound
 * videos come here; the Library item model decides, from the same cached
 * `media.get` the detail drew from.
 */

export default function AddToQueueConsentSheet() {
  const { mediaId } = useLocalSearchParams<{ mediaId: string }>();
  const router = useRouter();
  const connections = trpc.connections.overview.useQuery();
  const video = trpc.media.get.useQuery({ videoId: mediaId });
  const { add, isPending } = useAddToQueue({ onDone: () => router.back() });

  if (video.isLoading || connections.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const detail = video.data
    ? buildLibraryItemDetail(video.data, connections.data ?? [], new Date())
    : null;
  const action = detail?.queue;
  if (!detail || action?.kind !== 'add' || action.confirm.kind !== 'tiktokConsent') {
    return (
      <View className="flex-1 bg-ground px-5 pt-8">
        <Text className="text-[15px] leading-5 text-ink-tertiary">
          {detail
            ? 'This video can’t be added from here anymore. Close this to see where it stands.'
            : 'Couldn’t reach PostPilot. Close this and pull down to try again.'}
        </Text>
      </View>
    );
  }
  const consent = action.confirm;

  return (
    <ScrollView
      className="flex-1 bg-ground"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 }}
    >
      <View className="gap-0.5">
        <Text accessibilityRole="header" className="text-[20px] font-semibold leading-7 text-ink">
          Post to TikTok
        </Text>
        <Text numberOfLines={2} className="text-[13px] leading-[18px] text-ink-tertiary">
          {detail.title} · {consent.postsTo}
        </Text>
      </View>

      <Text className="mt-5 text-[15px] leading-[22px] text-ink">
        {consent.segments.map((seg, i) =>
          seg.href ? (
            <Text
              key={i}
              accessibilityRole="link"
              onPress={() =>
                Linking.openURL(seg.href!).catch(() =>
                  Alert.alert(`Couldn’t open ${seg.text}`, seg.href),
                )
              }
              className="text-primary underline"
            >
              {seg.text}
            </Text>
          ) : (
            seg.text
          ),
        )}
      </Text>
      <Text className="mt-3 text-[13px] leading-[18px] text-ink-tertiary">{consent.notice}</Text>

      <View className="mt-7 gap-2">
        <Button
          loading={isPending}
          onPress={() => add({ id: detail.id, mediaType: 'VIDEO' })}
          accessibilityRole="button"
          accessibilityState={{ busy: isPending }}
        >
          {action.label}
        </Button>
        <Button variant="ghost" disabled={isPending} onPress={() => router.back()}>
          Cancel
        </Button>
      </View>
    </ScrollView>
  );
}
