import { describe, expect, it } from 'vitest';

import {
  buildLibraryModel,
  EMPTY_LIBRARY,
  librarySections,
  searchQuery,
  type LibraryMedia,
} from './library';
import {
  connections,
  folder,
  folderPage,
  hoursAgo,
  image,
  NOW,
  searchPage,
  video,
} from './library.fixtures';

const LIVE = connections(['TIKTOK', 'INSTAGRAM']);

function browse(items: LibraryMedia[], folders = [folder('f1', 'Drafts')]) {
  return buildLibraryModel({ kind: 'folder', pages: [folderPage(folders, items)] }, LIVE, NOW);
}

function onlyRow(item: LibraryMedia) {
  return browse([item], []).media[0];
}

describe('buildLibraryModel — browsing', () => {
  it('sorts folders by name, numbers in order', () => {
    const model = browse(
      [],
      [
        folder('a', 'Week 10'),
        folder('b', 'archive'),
        folder('c', 'Week 2'),
        folder('d', 'Behind the scenes'),
      ],
    );
    expect(model.folders.map((f) => f.name)).toEqual([
      'archive',
      'Behind the scenes',
      'Week 2',
      'Week 10',
    ]);
  });

  it('merges videos, photos and carousels newest first across pages', () => {
    const pages = [
      folderPage(
        [folder('f1', 'Drafts')],
        [video('v2', { createdAt: hoursAgo(2) }), image('i1', 1, { createdAt: hoursAgo(1) })],
        'next',
      ),
      // Later pages carry no folders.
      folderPage(
        [],
        [image('c1', 3, { createdAt: hoursAgo(4) }), video('v3', { createdAt: hoursAgo(3) })],
      ),
    ];
    const model = buildLibraryModel({ kind: 'folder', pages }, LIVE, NOW);
    expect(model.folders.map((f) => f.id)).toEqual(['f1']);
    expect(model.media.map((m) => m.id)).toEqual(['i1', 'v2', 'v3', 'c1']);
  });

  it('shows the web upload hint when the level is empty', () => {
    expect(browse([], []).empty).toBe(EMPTY_LIBRARY);
    expect(EMPTY_LIBRARY).toBe('Upload from PostPilot on the web');
  });

  it('is not empty when the level holds only folders or only media', () => {
    expect(browse([]).empty).toBeNull();
    expect(browse([video('v1')], []).empty).toBeNull();
  });

  it('has no rows before the first page loads', () => {
    const model = buildLibraryModel({ kind: 'folder', pages: [] }, LIVE, NOW);
    expect(model.folders).toEqual([]);
    expect(model.media).toEqual([]);
  });
});

describe('buildLibraryModel — searching', () => {
  it('is a flat media list with no folders', () => {
    const model = buildLibraryModel(
      {
        kind: 'search',
        query: 'beach',
        pages: [searchPage([video('v1')], 'next'), searchPage([image('i1')])],
      },
      LIVE,
      NOW,
    );
    expect(model.folders).toEqual([]);
    expect(model.media.map((m) => m.id)).toEqual(['v1', 'i1']);
    expect(model.empty).toBeNull();
  });

  it('says nothing matched when the search is empty', () => {
    const model = buildLibraryModel(
      { kind: 'search', query: 'beach', pages: [searchPage([])] },
      LIVE,
      NOW,
    );
    expect(model.empty).toBe('Nothing matches “beach”.');
  });
});

describe('librarySections', () => {
  it('draws folders, then media with a gap above it', () => {
    const sections = librarySections(browse([video('v1')]));
    expect(sections.map((s) => [s.key, s.data.length, s.gapAbove])).toEqual([
      ['folders', 1, false],
      ['media', 1, true],
    ]);
  });

  it('drops an empty group, and media alone needs no gap', () => {
    expect(librarySections(browse([video('v1')], [])).map((s) => [s.key, s.gapAbove])).toEqual([
      ['media', false],
    ]);
    expect(librarySections(browse([])).map((s) => s.key)).toEqual(['folders']);
    expect(librarySections(browse([], []))).toEqual([]);
  });
});

describe('searchQuery', () => {
  it('trims, and treats blank text as browsing', () => {
    expect(searchQuery('  beach ')).toBe('beach');
    expect(searchQuery('   ')).toBeNull();
    expect(searchQuery('')).toBeNull();
  });
});

