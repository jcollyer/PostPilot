import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { cssInterop } from 'nativewind';

import { trpc } from '../../../src/lib/trpc';
import {
  buildHomeModel,
  type HomeNextPost,
  type HomeProblemCard,
  type HomeTarget,
  type HomeTone,
  type HomeVerdict,
} from '../../../src/models/home';

/**
 * Home = the glanceable monitor. One verdict line answers "is it still
 * posting?", problem cards appear only when something is wrong, then the next
 * post. Read-only: every card taps through to the tab that owns the problem.
 * All derivation lives in the Home model; this screen only maps it to views.
 */

const TARGET_HREF: Record<HomeTarget, '/queue' | '/settings'> = {
  queue: '/queue',
  settings: '/settings',
};

const TARGET_HINT: Record<HomeTarget, string> = {
  queue: 'Opens the Queue tab',
  settings: 'Opens the Settings tab',
};

const TONE_DOT: Record<HomeTone, string> = {
  critical: 'bg-signal-critical',
  warn: 'bg-signal-warn',
  ok: 'bg-signal-ok',
};

// A healthy verdict stays ink; only problems take their status color.
const TONE_LABEL: Record<HomeTone, string> = {
  critical: 'text-signal-critical',
  warn: 'text-signal-warn',
  ok: 'text-ink',
};

// Lets the chevron take its color from a token class instead of a hex prop.
// lucide stands in until an SF Symbol package is part of the native build.
cssInterop(ChevronRight, { className: { target: 'style', nativeStyleToProp: { color: true } } });

export default function HomeScreen() {
  const router = useRouter();
  const overview = trpc.dashboard.overview.useQuery();
  const [refreshing, setRefreshing] = useState(false);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await overview.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  if (overview.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const model = overview.data ? buildHomeModel(overview.data, new Date()) : null;
  const open = (target: HomeTarget) => router.navigate(TARGET_HREF[target]);

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-ground"
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {model ? (
        <>
          <VerdictLine verdict={model.verdict} />

          {model.problems.map((problem) => (
            <ProblemCard key={problem.key} problem={problem} onPress={() => open(problem.target)} />
          ))}

          <NextPostSection
            nextPost={model.nextPost}
            onPress={() => model.nextPost && open(model.nextPost.target)}
          />
        </>
      ) : (
        <Text className="text-sm text-ink-tertiary">
          Couldn’t reach PostPilot. Pull down to try again.
        </Text>
      )}
    </ScrollView>
  );
}

function VerdictLine({ verdict }: { verdict: HomeVerdict }) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={verdict.copy}
      className="flex-row items-start gap-2.5 pb-1"
    >
      {/* Optically centred on the first line of the 22pt label. */}
      <View className={`mt-[9px] h-2 w-2 rounded-full ${TONE_DOT[verdict.tone]}`} />
      <Text className="flex-1 text-[22px] leading-7 text-ink-secondary">
        <Text className={`font-semibold ${TONE_LABEL[verdict.tone]}`}>{verdict.label}</Text>
        {` · ${verdict.detail}`}
      </Text>
    </View>
  );
}

function ProblemCard({ problem, onPress }: { problem: HomeProblemCard; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${problem.title}. ${problem.detail}`}
      accessibilityHint={TARGET_HINT[problem.target]}
      className="min-h-[44px] flex-row items-center gap-3 rounded-xl border border-hairline bg-surface p-4 active:opacity-70"
    >
      {/* Sits on the title's first line, not the middle of the block. */}
      <View className={`mt-1.5 h-2 w-2 self-start rounded-full ${TONE_DOT[problem.tone]}`} />
      <View className="flex-1 gap-0.5">
        <Text className="text-[15px] font-semibold leading-5 text-ink">{problem.title}</Text>
        <Text className="text-[13px] leading-[18px] text-ink-tertiary">{problem.detail}</Text>
      </View>
      <ChevronRight size={18} strokeWidth={2.25} className="text-ink-quiet" />
    </Pressable>
  );
}

function NextPostSection({
  nextPost,
  onPress,
}: {
  nextPost: HomeNextPost | null;
  onPress: () => void;
}) {
  return (
    <View className="mt-2 gap-2">
      <Text accessibilityRole="header" className="px-1 text-[13px] font-semibold text-ink-tertiary">
        Next post
      </Text>
      {nextPost ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Next post: ${nextPost.title}, ${nextPost.platform}, ${nextPost.when}`}
          accessibilityHint={TARGET_HINT[nextPost.target]}
          className="flex-row items-center gap-3 rounded-xl border border-hairline bg-surface p-3 active:opacity-70"
        >
          <View className="h-16 w-16 overflow-hidden rounded-lg bg-ground">
            {nextPost.thumbnailUrl ? (
              <Image
                source={{ uri: nextPost.thumbnailUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={150}
                accessibilityIgnoresInvertColors
              />
            ) : null}
          </View>
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={2} className="text-[15px] font-semibold leading-5 text-ink">
              {nextPost.title}
            </Text>
            <Text className="text-[13px] leading-[18px] text-ink-tertiary">
              {nextPost.platform} · {nextPost.when}
            </Text>
          </View>
          <ChevronRight size={18} strokeWidth={2.25} className="text-ink-quiet" />
        </Pressable>
      ) : (
        <View className="rounded-xl border border-hairline bg-surface p-4">
          <Text className="text-[13px] text-ink-tertiary">Nothing scheduled yet.</Text>
        </View>
      )}
    </View>
  );
}
