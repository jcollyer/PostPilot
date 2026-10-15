import { describe, expect, it } from 'vitest';

import { buildLibraryItemDetail, type LibraryItemDetail } from './library-item';
import { connections, hoursAgo, image, NOW, videoDetail } from './library.fixtures';

const LIVE = connections(['TIKTOK', 'INSTAGRAM']);

const postedOn = (d: Date) =>
  `Posted ${new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)}`;

function preview<K extends LibraryItemDetail['preview']['kind']>(
  detail: LibraryItemDetail,
  kind: K,
): Extract<LibraryItemDetail['preview'], { kind: K }> {
  expect(detail.preview.kind).toBe(kind);
  return detail.preview as Extract<LibraryItemDetail['preview'], { kind: K }>;
}

describe('buildLibraryItemDetail — video playback', () => {
  it('plays a ready video from its CDN url, with its thumbnail as the poster', () => {
    const detail = buildLibraryItemDetail(videoDetail('v1'), LIVE, NOW);

    expect(preview(detail, 'video')).toMatchObject({
      uri: 'https://cdn.example.com/v1.mp4',
      posterUrl: 'https://cdn.example.com/v1.jpg',
      unavailable: null,
    });
  });

  it('has nothing to play while the video is still processing', () => {
    const detail = buildLibraryItemDetail(videoDetail('v1', { status: 'PROCESSING' }), LIVE, NOW);

    expect(preview(detail, 'video')).toMatchObject({
      uri: null,
      unavailable: 'Plays once processing finishes.',
    });
  });

  it('has nothing to play when the upload failed', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', { status: 'FAILED', cdnUrl: null }),
      LIVE,
      NOW,
    );

    expect(preview(detail, 'video')).toMatchObject({
      uri: null,
      unavailable: 'The upload failed, so there’s nothing to play.',
    });
  });

  it('has nothing to play once the source was removed after posting, but keeps the poster', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', { sourceDeletedAt: hoursAgo(5), postedAt: hoursAgo(200) }),
      LIVE,
      NOW,
    );

    expect(preview(detail, 'video')).toMatchObject({
      uri: null,
      posterUrl: 'https://cdn.example.com/v1.jpg',
      unavailable: 'The video file was removed after posting.',
    });
  });

  it('sizes the player to the video, defaulting to vertical when dimensions are unknown', () => {
    const square = buildLibraryItemDetail(videoDetail('v1', { width: 1080, height: 1080 }), LIVE, NOW);
    const unknown = buildLibraryItemDetail(videoDetail('v2', { width: null, height: null }), LIVE, NOW);

    expect(square.preview.aspectRatio).toBe(1);
    expect(unknown.preview.aspectRatio).toBe(9 / 16);
  });

  it('keeps an extreme shape inside 9:16 to 1.91:1', () => {
    const tall = buildLibraryItemDetail(videoDetail('v1', { width: 500, height: 2000 }), LIVE, NOW);
    const wide = buildLibraryItemDetail(videoDetail('v2', { width: 4000, height: 1000 }), LIVE, NOW);

    expect(tall.preview.aspectRatio).toBe(9 / 16);
    expect(wide.preview.aspectRatio).toBe(1.91);
  });
});

describe('buildLibraryItemDetail — slides', () => {
  it('pages through every slide of a carousel in order, its own file first', () => {
    const detail = buildLibraryItemDetail(image('c1', 3), LIVE, NOW);

    expect(preview(detail, 'slides').slides).toEqual([
      { key: 'c1', uri: 'https://cdn.example.com/c1.jpg', label: 'Slide 1 of 3' },
      { key: 'c1_slide2', uri: 'https://cdn.example.com/c1_2.jpg', label: 'Slide 2 of 3' },
      { key: 'c1_slide3', uri: 'https://cdn.example.com/c1_3.jpg', label: 'Slide 3 of 3' },
    ]);
  });

  it('shows a single photo as one slide', () => {
    const detail = buildLibraryItemDetail(image('p1'), LIVE, NOW);

    expect(preview(detail, 'slides').slides).toEqual([
      { key: 'p1', uri: 'https://cdn.example.com/p1.jpg', label: 'Photo' },
    ]);
  });

  it('skips a slide with no file yet', () => {
    const c = image('c1', 3);
    c.carouselChildren[0] = { ...c.carouselChildren[0]!, cdnUrl: null };

    const slides = preview(buildLibraryItemDetail(c, LIVE, NOW), 'slides').slides;

    expect(slides.map((s) => s.label)).toEqual(['Slide 1 of 2', 'Slide 2 of 2']);
  });

  it('frames slides at the first slide’s shape, defaulting to 4:5', () => {
    const landscape = buildLibraryItemDetail(image('p1', 1, { width: 1600, height: 900 }), LIVE, NOW);
    const unknown = buildLibraryItemDetail(image('p2', 1, { width: null, height: null }), LIVE, NOW);

    expect(landscape.preview.aspectRatio).toBeCloseTo(16 / 9);
    expect(unknown.preview.aspectRatio).toBe(4 / 5);
  });
});

