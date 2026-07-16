import { type PrismaClient } from '@postpilot/db';

import { readEmbeddings } from './embeddings';
import { orderBySpacing, type OrderableItem } from './ordering';
import { normalizedPositions } from './positions';

/**
 * Smart-arrange the not-yet-published items in a queue so similar content is
 * spaced apart (reuses the AI embeddings; falls back to category). Rewrites
 * float positions to clean steps. Caller should `recomputeSchedule` afterwards
 * so the new order maps onto the schedule's time slots.
 */
export async function smartArrangeQueue(
  prisma: PrismaClient,
  queueId: string,
): Promise<{ reordered: number }> {
  const items = await prisma.queueItem.findMany({
    where: { queueId, status: { in: ['PENDING', 'SCHEDULED'] } },
    orderBy: { position: 'asc' },
    select: {
      id: true,
      videoId: true,
      imageId: true,
      video: { select: { categoryId: true } },
      image: { select: { categoryId: true } },
    },
  });
  if (items.length <= 2) return { reordered: items.length };

  // A queue item is a video or an image/carousel; unify to one media id +
  // category for spacing (embeddings are read from both tables).
  const mediaIdOf = (i: (typeof items)[number]): string => (i.videoId ?? i.imageId)!;
  const categoryOf = (i: (typeof items)[number]): string | null =>
    i.video?.categoryId ?? i.image?.categoryId ?? null;

  const emb = await readEmbeddings(
    prisma,
    items.map(mediaIdOf),
  );

  const orderable: OrderableItem[] = items.map((i) => ({
    id: i.id,
    videoId: mediaIdOf(i),
    categoryId: categoryOf(i),
  }));
  const orderedIds = orderBySpacing(orderable, emb);
  const positions = normalizedPositions(orderedIds);

  await prisma.$transaction(
    orderedIds.map((id) =>
      prisma.queueItem.update({ where: { id }, data: { position: positions.get(id)! } }),
    ),
  );

  return { reordered: orderedIds.length };
}
