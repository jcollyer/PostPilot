import { useState } from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { PlatformGlyphs } from '../../../src/components/PlatformGlyphs';
import { trpc } from '../../../src/lib/trpc';
import {
  buildQueueItemSheet,
  type QueueItemAction,
  type QueueItemConfirm,
  type QueueItemPlatformRow,
} from '../../../src/models/queue-item';

/**
 * Queue item sheet: one item's per-platform status, full errors and View post
 * links, then the actions its state offers. Opened over the Queue stack at
 * `/queue/<itemId>`. Publish now asks first in an action sheet; Retry, Skip and
 * Restore run at once because they can be undone. The sheet stays up after an
 * action and redraws from the refreshed queue, so Skip turns into Restore in
 * place while the list behind moves the item to its new section.
 */

const PUBLISH_NOW_REFUSED: Record<'nothing_to_publish' | 'no_connection', [string, string]> = {
  nothing_to_publish: ['Nothing left to publish', 'It has already posted everywhere it was headed.'],
  no_connection: ['No platform connected', 'Reconnect a platform in Settings, then try again.'],
};

export default function QueueItemSheetScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const utils = trpc.useUtils();
  const queue = trpc.queue.get.useQuery();
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([utils.queue.get.invalidate(), utils.dashboard.overview.invalidate()]);
  const failed = (verb: string) => (err: { message: string }) =>
    Alert.alert(`Couldn’t ${verb}`, err.message);
  const settle = { onSettled: () => refresh().finally(() => setPendingKey(null)) };
  const retry = trpc.queue.retryPublish.useMutation({
    ...settle,
    onError: failed('retry'),
    // Already retried elsewhere (or no longer failed); the refresh shows where it stands.
    onSuccess: (res) => {
      if (!res.success) Alert.alert('Nothing to retry', 'This post is no longer failed or on hold.');
    },
  });
  const skip = trpc.queue.skip.useMutation({ ...settle, onError: failed('skip this post') });
  const restore = trpc.queue.unskip.useMutation({ ...settle, onError: failed('restore this post') });
  const publishNow = trpc.queue.publishNow.useMutation({
    ...settle,
    onError: failed('publish this post'),
    onSuccess: (res) => {
      if (!res.success) Alert.alert(...PUBLISH_NOW_REFUSED[res.reason]);
    },
  });

  if (queue.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-ground">
        <ActivityIndicator size="large" color="#2d3f63" />
      </View>
    );
  }

  const sheet = queue.data && itemId ? buildQueueItemSheet(queue.data, itemId) : null;
  if (!sheet) {
    return (
      <View className="flex-1 bg-ground px-5 pt-8">
        <Text className="text-[15px] leading-5 text-ink-tertiary">
          {queue.data
            ? 'This post is no longer in your queue.'
            : 'Couldn’t reach PostPilot. Close this and pull down to try again.'}
        </Text>
      </View>
    );
  }

  const id = sheet.id;
  function run(action: QueueItemAction) {
    switch (action.kind) {
      case 'reconnect':
        router.back();
        router.navigate('/settings');
        return;
      case 'publishNow':
        return confirmFirst(action.confirm, () =>
          start(action, () => publishNow.mutate({ itemId: id })),
        );
      case 'retry':
        return start(action, () => retry.mutate({ taskId: action.taskId }));
      case 'skip':
        return start(action, () => skip.mutate({ itemId: id }));
      case 'restore':
        return start(action, () => restore.mutate({ itemId: id }));
    }
  }

  function start(action: QueueItemAction, mutate: () => void) {
    setPendingKey(action.key);
    mutate();
  }

  return (
    <ScrollView
      className="flex-1 bg-ground"
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 28, paddingBottom: 40 }}
    >
      <View className="flex-row items-center gap-3">
        <View className="h-16 w-12 overflow-hidden rounded-lg bg-surface">
          {sheet.thumbnailUrl ? (
            <Image
              source={{ uri: sheet.thumbnailUrl }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              transition={150}
              accessibilityIgnoresInvertColors
            />
          ) : null}
        </View>
        <View className="flex-1 gap-0.5">
          <Text
            accessibilityRole="header"
            numberOfLines={3}
            className="text-[20px] font-semibold leading-7 text-ink"
          >
            {sheet.title}
          </Text>
          <Text className="text-[13px] leading-[18px] text-ink-tertiary">{sheet.stateLabel}</Text>
        </View>
      </View>

      {sheet.platforms.length > 0 ? (
        <Group>
          {sheet.platforms.map((p, i) => (
            <PlatformRow key={p.key} row={p} first={i === 0} />
          ))}
        </Group>
      ) : null}

      {sheet.actions.length > 0 ? (
        <Group>
          {sheet.actions.map((action, i) => (
            <ActionRow
              key={action.key}
              action={action}
              first={i === 0}
              pending={pendingKey === action.key}
              disabled={pendingKey !== null}
              onPress={() => run(action)}
            />
          ))}
        </Group>
      ) : null}
    </ScrollView>
  );
}

