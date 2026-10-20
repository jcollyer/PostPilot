import { describe, expect, it } from 'vitest';

import {
  buildSettingsModel,
  NAME_MAX_LENGTH,
  nameDraft,
  versionString,
  webOrigin,
  type SettingsBilling,
  type SettingsConnections,
  type SettingsInput,
} from './settings';

const GB = 1024 ** 3;
const WEB = 'https://app.postpilot.test';

type Entry = SettingsConnections[number];
type Status = NonNullable<Entry['connection']>['status'];

function conn(platform: Entry['platform'], status: Status | null, configured = true): Entry {
  return {
    platform,
    configured,
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
            createdAt: new Date('2026-09-01T12:00:00Z'),
          },
  };
}

/** A Creator subscriber, renewing, well inside both caps. */
function billing(overrides: Partial<SettingsBilling> = {}): SettingsBilling {
  const usage = {
    storageBytes: 1.5 * GB,
    videoBytes: 1.5 * GB,
    imageBytes: 0,
    videoCount: 12,
    videosWithSource: 12,
    videosProcessed: 12,
    imageCount: 0,
    bytesPerVideo: GB / 8,
    plan: 'CREATOR' as const,
    storageRatio: 1.5 / 60,
    videoRatio: 12 / 300,
    overStorage: false,
    overVideos: false,
    overLimit: false,
  };
  return {
    plan: 'CREATOR',
    planSelectedAt: new Date('2026-09-01T12:00:00Z'),
    stripeSubscriptionStatus: 'active',
    stripePriceId: 'price_creator_monthly',
    // Midday UTC, so the formatted date holds in any zone from UTC-11 to UTC+11.
    currentPeriodEnd: new Date('2026-11-03T12:00:00Z'),
    cancelAtPeriodEnd: false,
    limits: { name: 'Creator', monthly: 5, annual: 50, videos: 300, storageBytes: 60 * GB },
    usage,
    needsPlanSelection: false,
    hasSubscription: true,
    billingConfigured: true,
    ...overrides,
  };
}

function input(overrides: Partial<SettingsInput> = {}): SettingsInput {
  return {
    me: {
      id: 'user_1',
      name: 'Sam Creator',
      email: 'sam@example.com',
      image: null,
      createdAt: new Date('2026-09-01T12:00:00Z'),
      deleteSourceAfterPublish: false,
    },
    connections: [conn('TIKTOK', 'ACTIVE'), conn('INSTAGRAM', 'ACTIVE'), conn('YOUTUBE', 'ACTIVE')],
    billing: billing(),
    app: { version: '1.0.0', build: '12' },
    apiUrl: WEB,
    ...overrides,
  };
}

describe('buildSettingsModel — account', () => {
  it('shows the name and email', () => {
    expect(buildSettingsModel(input()).account).toEqual({
      name: 'Sam Creator',
      email: 'sam@example.com',
    });
  });

  it('says so when no name is set', () => {
    const me = { ...input().me!, name: '  ' };
    expect(buildSettingsModel(input({ me })).account?.name).toBe('Not set');
  });

  it('is null while the user is unavailable', () => {
    expect(buildSettingsModel(input({ me: undefined })).account).toBeNull();
  });
});

describe('buildSettingsModel — connected accounts', () => {
  it('lists only configured platforms', () => {
    const model = buildSettingsModel(
      input({
        connections: [
          conn('TIKTOK', 'ACTIVE'),
          conn('INSTAGRAM', null, false),
          conn('YOUTUBE', 'ACTIVE'),
        ],
      }),
    );

    expect(model.connections?.map((r) => r.name)).toEqual(['TikTok', 'YouTube Shorts']);
  });

  it('words and tones each status', () => {
    const model = buildSettingsModel(
      input({
        connections: [
          conn('TIKTOK', 'ACTIVE'),
          conn('INSTAGRAM', 'NEEDS_RECONNECT'),
          conn('YOUTUBE', 'PAUSED'),
        ],
      }),
    );
    const notConnected = buildSettingsModel(
      input({ connections: [conn('TIKTOK', null), conn('YOUTUBE', 'DISCONNECTED')] }),
    );

    expect(model.connections?.map((r) => [r.status, r.tone])).toEqual([
      ['Active', 'ok'],
      ['Needs reconnect', 'critical'],
      ['Paused', 'warn'],
    ]);
    expect(notConnected.connections?.map((r) => [r.status, r.tone])).toEqual([
      ['Not connected', 'muted'],
      ['Not connected', 'muted'],
    ]);
  });

  it('opens web Connections from broken and unconnected rows only', () => {
    const model = buildSettingsModel(
      input({
        connections: [
          conn('TIKTOK', 'ACTIVE'),
          conn('INSTAGRAM', 'NEEDS_RECONNECT'),
          conn('YOUTUBE', 'PAUSED'),
        ],
      }),
    );
    const unconnected = buildSettingsModel(input({ connections: [conn('TIKTOK', null)] }));

    expect(model.connections?.map((r) => r.webUrl)).toEqual([
      null,
      `${WEB}/settings/connections`,
      null,
    ]);
    expect(unconnected.connections?.[0]?.webUrl).toBe(`${WEB}/settings/connections`);
  });

  it('always offers Manage on the web, at the web origin', () => {
    const model = buildSettingsModel(input({ apiUrl: `${WEB}/api/trpc` }));
    expect(model.manageConnectionsUrl).toBe(`${WEB}/settings/connections`);
  });

  it('is null while connections are unavailable', () => {
    expect(buildSettingsModel(input({ connections: undefined })).connections).toBeNull();
  });
});

