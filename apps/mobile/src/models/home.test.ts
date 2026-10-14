import { describe, expect, it } from 'vitest';

import { buildHomeModel, type HomeOverview } from './home';

const DAY = 86_400_000;
// Every fixture date sits at midday UTC, so formatted dates hold in any zone from UTC-11 to UTC+11 (CI runs in UTC).
const NOW = new Date('2026-10-14T12:00:00Z');
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * DAY);

type Entry = HomeOverview['connections'][number];
type Status = NonNullable<Entry['connection']>['status'];

function conn(platform: Entry['platform'], status: Status | null): Entry {
  return {
    platform,
    configured: true,
    connection:
      status === null
        ? null
        : {
            id: `conn_${platform}`,
            platform,
            status,
            username: 'creator',
            displayName: 'Creator',
            avatarUrl: null,
            needsReconnectSince: null,
            lastRefreshedAt: null,
            accessTokenExpiresAt: null,
            createdAt: daysFromNow(-30),
          },
  };
}

/** A healthy queue: 16 days of content, upload-by still in the future. */
function overview(overrides: Partial<HomeOverview> = {}): HomeOverview {
  return {
    queueStatus: 'ACTIVE',
    health: {
      remaining: 16,
      postsPerDay: 1,
      daysRemaining: 16,
      estimatedEmptyDate: daysFromNow(16),
      recommendedUploadBy: daysFromNow(2),
    },
    readyVideos: 3,
    nextPost: {
      platform: 'TIKTOK',
      scheduledAt: new Date('2026-10-15T12:00:00Z'),
      title: 'Morning routine',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
    },
    lastPublished: null,
    connections: [conn('TIKTOK', 'ACTIVE'), conn('INSTAGRAM', 'ACTIVE'), conn('YOUTUBE', null)],
    ...overrides,
  };
}

/** Upload-by has passed: 6 days left, so the recommended date was 8 days ago. */
const lowHealth: HomeOverview['health'] = {
  remaining: 6,
  postsPerDay: 1,
  daysRemaining: 6,
  estimatedEmptyDate: daysFromNow(6),
  recommendedUploadBy: daysFromNow(-8),
};

describe('buildHomeModel — verdict', () => {
  it('says Running with the runway when nothing is wrong', () => {
    const model = buildHomeModel(overview(), NOW);

    expect(model.verdict).toEqual({
      state: 'running',
      tone: 'ok',
      label: 'Running',
      detail: 'posting through Oct 30 (~16 days of content)',
      copy: 'Running · posting through Oct 30 (~16 days of content)',
    });
    expect(model.problems).toEqual([]);
  });

  it('rounds the runway to whole days', () => {
    const model = buildHomeModel(
      overview({
        health: {
          remaining: 46,
          postsPerDay: 2,
          daysRemaining: 22.6,
          // Whole days from midday NOW, so the formatted date can't shift with the runner's time zone.
          estimatedEmptyDate: daysFromNow(22),
          recommendedUploadBy: daysFromNow(8.6),
        },
      }),
      NOW,
    );

    expect(model.verdict.copy).toBe('Running · posting through Nov 5 (~23 days of content)');
  });

  it('says Needs attention and names the platform that needs reconnecting', () => {
    const model = buildHomeModel(
      overview({ connections: [conn('TIKTOK', 'NEEDS_RECONNECT'), conn('INSTAGRAM', 'ACTIVE')] }),
      NOW,
    );

    expect(model.verdict).toMatchObject({
      state: 'needs-attention',
      tone: 'critical',
      copy: 'Needs attention · TikTok needs reconnecting',
    });
  });

  it('names every platform that needs reconnecting', () => {
    const model = buildHomeModel(
      overview({
        connections: [conn('TIKTOK', 'NEEDS_RECONNECT'), conn('INSTAGRAM', 'NEEDS_RECONNECT')],
      }),
      NOW,
    );

    expect(model.verdict.copy).toBe('Needs attention · TikTok and Instagram need reconnecting');
  });

  it('says Paused when the queue is paused', () => {
    const model = buildHomeModel(overview({ queueStatus: 'PAUSED' }), NOW);

    expect(model.verdict).toMatchObject({
      state: 'paused',
      tone: 'warn',
      copy: 'Paused · nothing will post until you resume',
    });
    // The verdict already says it; no duplicate card.
    expect(model.problems).toEqual([]);
  });
});

describe('buildHomeModel — Running low triggers', () => {
  it('fires when the queue is empty', () => {
    const model = buildHomeModel(
      overview({
        // Upload-by left in the future so only the empty trigger applies.
        health: { ...overview().health, remaining: 0 },
        nextPost: null,
      }),
      NOW,
    );

    expect(model.verdict).toMatchObject({
      state: 'running-low',
      tone: 'warn',
      copy: 'Running low · queue is empty, upload more to keep posting',
    });
  });

  it('fires when there is no posting schedule', () => {
    const model = buildHomeModel(
      overview({
        health: {
          remaining: 12,
          postsPerDay: 0,
          daysRemaining: null,
          estimatedEmptyDate: null,
          recommendedUploadBy: null,
        },
      }),
      NOW,
    );

    expect(model.verdict).toMatchObject({
      state: 'running-low',
      tone: 'warn',
      copy: 'Running low · no posting schedule, add one on the web',
    });
  });

  it('fires once the recommended upload date has passed', () => {
    const model = buildHomeModel(overview({ health: lowHealth }), NOW);

    expect(model.verdict).toMatchObject({
      state: 'running-low',
      tone: 'warn',
      copy: 'Running low · upload more by Oct 20',
    });
  });

  it('fires on the recommended upload date itself', () => {
    const model = buildHomeModel(
      overview({ health: { ...overview().health, recommendedUploadBy: NOW } }),
      NOW,
    );

    expect(model.verdict.state).toBe('running-low');
  });

  it('does not fire the moment before the recommended upload date', () => {
    const model = buildHomeModel(
      overview({
        health: { ...overview().health, recommendedUploadBy: new Date(NOW.getTime() + 1) },
      }),
      NOW,
    );

    expect(model.verdict.state).toBe('running');
  });
});