describe('buildLibraryItemDetail — metadata', () => {
  it('reads title, caption, hashtags and category from the item', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', {
        title: 'Morning routine',
        caption: 'How I start the day.',
        hashtags: ['morning', '#routine'],
        categoryId: 'cat1',
        category: { id: 'cat1', name: 'Lifestyle', color: '#22c55e' },
      }),
      LIVE,
      NOW,
    );

    expect(detail).toMatchObject({
      title: 'Morning routine',
      caption: 'How I start the day.',
      hashtags: '#morning #routine',
      category: 'Lifestyle',
    });
  });

  it('falls back to the filename for the title and leaves blank fields empty', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', { title: null, caption: '  ', hashtags: [] }),
      LIVE,
      NOW,
    );

    expect(detail).toMatchObject({
      title: 'v1.mp4',
      caption: null,
      hashtags: null,
      category: null,
    });
  });

  it('shows the same status as the item’s Library row', () => {
    const cases: [Parameters<typeof videoDetail>[1], LibraryItemDetail['status']][] = [
      [{ status: 'FAILED' }, { label: 'Upload failed', tone: 'critical' }],
      [{ status: 'PROCESSING' }, { label: 'Processing…', tone: 'muted' }],
      [{ tiktokNeedsInput: true }, { label: 'Needs TikTok details', tone: 'warn' }],
      [{ inQueue: true }, { label: 'In queue', tone: 'neutral' }],
      [{ postedAt: hoursAgo(50) }, { label: 'Posted 2d ago', tone: 'neutral' }],
      [{}, { label: 'Ready', tone: 'neutral' }],
    ];
    for (const [overrides, status] of cases) {
      expect(buildLibraryItemDetail(videoDetail('v1', overrides), LIVE, NOW).status).toEqual(status);
    }
  });

  it('lists the platforms it targets', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', { targetPlatforms: ['YOUTUBE', 'TIKTOK'] }),
      LIVE,
      NOW,
    );

    expect(detail.postsTo).toEqual({
      platforms: ['YOUTUBE', 'TIKTOK'],
      label: 'YouTube Shorts, TikTok',
    });
  });

  it('reads a default target as every connected platform', () => {
    const detail = buildLibraryItemDetail(videoDetail('v1', { targetPlatforms: [] }), LIVE, NOW);

    expect(detail.postsTo).toEqual({
      platforms: ['TIKTOK', 'INSTAGRAM'],
      label: 'TikTok, Instagram',
    });
  });

  it('says so when a default target has no platform connected to post to', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', { targetPlatforms: [] }),
      connections([]),
      NOW,
    );

    expect(detail.postsTo).toEqual({ platforms: [], label: 'All connected platforms' });
  });
});

describe('buildLibraryItemDetail — posts', () => {
  it('gives each platform it was posted to a row with its View post link', () => {
    const detail = buildLibraryItemDetail(
      videoDetail('v1', {
        postedAt: hoursAgo(48),
        postedPosts: [
          { platform: 'YOUTUBE', postedAt: hoursAgo(24).toISOString(), postUrl: 'https://youtu.be/x' },
          { platform: 'TIKTOK', postedAt: hoursAgo(48).toISOString(), postUrl: 'https://tiktok.com/@c/video/1' },
        ],
      }),
      LIVE,
      NOW,
    );

    expect(detail.posts).toEqual([
      {
        key: 'TIKTOK',
        platform: 'TIKTOK',
        name: 'TikTok',
        posted: postedOn(hoursAgo(48)),
        postUrl: 'https://tiktok.com/@c/video/1',
      },
      {
        key: 'YOUTUBE',
        platform: 'YOUTUBE',
        name: 'YouTube Shorts',
        posted: postedOn(hoursAgo(24)),
        postUrl: 'https://youtu.be/x',
      },
    ]);
  });

  it('keeps a post the platform gave no link for, without a link', () => {
    const detail = buildLibraryItemDetail(
      image('p1', 1, {
        postedAt: hoursAgo(3),
        postedPosts: [{ platform: 'INSTAGRAM', postedAt: hoursAgo(3).toISOString(), postUrl: null }],
      }),
      LIVE,
      NOW,
    );

    expect(detail.posts).toEqual([
      {
        key: 'INSTAGRAM',
        platform: 'INSTAGRAM',
        name: 'Instagram',
        posted: postedOn(hoursAgo(3)),
        postUrl: null,
      },
    ]);
  });

  it('has no posts for an item never posted', () => {
    expect(buildLibraryItemDetail(videoDetail('v1'), LIVE, NOW).posts).toEqual([]);
  });
});
