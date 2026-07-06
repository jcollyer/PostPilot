'use client';

import { useState } from 'react';
import { Check, ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@postpilot/api';

import { PLATFORM_LABELS, platformSchema, type Platform } from '@postpilot/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/lib/trpc/client';
import { DAY_LABELS } from './format';

type RouterOutputs = inferRouterOutputs<AppRouter>;
type ScheduleRecord = RouterOutputs['queue']['listSchedules'][number];

const BROWSER_TZ =
  typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

interface ScheduleDraft {
  name: string;
  timezone: string;
  daysOfWeek: number[];
  times: string[];
  platforms: Platform[];
  isActive: boolean;
}

function summarize(s: { daysOfWeek: number[]; times: string[]; platforms: Platform[] }): string {
  const days =
    s.daysOfWeek.length === 7
      ? 'Every day'
      : s.daysOfWeek
          .slice()
          .sort((a, b) => a - b)
          .map((d) => DAY_LABELS[d])
          .join(', ');
  const times = s.times.join(', ');
  const platforms =
    s.platforms.length === 0
      ? 'all connected'
      : s.platforms.map((p) => PLATFORM_LABELS[p]).join(', ');
  return `${days} at ${times} → ${platforms}`;
}

export function ScheduleEditor({ onChanged }: { onChanged: () => void }) {
  const schedules = trpc.queue.listSchedules.useQuery();
  const [adding, setAdding] = useState(false);
  // Which schedule row is expanded into its edit form (null = none).
  const [editingId, setEditingId] = useState<string | null>(null);

  const remove = trpc.queue.deleteSchedule.useMutation({
    onSuccess: () => {
      schedules.refetch();
      onChanged();
    },
  });
  const update = trpc.queue.updateSchedule.useMutation({
    onSuccess: () => {
      schedules.refetch();
      onChanged();
    },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Schedules</h2>
        {!adding ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingId(null);
              setAdding(true);
            }}
          >
            <Plus className="mr-1 h-4 w-4" /> Add schedule
          </Button>
        ) : null}
      </div>

      {schedules.data && schedules.data.length > 0 ? (
        <ul className="space-y-2">
          {schedules.data.map((s) => {
            const isEditing = editingId === s.id;
            return (
              <li key={s.id} className="rounded-md border text-sm">
                <div className="flex items-center justify-between gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : s.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={isEditing}
                  >
                    <ChevronDown
                      className={`text-muted-foreground h-4 w-4 shrink-0 transition-transform ${
                        isEditing ? 'rotate-180' : ''
                      }`}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name || 'Schedule'}</span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {summarize(s)} · {s.timezone}
                      </span>
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={s.isActive}
                        onChange={(e) =>
                          update.mutate({ scheduleId: s.id, isActive: e.target.checked })
                        }
                      />
                      Active
                    </label>
                    <button
                      type="button"
                      onClick={() => remove.mutate({ scheduleId: s.id })}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete schedule"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {isEditing ? (
                  <div className="border-t p-3">
                    <ScheduleForm
                      schedule={s}
                      onCancel={() => setEditingId(null)}
                      onSaved={() => {
                        setEditingId(null);
                        schedules.refetch();
                        onChanged();
                      }}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : !adding ? (
        <p className="text-muted-foreground text-sm">
          No schedules yet. Add one so PostPilot knows when to publish.
        </p>
      ) : null}

      {adding ? (
        <ScheduleForm
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            schedules.refetch();
            onChanged();
          }}
        />
      ) : null}
    </div>
  );
}

function ScheduleForm({
  schedule,
  onCancel,
  onSaved,
}: {
  schedule?: ScheduleRecord;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!schedule;
  const [draft, setDraft] = useState<ScheduleDraft>(() => ({
    name: schedule?.name ?? '',
    timezone: schedule?.timezone ?? BROWSER_TZ,
    daysOfWeek: schedule?.daysOfWeek ?? [1, 2, 3, 4, 5],
    times: schedule?.times ?? ['09:00'],
    platforms: schedule?.platforms ?? [...platformSchema.options],
    isActive: schedule?.isActive ?? true,
  }));

  // The connected TikTok account, used to badge the TikTok pill with its avatar.
  const tiktokInfo = trpc.connections.tiktokCreatorInfo.useQuery();
  const tiktokAvatarUrl = tiktokInfo.data?.available
    ? tiktokInfo.data.info.creatorAvatarUrl
    : null;

  const create = trpc.queue.createSchedule.useMutation({ onSuccess: onSaved });
  const update = trpc.queue.updateSchedule.useMutation({ onSuccess: onSaved });
  const saving = create.isPending || update.isPending;

  const save = () => {
    const base = {
      timezone: draft.timezone.trim() || 'UTC',
      daysOfWeek: draft.daysOfWeek,
      times: draft.times,
      platforms: draft.platforms,
      isActive: draft.isActive,
    };
    if (schedule) {
      update.mutate({ scheduleId: schedule.id, name: draft.name.trim(), ...base });
    } else {
      create.mutate({ name: draft.name.trim() || undefined, ...base });
    }
  };

  const toggleDay = (d: number) =>
    setDraft((p) => ({
      ...p,
      daysOfWeek: p.daysOfWeek.includes(d)
        ? p.daysOfWeek.filter((x) => x !== d)
        : [...p.daysOfWeek, d],
    }));

  const togglePlatform = (pl: Platform) =>
    setDraft((p) => ({
      ...p,
      platforms: p.platforms.includes(pl)
        ? p.platforms.filter((x) => x !== pl)
        : [...p.platforms, pl],
    }));

  const setTime = (i: number, v: string) =>
    setDraft((p) => ({ ...p, times: p.times.map((t, idx) => (idx === i ? v : t)) }));
  const addTime = () => setDraft((p) => ({ ...p, times: [...p.times, '12:00'] }));
  const removeTime = (i: number) =>
    setDraft((p) => ({ ...p, times: p.times.filter((_, idx) => idx !== i) }));

  const canSave = draft.daysOfWeek.length > 0 && draft.times.length > 0 && !saving;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <Input
        value={draft.name}
        onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
        placeholder="Schedule name (optional)"
      />

      <div>
        <p className="mb-1 text-xs font-medium">Days</p>
        <div className="flex flex-wrap gap-1">
          {DAY_LABELS.map((label, d) => (
            <button
              key={d}
              type="button"
              onClick={() => toggleDay(d)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                draft.daysOfWeek.includes(d)
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium">Times</p>
        <div className="space-y-1.5">
          {draft.times.map((t, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                type="time"
                value={t}
                onChange={(e) => setTime(i, e.target.value)}
                className="w-36"
              />
              {draft.times.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeTime(i)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove time"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={addTime}>
            <Plus className="mr-1 h-4 w-4" /> Add time
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium">Platforms</p>
        <div className="flex flex-wrap gap-1">
          {platformSchema.options.map((pl) => {
            const selected = draft.platforms.includes(pl);
            return (
              <button
                key={pl}
                type="button"
                onClick={() => togglePlatform(pl)}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  selected ? 'bg-primary text-primary-foreground' : 'hover:bg-accent border'
                }`}
              >
                {pl === 'TIKTOK' && tiktokAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={tiktokAvatarUrl}
                    alt=""
                    className="-ml-0.5 h-4 w-4 shrink-0 rounded-full object-cover"
                  />
                ) : null}
                {PLATFORM_LABELS[pl]}
                {selected ? (
                  <span className="-mr-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-white">
                    <Check className="h-2.5 w-2.5 text-blue-600" strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">Timezone</p>
        <Input
          value={draft.timezone}
          onChange={(e) => setDraft((p) => ({ ...p, timezone: e.target.value }))}
          placeholder="e.g. America/New_York"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!canSave}>
          {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
          {isEditing ? 'Save changes' : 'Save schedule'}
        </Button>
      </div>
    </div>
  );
}
