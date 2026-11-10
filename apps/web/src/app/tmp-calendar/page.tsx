'use client';

// TEMPORARY: browser check for #113 with mock data. Delete before shipping.
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from '@postpilot/api';

import { trpc } from '@/lib/trpc/client';
import { QueueCalendar } from '@/features/queue/QueueCalendar';

type P = 'TIKTOK' | 'INSTAGRAM' | 'YOUTUBE';
const at = (d: number, h = 10, m = 0) => new Date(2026, 10, d, h, m);
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Each item's posts: platform -> time and state.
type Post = { platform: P; at: Date; state: string; postUrl?: string };
const items: Record<string, { title: string; posts: Post[]; movable: boolean }> = {
  a: { title: 'Empire State at night', movable: true, posts: [
    { platform: 'TIKTOK', at: at(12), state: 'scheduled' },
    { platform: 'YOUTUBE', at: at(12), state: 'scheduled' },
  ] },
  b: { title: 'Brooklyn Bridge sunrise', movable: true, posts: [
    { platform: 'TIKTOK', at: at(14), state: 'scheduled' },
    { platform: 'YOUTUBE', at: at(14), state: 'scheduled' },
  ] },
  c: { title: 'Central Park walk', movable: false, posts: [
    { platform: 'TIKTOK', at: at(8), state: 'published', postUrl: 'https://example.com/t' },
  ] },
  e: { title: 'Held reel', movable: true, posts: [
    { platform: 'INSTAGRAM', at: at(13, 12), state: 'held' },
  ] },
  f: { title: 'Publishing now', movable: false, posts: [
    { platform: 'TIKTOK', at: at(10, 9), state: 'inFlight' },
  ] },
  g: { title: 'Projected harbour clip', movable: true, posts: [
    { platform: 'TIKTOK', at: at(28), state: 'projected' },
    { platform: 'YOUTUBE', at: at(28), state: 'projected' },
  ] },
};
// TikTok+YouTube slots, and an Instagram one.
const slotTimes = [at(12), at(14), at(17), at(21), at(28)];

function holdersAt(t: Date, platforms: P[]) {
  const holders: Partial<Record<P, string | null>> = {};
  for (const p of platforms) {
    const owner = Object.entries(items).find(([, i]) =>
      i.posts.some((x) => x.platform === p && x.at.getTime() === t.getTime() && x.state !== 'published'),
    );
    holders[p] = owner?.[0] ?? null;
  }
  return holders;
}

function calendar() {
  const chips = Object.entries(items).flatMap(([id, i]) => {
    const byDay = new Map<string, Post[]>();
    for (const p of i.posts) byDay.set(key(p.at), [...(byDay.get(key(p.at)) ?? []), p]);
    return [...byDay].map(([day, posts]) => ({
      key: `${id}:${day}`,
      day,
      itemId: id,
      mediaId: `m-${id}`,
      mediaType: 'VIDEO' as const,
      title: i.title,
      thumbnailUrl: null,
      state: posts[0]!.state,
      movable: i.movable,
      at: posts[0]!.at,
      posts: posts.map((p) => ({ taskId: null, platform: p.platform, state: p.state, at: p.at, postUrl: p.postUrl ?? null })),
    }));
  });
  const slots = [
    ...slotTimes.map((t) => ({ at: t, day: key(t), holders: holdersAt(t, ['TIKTOK', 'YOUTUBE']), projected: t.getDate() > 20 })),
    { at: at(13, 12), day: key(at(13, 12)), holders: holdersAt(at(13, 12), ['INSTAGRAM']), projected: false },
    { at: at(20, 12), day: key(at(20, 12)), holders: holdersAt(at(20, 12), ['INSTAGRAM']), projected: false },
  ].sort((x, y) => x.at.getTime() - y.at.getTime());
  return { status: 'ACTIVE', chips, slots };
}

const log: unknown[] = [];
(globalThis as Record<string, unknown>).__calls = log;

function moveToSlot(input: { itemId: string; slotAt: Date; platforms: P[] }) {
  const item = items[input.itemId]!;
  const prev = item.posts.map((p) => ({ ...p }));
  for (const p of item.posts) if (input.platforms.includes(p.platform)) {
    p.at = new Date(input.slotAt);
    p.state = input.slotAt.getDate() > 20 ? 'projected' : 'scheduled';
  }
  undoStack.push({ id: input.itemId, prev });
  return { previousAfterItemId: 'x', landedAt: input.slotAt, projected: input.slotAt.getDate() > 20, movedToEnd: false, shifted: 1, shiftedItemIds: ['b'] };
}
const undoStack: { id: string; prev: Post[] }[] = [];

const mockLink: TRPCLink<AppRouter> = () => ({ op }) =>
  observable((obs) => {
    log.push({ path: op.path, input: op.input });
    let data: unknown;
    if (op.path === 'queue.calendar') data = calendar();
    else if (op.path === 'queue.listSchedules') data = [{ isActive: true }];
    else if (op.path === 'queue.moveToSlot') data = moveToSlot(op.input as never);
    else if (op.path === 'queue.move') {
      const u = undoStack.pop();
      if (u) items[u.id]!.posts = u.prev;
      data = { ok: true };
    } else {
      obs.error(new Error(`mock: ${op.path}`) as never);
      return;
    }
    setTimeout(() => {
      obs.next({ result: { data } } as never);
      obs.complete();
    }, 150);
  });

export default function Page() {
  const [qc] = useState(() => new QueryClient());
  const [client] = useState(() => trpc.createClient({ links: [mockLink] }));
  const [open, setOpen] = useState(true);
  return (
    <trpc.Provider client={client} queryClient={qc}>
      <QueryClientProvider client={qc}>
        <button onClick={() => setOpen(true)}>open</button>
        <QueueCalendar
          open={open}
          onOpenChange={setOpen}
          publishing={false}
          onEdit={(t) => log.push({ edit: t.mediaId })}
          onAddSchedule={() => {}}
          onChanged={() => qc.invalidateQueries()}
        />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
