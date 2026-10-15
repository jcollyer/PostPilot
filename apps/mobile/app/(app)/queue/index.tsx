import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';

import { Disclosure } from '../../../src/components/Disclosure';
import { PlatformGlyphs } from '../../../src/components/PlatformGlyphs';
import { StatusLine } from '../../../src/components/StatusLine';
import { trpc } from '../../../src/lib/trpc';
import {
  buildQueueModel,
  queueSections,
  type QueueRow,
  type QueueSection,
} from '../../../src/models/queue';

/**
 * Queue = the queue in sections. A status line and the schedule up top, then
 * Needs attention (only when something does), Up next, Published and a
 * collapsed Skipped. Pause/Resume sits in the nav bar and acts at once: it is
 * reversible, so it never asks. Rows carry no buttons: tapping one opens its
 * item sheet (`[itemId]`), where the actions live. All derivation lives in the
 * Queue model; this screen only maps it to views.
 *
 * A queue runs to hundreds of items, so the list is virtualized: each section
 * is drawn as an inset-grouped list out of per-row cells rather than one
 * container around all of its rows.
 */

export default function QueueScreen() {
  const router = useRouter();
  const utils = trpc.useUtils();
  const queue = trpc.queue.get.useQuery();
  const schedules = trpc.queue.listSchedules.useQuery();
  const [refreshing, setRefreshing] = useState(false);
  const [showAllPublished, setShowAllPublished] = useState(false);
  const [skippedOpen, setSkippedOpen] = useState(false);

  const onToggled = async () => {
    await Promise.all([utils.queue.get.invalidate(), utils.dashboard.overview.invalidate()]);
  };
  const failed = (verb: string) => (err: { message: string }) =>
    Alert.alert(`Couldn’t ${verb} the queue`, err.message);
  const pause = trpc.queue.pause.useMutation({ onSuccess: onToggled, onError: failed('pause') });
  const resume = trpc.queue.resume.useMutation({ onSuccess: onToggled, onError: failed('resume') });

  async function onRefresh() {
    setRefreshing(true);
    try {
      await Promise.all([queue.refetch(), schedules.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (queue.isLoading || schedules.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />;
  const model =
    queue.data && schedules.data ? buildQueueModel(queue.data, schedules.data, new Date()) : null;

  if (!model) {
    return (
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
    );
  }

  const toggling = pause.isPending || resume.isPending;
  const { paused } = model.status;

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => (paused ? resume.mutate() : pause.mutate())}
              disabled={toggling}
              accessibilityRole="button"
              accessibilityLabel={paused ? 'Resume queue' : 'Pause queue'}
              accessibilityState={{ disabled: toggling, busy: toggling }}
              hitSlop={8}
              className="min-h-[44px] justify-center px-2 active:opacity-60"
            >
              {toggling ? (
                <ActivityIndicator color="#2d3f63" />
              ) : (
                <Text className="text-[17px] text-primary">{paused ? 'Resume' : 'Pause'}</Text>
              )}
            </Pressable>
          ),
        }}
      />
      <SectionList<QueueRow, QueueSection>
        contentInsetAdjustmentBehavior="automatic"
        className="flex-1 bg-ground"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 }}
        refreshControl={refreshControl}
        stickySectionHeadersEnabled={false}
        sections={queueSections(model, { showAllPublished, skippedOpen })}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={
          <View className="gap-1.5">
            <StatusLine {...model.status} />
            {/* Indented to sit under the label, clear of the status dot. */}
            <Text className="pl-[18px] text-[15px] leading-5 text-ink-tertiary">
              {model.schedule}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) =>
          section.key === 'skipped' ? (
            <View className="mt-7">
              <Cell first last={!skippedOpen}>
                <Pressable
                  onPress={() => setSkippedOpen((v) => !v)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: skippedOpen }}
                  accessibilityHint={skippedOpen ? 'Hides skipped posts' : 'Shows skipped posts'}
                  className="min-h-[44px] flex-row items-center justify-between px-4 active:opacity-60"
                >
                  <Text className="text-[15px] text-ink-secondary">{model.skipped.label}</Text>
                  <Disclosure open={skippedOpen} />
                </Pressable>
              </Cell>
            </View>
          ) : (
            <Text
              accessibilityRole="header"
              className="mb-2 mt-7 px-1 text-[13px] font-semibold text-ink-tertiary"
            >
              {section.title}
            </Text>
          )
        }
        renderItem={({ item, index, section }) => (
          <Cell
            first={index === 0 && section.key !== 'skipped'}
            last={index === section.data.length - 1 && !section.footer}
          >
            {/* Rules live inside the cells: a separate 1pt separator cell leaves seams. */}
            {index > 0 ? <Rule inset /> : section.key === 'skipped' ? <Rule /> : null}
            <Row row={item} onPress={() => router.push(`/queue/${item.id}`)} />
          </Cell>
        )}
        renderSectionFooter={({ section }) =>
          section.footer === 'empty' ? (
            <Cell first last>
              <Text className="px-4 py-3.5 text-[15px] leading-5 text-ink-tertiary">
                Nothing up next. Add ready videos from Library.
              </Text>
            </Cell>
          ) : section.footer ? (
            <Cell last>
              <Rule />
              <Pressable
                onPress={() => setShowAllPublished((v) => !v)}
                accessibilityRole="button"
                className="min-h-[44px] justify-center px-4 active:opacity-60"
              >
                <Text className="text-[15px] text-primary">
                  {section.footer === 'show-fewer' ? 'Show fewer' : 'Show more'}
                </Text>
              </Pressable>
            </Cell>
          ) : null
        }
      />
    </>
  );
}

/**
 * One slice of an inset-grouped list: a hairline-bounded surface whose top
 * and bottom round off only at the ends of its group.
 */
function Cell({
  first = false,
  last = false,
  children,
}: {
  first?: boolean;
  last?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View
      className="border-hairline bg-surface"
      // Every edge spelled out: a cell must draw no top or bottom rule unless it
      // ends its group, or adjacent cells stack into visible seams.
      style={{
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderTopWidth: first ? 1 : 0,
        borderBottomWidth: last ? 1 : 0,
        borderTopLeftRadius: first ? 12 : 0,
        borderTopRightRadius: first ? 12 : 0,
        borderBottomLeftRadius: last ? 12 : 0,
        borderBottomRightRadius: last ? 12 : 0,
      }}
    >
      {children}
    </View>
  );
}

/** A row-to-row rule; inset ones start at the text, like a native list. */
function Rule({ inset = false }: { inset?: boolean }) {
  return <View className={`h-px bg-hairline ${inset ? 'ml-[64px]' : ''}`} />;
}

function Row({ row, onPress }: { row: QueueRow; onPress: () => void }) {
  const critical = row.tone === 'critical';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${row.meta}`}
      accessibilityHint="Shows its status and actions"
      className="min-h-[68px] flex-row items-center gap-3 px-4 py-2.5 active:opacity-60"
    >
      {/* Portrait, because the queue is short-form vertical video. */}
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
            className={`shrink text-[13px] leading-[18px] ${
              critical ? 'text-signal-critical' : 'text-ink-tertiary'
            }`}
          >
            {row.meta}
          </Text>
          <PlatformGlyphs platforms={row.platforms} />
        </View>
      </View>
      <Disclosure />
    </Pressable>
  );
}