describe('media row status (first match wins)', () => {
  it('Upload failed outranks everything', () => {
    const row = onlyRow(
      video('v', {
        status: 'FAILED',
        tiktokNeedsInput: true,
        inQueue: true,
        postedAt: hoursAgo(5),
      }),
    );
    expect(row.status).toEqual({ label: 'Upload failed', tone: 'critical' });
  });

  it.each(['UPLOADING', 'PROCESSING'] as const)('%s reads Processing…', (status) => {
    const row = onlyRow(video('v', { status, tiktokNeedsInput: true, inQueue: true }));
    expect(row.status).toEqual({ label: 'Processing…', tone: 'muted' });
  });

  it('Needs TikTok details outranks In queue and Posted', () => {
    const row = onlyRow(
      video('v', { tiktokNeedsInput: true, inQueue: true, postedAt: hoursAgo(5) }),
    );
    expect(row.status).toEqual({ label: 'Needs TikTok details', tone: 'warn' });
  });

  it('In queue outranks Posted', () => {
    const row = onlyRow(video('v', { inQueue: true, postedAt: hoursAgo(5) }));
    expect(row.status).toEqual({ label: 'In queue', tone: 'neutral' });
  });

  it.each([
    [hoursAgo(0), 'Posted just now'],
    [new Date(NOW.getTime() - 5 * 60_000), 'Posted 5m ago'],
    [hoursAgo(3), 'Posted 3h ago'],
    [hoursAgo(24 * 2 + 5), 'Posted 2d ago'],
  ])('posted at %s reads %s', (postedAt, label) => {
    expect(onlyRow(video('v', { postedAt })).status).toEqual({ label, tone: 'neutral' });
  });

  it('otherwise Ready', () => {
    expect(onlyRow(video('v')).status).toEqual({ label: 'Ready', tone: 'neutral' });
    expect(onlyRow(image('i')).status).toEqual({ label: 'Ready', tone: 'neutral' });
  });

  it('photos follow the same ladder', () => {
    expect(onlyRow(image('i', 3, { status: 'FAILED' })).status.label).toBe('Upload failed');
    expect(onlyRow(image('i', 1, { inQueue: true })).status.label).toBe('In queue');
  });
});

describe('media row platforms', () => {
  it('an empty target means every connected platform', () => {
    expect(onlyRow(video('v', { targetPlatforms: [] })).platforms).toEqual(['TIKTOK', 'INSTAGRAM']);
  });

  it('only live connections count as connected', () => {
    const model = buildLibraryModel(
      { kind: 'folder', pages: [folderPage([], [video('v')])] },
      connections(['YOUTUBE']),
      NOW,
    );
    expect(model.media[0].platforms).toEqual(['YOUTUBE']);
  });

  it('an explicit target is shown as chosen', () => {
    expect(onlyRow(video('v', { targetPlatforms: ['YOUTUBE'] })).platforms).toEqual(['YOUTUBE']);
    expect(onlyRow(image('i')).platforms).toEqual(['INSTAGRAM']);
  });
});

describe('media row title', () => {
  it('uses the title when there is one', () => {
    expect(onlyRow(video('v', { title: 'Morning routine' })).title).toBe('Morning routine');
  });

  it('falls back to the original filename', () => {
    expect(onlyRow(video('v', { title: null, originalFilename: 'IMG_0042.mov' })).title).toBe(
      'IMG_0042.mov',
    );
    expect(onlyRow(video('v', { title: '  ', originalFilename: 'IMG_0042.mov' })).title).toBe(
      'IMG_0042.mov',
    );
  });

  it('is Untitled with neither', () => {
    expect(onlyRow(image('i', 1, { title: null, originalFilename: null })).title).toBe('Untitled');
  });
});

describe('media row length', () => {
  it.each([
    [7, '0:07'],
    [45.4, '0:45'],
    [125, '2:05'],
    [3723, '1:02:03'],
  ])('a %ss video reads %s', (durationSec, label) => {
    expect(onlyRow(video('v', { durationSec })).length).toEqual({ kind: 'duration', label });
  });

  it('a video still being probed has no length', () => {
    expect(onlyRow(video('v', { durationSec: null })).length).toBeNull();
  });

  it('a carousel reads its slide count', () => {
    expect(onlyRow(image('c', 4)).length).toEqual({ kind: 'slides', label: '4 slides' });
  });

  it('a single photo has no length', () => {
    expect(onlyRow(image('i')).length).toBeNull();
  });
});

describe('media row accessibility label', () => {
  it('reads title, status, length and platforms as one sentence', () => {
    expect(onlyRow(video('v', { title: 'Morning routine' })).accessibilityLabel).toBe(
      'Morning routine. Ready. 0:45. Posts to TikTok, Instagram',
    );
  });
});