describe('buildSettingsModel — plan and usage', () => {
  it('says when a subscription renews', () => {
    expect(buildSettingsModel(input()).plan).toMatchObject({
      name: 'Creator',
      period: 'Renews on Nov 3, 2026',
    });
  });

  it('says when a cancelled subscription ends', () => {
    const model = buildSettingsModel(input({ billing: billing({ cancelAtPeriodEnd: true }) }));
    expect(model.plan?.period).toBe('Cancels on Nov 3, 2026');
  });

  it('has no period line without a running subscription', () => {
    const free = billing({
      plan: 'FREE',
      limits: { name: 'Free', monthly: 0, annual: 0, videos: 25, storageBytes: 5 * GB },
      stripeSubscriptionStatus: null,
      currentPeriodEnd: null,
      hasSubscription: false,
    });
    // A lapsed subscription keeps its old period end; it renews nothing.
    const lapsed = billing({ stripeSubscriptionStatus: 'canceled', hasSubscription: false });

    expect(buildSettingsModel(input({ billing: free })).plan?.period).toBeNull();
    expect(buildSettingsModel(input({ billing: lapsed })).plan?.period).toBeNull();
  });

  it('measures videos and storage against the plan’s limits', () => {
    expect(buildSettingsModel(input()).plan?.usage).toEqual([
      {
        key: 'videos',
        label: 'Videos',
        copy: '12 of 300',
        ratio: 0.04,
        tone: 'normal',
      },
      {
        key: 'storage',
        label: 'Storage',
        copy: '1.5 GB of 60 GB',
        ratio: 0.025,
        tone: 'normal',
      },
    ]);
  });

  it('warns near a limit and turns critical past it, capping the bar at full', () => {
    const b = billing();
    const model = buildSettingsModel(
      input({
        billing: billing({
          usage: {
            ...b.usage,
            videoCount: 280,
            videoRatio: 280 / 300,
            storageBytes: 66 * GB,
            storageRatio: 66 / 60,
            overStorage: true,
            overLimit: true,
          },
        }),
      }),
    );

    expect(model.plan?.usage.map((u) => [u.copy, u.ratio, u.tone])).toEqual([
      ['280 of 300', 280 / 300, 'warn'],
      ['66 GB of 60 GB', 1, 'critical'],
    ]);
    expect(model.plan?.note).toBe(
      'You’re over your Creator limits, so new uploads are paused. Nothing has been removed and your queue keeps publishing.',
    );
  });

  it('has no note within limits', () => {
    expect(buildSettingsModel(input()).plan?.note).toBeNull();
  });

  it('is null while billing is unavailable', () => {
    expect(buildSettingsModel(input({ billing: undefined })).plan).toBeNull();
  });
});

describe('buildSettingsModel — about', () => {
  it('shows the version and build', () => {
    expect(buildSettingsModel(input()).about.version).toBe('1.0.0 (12)');
  });

  it('links Privacy, Terms and the web app at the web origin', () => {
    expect(buildSettingsModel(input()).about.links).toEqual([
      { key: 'privacy', label: 'Privacy', url: `${WEB}/privacy` },
      { key: 'terms', label: 'Terms', url: `${WEB}/terms` },
      { key: 'web', label: 'Open PostPilot on the web', url: `${WEB}/home` },
    ]);
  });
});

describe('nameDraft', () => {
  it('saves a changed name, trimmed', () => {
    expect(nameDraft('  Sam Maker ', 'Sam Creator')).toMatchObject({
      name: 'Sam Maker',
      canSave: true,
    });
  });

  it('allows exactly 1 and 80 characters', () => {
    expect(nameDraft('S', 'Sam').canSave).toBe(true);
    expect(nameDraft('x'.repeat(NAME_MAX_LENGTH), 'Sam').canSave).toBe(true);
  });

  it('blocks an empty or blank name', () => {
    expect(nameDraft('', 'Sam').canSave).toBe(false);
    expect(nameDraft('   ', 'Sam').canSave).toBe(false);
  });

  it('blocks a name over 80 characters and says by how much', () => {
    expect(nameDraft('x'.repeat(81), 'Sam')).toMatchObject({
      canSave: false,
      note: { text: '1 character too long', tone: 'over' },
    });
    expect(nameDraft('x'.repeat(83), 'Sam').note.text).toBe('3 characters too long');
  });

  it('ignores surrounding spaces when counting', () => {
    expect(nameDraft(` ${'x'.repeat(80)} `, 'Sam').canSave).toBe(true);
  });

  it('blocks a name that matches the saved one', () => {
    expect(nameDraft('Sam Creator ', 'Sam Creator').canSave).toBe(false);
  });

  it('allows setting a first name when none is saved', () => {
    expect(nameDraft('Sam', null).canSave).toBe(true);
  });

  it('states the limit otherwise', () => {
    expect(nameDraft('Sam', 'Sam').note).toEqual({ text: 'Up to 80 characters.', tone: 'normal' });
  });
});

describe('versionString', () => {
  it('pairs the version with its build', () => {
    expect(versionString({ version: '1.2.0', build: '34' })).toBe('1.2.0 (34)');
  });

  it('drops a missing build', () => {
    expect(versionString({ version: '1.2.0', build: null })).toBe('1.2.0');
  });

  it('says Unknown without a version', () => {
    expect(versionString({ version: null, build: '34' })).toBe('Unknown');
  });
});

describe('webOrigin', () => {
  it('keeps the scheme, host and port only', () => {
    expect(webOrigin('http://192.168.1.42:3000/api/trpc?x=1')).toBe('http://192.168.1.42:3000');
    expect(webOrigin('https://app.postpilot.test/')).toBe('https://app.postpilot.test');
  });
});
