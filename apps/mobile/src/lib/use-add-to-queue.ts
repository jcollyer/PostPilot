import { Alert } from 'react-native';

import { addToQueueOutcome } from '../models/library-item';
import { trpc } from './trpc';

/**
 * Adds one Library item to the end of the queue: `queue.addVideos` for a
 * video, `queue.addImages` for a photo or carousel. Whatever the server said,
 * the Library lists, the item's detail, the queue and Home are refreshed, so
 * the row flips to "In queue" or shows where it really stands. A refusal (such
 * as TikTok details missing, set on the web meanwhile) or an error is an alert.
 *
 * `onDone` runs once the add is over: as soon as it's added, or when the
 * refusal or error alert is dismissed, so a sheet never closes under its alert.
 */
export function useAddToQueue({ onDone }: { onDone?: () => void } = {}) {
  const utils = trpc.useUtils();

  const refresh = () =>
    Promise.all([
      utils.folder.list.invalidate(),
      utils.media.list.invalidate(),
      utils.media.get.invalidate(),
      utils.media.getImage.invalidate(),
      utils.queue.get.invalidate(),
      utils.dashboard.overview.invalidate(),
    ]);
  const tell = (title: string, message: string) =>
    Alert.alert(title, message, [{ text: 'OK', onPress: onDone }], { onDismiss: onDone });
  const handlers = {
    onSuccess: (res: { added: number; skipped: number; blocked?: number }) => {
      const outcome = addToQueueOutcome(res);
      if (outcome.kind === 'refused') tell(outcome.title, outcome.message);
      else onDone?.();
    },
    onError: (err: { message: string }) => tell('Couldn’t add to queue', err.message),
    onSettled: refresh,
  };
  const videos = trpc.queue.addVideos.useMutation(handlers);
  const images = trpc.queue.addImages.useMutation(handlers);

  return {
    add: (item: { id: string; mediaType: 'VIDEO' | 'IMAGE' | 'CAROUSEL' }) =>
      item.mediaType === 'VIDEO'
        ? videos.mutate({ videoIds: [item.id] })
        : images.mutate({ imageIds: [item.id] }),
    isPending: videos.isPending || images.isPending,
  };
}