/** Publish now can't be taken back, so it asks in an action sheet naming the item. */
function confirmFirst(
  { title, message, confirmLabel }: QueueItemConfirm,
  onConfirm: () => void,
) {
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title, message, options: [confirmLabel, 'Cancel'], cancelButtonIndex: 1 },
      (index) => index === 0 && onConfirm(),
    );
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: confirmLabel, onPress: onConfirm },
    ]);
  }
}

/** An inset-grouped list: one hairline-bounded surface, rows split by inset rules. */
function Group({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-7 overflow-hidden rounded-xl border border-hairline bg-surface">
      {children}
    </View>
  );
}

/** A row-to-row rule; inset ones start at the text, like a native list. */
function Rule({ inset = 'ml-4' }: { inset?: string }) {
  return <View className={`h-px bg-hairline ${inset}`} />;
}

function PlatformRow({ row, first }: { row: QueueItemPlatformRow; first: boolean }) {
  const critical = row.tone === 'critical';
  return (
    <>
      {/* Starts at the platform name, past the 13pt glyph and its 8pt gap. */}
      {first ? null : <Rule inset="ml-[37px]" />}
      <View className="gap-1 px-4 py-3">
        <View accessible accessibilityLabel={`${row.name}. ${row.status}`} className="gap-0.5">
          <View className="flex-row items-center gap-2">
            <PlatformGlyphs platforms={[row.platform]} />
            <Text className="text-[15px] font-semibold leading-5 text-ink">{row.name}</Text>
          </View>
          <Text
            className={`text-[13px] leading-[18px] ${
              critical ? 'text-signal-critical' : 'text-ink-tertiary'
            }`}
          >
            {row.status}
          </Text>
        </View>
        {row.error ? (
          <Text selectable className="text-[13px] leading-[18px] text-ink-secondary">
            {row.error}
          </Text>
        ) : null}
        {row.postUrl ? (
          <Pressable
            onPress={() =>
              Linking.openURL(row.postUrl!).catch(() =>
                Alert.alert('Couldn’t open the post', row.postUrl!),
              )
            }
            accessibilityRole="link"
            accessibilityLabel={`View post on ${row.name}`}
            hitSlop={8}
            className="min-h-[32px] justify-center self-start active:opacity-60"
          >
            <Text className="text-[15px] text-primary">View post</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

function ActionRow({
  action,
  first,
  pending,
  disabled,
  onPress,
}: {
  action: QueueItemAction;
  first: boolean;
  pending: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <>
      {first ? null : <Rule />}
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled, busy: pending }}
        accessibilityHint={action.kind === 'reconnect' ? 'Opens the Settings tab' : undefined}
        className="min-h-[44px] flex-row items-center justify-between px-4 active:opacity-60"
      >
        <Text className={`text-[17px] text-primary ${disabled && !pending ? 'opacity-50' : ''}`}>
          {action.label}
        </Text>
        {pending ? <ActivityIndicator color="#2d3f63" /> : null}
      </Pressable>
    </>
  );
}
