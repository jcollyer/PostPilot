/** One-off: stop the runaway reclaim loop on the Aug 7 13:30 YouTube task. */
import { prisma } from '@postpilot/db';

const SLOT = new Date('2026-08-07T13:30:00.000Z');

async function main() {
  const before = await prisma.publishTask.findMany({
    where: { platform: 'YOUTUBE', status: 'UPLOADING', scheduledAt: SLOT },
    select: { id: true, status: true, attemptCount: true, nextAttemptAt: true,
      scheduledAt: true, updatedAt: true, queueItemId: true,
      queueItem: { select: { status: true, video: { select: { title: true } } } } },
  });
  console.log('=== MATCHED (before) ===');
  for (const t of before) {
    console.log(`${t.id} ${t.status} att=${t.attemptCount} sched=${t.scheduledAt.toISOString()} lease=${t.nextAttemptAt?.toISOString()} item=${t.queueItemId.slice(-6)}(${t.queueItem.status}) "${t.queueItem.video?.title}"`);
  }
  if (before.length !== 1) {
    console.log(`ABORT: expected exactly 1 match, got ${before.length}. No write performed.`);
    return;
  }

  const res = await prisma.publishTask.updateMany({
    where: { id: before[0]!.id, status: 'UPLOADING' },
    data: {
      status: 'FAILED',
      nextAttemptAt: null,
      lastError:
        'Stopped manually: the upload was killed mid-transfer on every attempt (worker ran out of memory buffering the file), leaving orphaned uploads on YouTube. Fixed by streaming the upload — retry once deployed.',
    },
  });
  console.log(`\nrows updated: ${res.count}`);

  const after = await prisma.publishTask.findUnique({
    where: { id: before[0]!.id },
    select: { id: true, status: true, attemptCount: true, nextAttemptAt: true, lastError: true,
      queueItem: { select: { status: true } } },
  });
  console.log('\n=== AFTER ===');
  console.log(`${after?.id} ${after?.status} att=${after?.attemptCount} next=${after?.nextAttemptAt} item=${after?.queueItem.status}`);
  console.log(`lastError: ${after?.lastError}`);

  const stillLooping = await prisma.publishTask.count({ where: { status: 'UPLOADING' } });
  console.log(`\nremaining UPLOADING tasks anywhere: ${stillLooping}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