describe('buildHomeModel — precedence keeps lower problems as cards', () => {
  it('reconnect + paused → Needs attention, with a Paused card still shown', () => {
    const model = buildHomeModel(
      overview({ queueStatus: 'PAUSED', connections: [conn('TIKTOK', 'NEEDS_RECONNECT')] }),
      NOW,
    );

    expect(model.verdict.state).toBe('needs-attention');
    expect(model.problems).toEqual([
      expect.objectContaining({ kind: 'connection', title: 'TikTok needs reconnecting' }),
      {
        kind: 'queue-paused',
        key: 'queue-paused',
        tone: 'warn',
        title: 'Queue is paused',
        detail: 'Nothing will post until you resume.',
        target: 'queue',
      },
    ]);
  });

  it('reconnect + running low → Needs attention, with a Running low card', () => {
    const model = buildHomeModel(
      overview({ health: lowHealth, connections: [conn('TIKTOK', 'NEEDS_RECONNECT')] }),
      NOW,
    );

    expect(model.verdict.state).toBe('needs-attention');
    expect(model.problems.map((p) => p.kind)).toEqual(['connection', 'running-low']);
    expect(model.problems[1]).toEqual({
      kind: 'running-low',
      key: 'running-low',
      tone: 'warn',
      title: 'Running low',
      detail: 'Upload more by Oct 20.',
      target: 'queue',
    });
  });

  it('paused + running low → Paused, with a Running low card', () => {
    const model = buildHomeModel(overview({ queueStatus: 'PAUSED', health: lowHealth }), NOW);

    expect(model.verdict.state).toBe('paused');
    expect(model.problems.map((p) => p.kind)).toEqual(['running-low']);
  });

  it('running low alone → no duplicate Running low card', () => {
    const model = buildHomeModel(overview({ health: lowHealth }), NOW);

    expect(model.problems).toEqual([]);
  });

  it('reconnect + paused + running low → every lower problem gets a card', () => {
    const model = buildHomeModel(
      overview({
        queueStatus: 'PAUSED',
        health: lowHealth,
        connections: [conn('TIKTOK', 'NEEDS_RECONNECT')],
      }),
      NOW,
    );

    expect(model.verdict.state).toBe('needs-attention');
    expect(model.problems.map((p) => p.kind)).toEqual(['connection', 'queue-paused', 'running-low']);
  });
});

describe('buildHomeModel — connection cards', () => {
  it('shows a card only for NEEDS_RECONNECT and PAUSED connections, linking to Settings', () => {
    const model = buildHomeModel(
      overview({
        connections: [
          conn('TIKTOK', 'NEEDS_RECONNECT'),
          conn('INSTAGRAM', 'PAUSED'),
          conn('YOUTUBE', 'ACTIVE'),
        ],
      }),
      NOW,
    );

    expect(model.problems).toEqual([
      {
        kind: 'connection',
        key: 'connection-TIKTOK',
        tone: 'critical',
        title: 'TikTok needs reconnecting',
        detail: 'Posts to TikTok are on hold until you reconnect on the web.',
        target: 'settings',
      },
      {
        kind: 'connection',
        key: 'connection-INSTAGRAM',
        tone: 'warn',
        title: 'Instagram is paused',
        detail: 'Nothing will post to Instagram while it is paused.',
        target: 'settings',
      },
    ]);
  });

  it('ignores active, disconnected and never-connected platforms', () => {
    const model = buildHomeModel(
      overview({
        connections: [conn('TIKTOK', 'ACTIVE'), conn('INSTAGRAM', 'DISCONNECTED'), conn('YOUTUBE', null)],
      }),
      NOW,
    );

    expect(model.problems).toEqual([]);
    expect(model.verdict.state).toBe('running');
  });

  it('a paused connection alone does not change the verdict', () => {
    const model = buildHomeModel(overview({ connections: [conn('INSTAGRAM', 'PAUSED')] }), NOW);

    expect(model.verdict.state).toBe('running');
    expect(model.problems).toHaveLength(1);
  });
});

describe('buildHomeModel — next post', () => {
  it('describes the next scheduled post and links to Queue', () => {
    const model = buildHomeModel(overview(), NOW);

    expect(model.nextPost).toEqual({
      title: 'Morning routine',
      platform: 'TikTok',
      when: expect.stringContaining('Oct 15'),
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      target: 'queue',
    });
  });

  it('falls back to Untitled', () => {
    const base = overview();
    const model = buildHomeModel(
      overview({ nextPost: { ...base.nextPost!, title: null, thumbnailUrl: null } }),
      NOW,
    );

    expect(model.nextPost).toMatchObject({ title: 'Untitled', thumbnailUrl: null });
  });

  it('is null when nothing is scheduled', () => {
    expect(buildHomeModel(overview({ nextPost: null }), NOW).nextPost).toBeNull();
  });
});
