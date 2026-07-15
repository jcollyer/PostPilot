import { z } from 'zod';

import { getOpenAI, VISION_MODEL } from '../config';
import type { StyleExample } from './style-examples';

/**
 * Vision-LLM metadata generation. Given a few representative frames plus the
 * transcript, the model acts like a content manager: it writes base metadata,
 * picks a category and the strongest thumbnail frame, and tailors a caption set
 * per platform (TikTok favors hooks/trends, YouTube favors searchable titles,
 * Instagram sits between).
 */

// Matches steps/frames.ts's SAMPLE_FRACTIONS length — send every candidate
// frame extractThumbnails produced, not a subset of it.
const MAX_FRAMES = 5;

const platformMetaSchema = z.object({
  title: z.string().max(150).optional().default(''),
  caption: z.string().max(2200).optional().default(''),
  hashtags: z.array(z.string()).max(30).optional().default([]),
});

const rawSchema = z.object({
  title: z.string().max(150).optional().default(''),
  caption: z.string().max(2200).optional().default(''),
  hashtags: z.array(z.string()).max(30).optional().default([]),
  category: z.string().max(40).optional().default(''),
  bestFrameIndex: z.number().int().optional().default(0),
  platforms: z
    .object({
      TIKTOK: platformMetaSchema.optional(),
      INSTAGRAM: platformMetaSchema.optional(),
      YOUTUBE: platformMetaSchema.optional(),
    })
    .optional()
    .default({}),
});

export interface PlatformMeta {
  title: string;
  caption: string;
  hashtags: string[];
}

export interface GeneratedMetadata {
  title: string;
  caption: string;
  hashtags: string[];
  category: string;
  bestFrameIndex: number;
  platforms: { TIKTOK: PlatformMeta; INSTAGRAM: PlatformMeta; YOUTUBE: PlatformMeta };
}

/**
 * Explicit creator-set context (the CreatorProfile onboarding form + settings
 * card), as opposed to the *inferred* voice signals in style-examples.ts
 * (bio + past posts). Takes priority in the prompt since it's direct
 * instruction from the creator, not a guess.
 */
export interface CreatorProfileContext {
  niche: string | null;
  tone: string | null;
  audience: string | null;
  bannedWords: string[];
  exampleCaption: string | null;
  emojiPreference: 'NONE' | 'MODERATE' | 'HEAVY';
}

const EMOJI_GUIDANCE: Record<CreatorProfileContext['emojiPreference'], string> = {
  NONE: 'Do not use any emojis, anywhere.',
  MODERATE: 'Use emojis sparingly — only when they genuinely add something.',
  HEAVY: 'Use emojis liberally, matching an upbeat, emoji-forward caption style.',
};

const SYSTEM_PROMPT = `You are the content manager for a short-form video creator.
You are given sample frames from one vertical short video and (sometimes) its transcript.
Write publishing metadata. Be specific and engaging, never generic. Hashtags: lowercase,
no leading '#', 5-12 relevant tags.
Pick ONE concise category (1-2 words, e.g. "Travel", "Drone", "Cooking", "Fitness").
Choose the index of the most eye-catching frame for the thumbnail.
Tailor each platform: TikTok = punchy hook + trend-friendly; YouTube = clear searchable
title; Instagram = aesthetic, mid-length.
If a folder path is given, it is the creator's own filing of this video — its names
often encode who/what/where/why/when (e.g. a shoot location, event, client, series, or
date). Treat it as a strong topical hint to ground titles, captions, and hashtags, but
never quote raw folder names, internal codes, or dates verbatim if they read as
file-management jargon rather than natural caption language.
Three sources of voice context may follow, in priority order. If a creator profile is
given, it is the creator's own explicit instructions — follow it precisely, including its
banned words and emoji preference, and it overrides everything else below. If a creator
bio is given, use it to understand their niche and personality — it informs tone, never
gets quoted directly. If examples of this creator's past posts are given, use them ONLY to
match established voice, tone, caption length, and hashtag conventions — never copy their
specific topic, wording, or hashtags unless genuinely relevant to this new video. Absent
any of these, avoid clickbait and emoji-only captions.
Respond with ONLY a JSON object of the form:
{"title","caption","hashtags":[],"category","bestFrameIndex",
 "platforms":{"TIKTOK":{"title","caption","hashtags":[]},
 "INSTAGRAM":{...},"YOUTUBE":{...}}}`;

function normalizeHashtags(tags: string[]): string[] {
  return Array.from(
    new Set(
      tags.map((t) => t.replace(/^#/, '').trim().toLowerCase().replace(/\s+/g, '')).filter(Boolean),
    ),
  ).slice(0, 30);
}

function platformOf(p: PlatformMeta | undefined, fallback: GeneratedMetadata): PlatformMeta {
  return {
    title: p?.title?.trim() || fallback.title,
    caption: p?.caption?.trim() || fallback.caption,
    hashtags: normalizeHashtags(p?.hashtags?.length ? p.hashtags : fallback.hashtags),
  };
}

/** Render the creator's explicit profile as a prompt block, or '' when unset. */
function buildCreatorProfileText(profile: CreatorProfileContext | null | undefined): string {
  if (!profile) return '';
  const lines: string[] = [];
  if (profile.niche) lines.push(`Niche: ${profile.niche}`);
  if (profile.tone) lines.push(`Tone: ${profile.tone}`);
  if (profile.audience) lines.push(`Audience: ${profile.audience}`);
  if (profile.bannedWords.length > 0) {
    lines.push(
      `Never use these words/phrases, under any circumstance: ${profile.bannedWords.join(', ')}`,
    );
  }
  if (profile.exampleCaption) {
    lines.push(
      `An example caption in the creator's own words (match this voice — don't reuse its topic): "${profile.exampleCaption.slice(0, 500)}"`,
    );
  }
  lines.push(`Emoji use: ${EMOJI_GUIDANCE[profile.emojiPreference]}`);
  return `\nCreator profile (set directly by the creator — highest priority, follow precisely):\n${lines.join('\n')}\n`;
}

/**
 * Case-insensitive whole-word/phrase removal — the hard guarantee behind a
 * creator's "words to avoid" list, since prompt instructions alone aren't
 * 100% reliable. Runs on every generated field, not just the prompt.
 */
function removeBannedWords(text: string, banned: string[]): string {
  if (!text || banned.length === 0) return text;
  let result = text;
  for (const phrase of banned) {
    const trimmed = phrase.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '');
  }
  return result
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim();
}

function removeBannedFromHashtags(hashtags: string[], banned: string[]): string[] {
  if (banned.length === 0) return hashtags;
  const bannedLower = new Set(banned.map((b) => b.trim().toLowerCase()).filter(Boolean));
  return hashtags.filter((h) => !bannedLower.has(h.toLowerCase()));
}

/** Apply the banned-words filter to every text field of a generated result. */
function applyBannedWords(meta: GeneratedMetadata, banned: string[]): GeneratedMetadata {
  if (banned.length === 0) return meta;
  const clean = (p: PlatformMeta): PlatformMeta => ({
    title: removeBannedWords(p.title, banned),
    caption: removeBannedWords(p.caption, banned),
    hashtags: removeBannedFromHashtags(p.hashtags, banned),
  });
  return {
    ...meta,
    title: removeBannedWords(meta.title, banned),
    caption: removeBannedWords(meta.caption, banned),
    hashtags: removeBannedFromHashtags(meta.hashtags, banned),
    platforms: {
      TIKTOK: clean(meta.platforms.TIKTOK),
      INSTAGRAM: clean(meta.platforms.INSTAGRAM),
      YOUTUBE: clean(meta.platforms.YOUTUBE),
    },
  };
}

/**
 * Obvious file-management folder names that carry no topical signal — default
 * scaffolding ("New Folder"), placeholders ("Untitled"), workflow/status buckets
 * ("Final", "Drafts", "Exports"), and generic catch-alls ("Misc", "Stuff").
 * These get dropped before the path reaches the model so it isn't nudged toward
 * junk topics or tempted to quote them.
 */
const NON_SIGNAL_FOLDER_NAMES = new Set<string>([
  'new folder',
  'untitled',
  'untitled folder',
  'folder',
  'folders',
  'misc',
  'miscellaneous',
  'other',
  'others',
  'stuff',
  'random',
  'temp',
  'tmp',
  'temporary',
  'test',
  'tests',
  'testing',
  'draft',
  'drafts',
  'final',
  'finals',
  'wip',
  'todo',
  'copy',
  'export',
  'exports',
  'output',
  'outputs',
  'render',
  'renders',
  'raw',
  'footage',
  'uploads',
  'downloads',
  'videos',
  'video',
  'clips',
  'archive',
  'archived',
  'old',
  'unsorted',
  'inbox',
  'new',
]);

/**
 * Regex-based junk detection for names the exact blocklist can't enumerate:
 * pure version/sequence tokens ("v2", "final_v3", "draft 2"), "Copy of …" /
 * "… copy 2" duplicate markers, and lone small integers ("1", "2"). Note we do
 * NOT strip pure 4-digit numbers — "2024" is a meaningful year (the "when").
 */
function isNonSignalFolderName(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  if (NON_SIGNAL_FOLDER_NAMES.has(n)) return true;
  // version tokens: v2, ver 3, final_v2, draft-1, final 2, etc.
  if (/^(final|draft|ver|version|v|rev|take)[\s._-]*v?\d*$/.test(n)) return true;
  // duplicate markers: "copy of x", "x copy", "x copy 2", "x (1)"
  if (/^copy of /.test(n) || /\bcopy(\s*\d+)?$/.test(n) || /\(\d+\)$/.test(n)) return true;
  // lone small integers (folder "1", "2") — but keep years like 2024
  if (/^\d{1,3}$/.test(n)) return true;
  return false;
}

/**
 * Render the video's folder path (root → leaf) as a prompt block, or '' when
 * the video sits at the library root / has no folder. The path often encodes
 * who/what/where/why/when the creator captured this video, so it's a useful
 * topical anchor. Segments are joined with ' > ' so the model can see the
 * hierarchy (broad category → specific shoot). Obvious non-signal segments
 * (see isNonSignalFolderName) are dropped first so scaffolding names never
 * skew the metadata.
 */
function buildFolderPathText(folderPath: string[] | null | undefined): string {
  if (!folderPath || folderPath.length === 0) return '';
  const cleaned = folderPath
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !isNonSignalFolderName(s));
  if (cleaned.length === 0) return '';
  return `\nFolder (how the creator filed this video — a topical hint about who/what/where/why/when, not caption text to quote):\n${cleaned.join(' > ')}\n`;
}

/** Render past-post exemplars as a prompt block, or '' when there are none. */
function buildStyleExamplesText(examples: StyleExample[]): string {
  if (examples.length === 0) return '';
  const blocks = examples
    .map((ex, i) => {
      const hashtags = ex.hashtags.length ? ex.hashtags.join(', ') : '(none)';
      return `${i + 1}. Title: ${ex.title || '(none)'}\n   Caption: ${ex.caption || '(none)'}\n   Hashtags: ${hashtags}\n   Category: ${ex.category || '(none)'}`;
    })
    .join('\n');
  return `\nThis creator's past posts (voice/tone/hashtag-style reference ONLY — do not reuse their topics or wording):\n${blocks}\n`;
}

/** Run the vision model over up to MAX_FRAMES frames + transcript and parse the result. */
export async function generateMetadata(params: {
  frames: Buffer[];
  transcript: string | null;
  durationSec: number | null;
  creatorBio?: string | null;
  styleExamples?: StyleExample[];
  creatorProfile?: CreatorProfileContext | null;
  /** Folder chain root → leaf (e.g. ["Travel", "Japan 2024", "Tokyo"]). */
  folderPath?: string[] | null;
}): Promise<GeneratedMetadata> {
  // extractThumbnails samples MAX_FRAMES candidates (steps/frames.ts's
  // SAMPLE_FRACTIONS) — send all of them, not just the first 4, so the model
  // can actually see (and pick as thumbnail) the near-the-end frame too.
  //
  // Detail is 'low' on purpose: 'high' inlines the full-resolution frame as
  // base64 and holds all MAX_FRAMES of them in memory at once, which OOM-kills
  // the worker on memory-constrained hosts (and multiplies token cost). 'low'
  // downscales to ~512px at a flat ~85 tokens/frame — plenty for picking a
  // hook/thumbnail and writing captions. Revisit only with a per-frame size
  // guard if higher fidelity is ever needed.
  const frames = params.frames.slice(0, MAX_FRAMES);
  const imageContent = frames.map((buf) => ({
    type: 'image_url' as const,
    image_url: { url: `data:image/jpeg;base64,${buf.toString('base64')}`, detail: 'low' as const },
  }));

  const transcriptText = params.transcript
    ? `Transcript:\n${params.transcript.slice(0, 6000)}`
    : 'Transcript: (none — silent or music-only video; rely on the frames).';
  const durationText = params.durationSec
    ? `Video duration: ~${Math.round(params.durationSec)}s.`
    : '';
  const bioText = params.creatorBio
    ? `Creator bio (from their own platform profile): ${params.creatorBio.slice(0, 500)}`
    : '';
  const profileText = buildCreatorProfileText(params.creatorProfile);
  const folderText = buildFolderPathText(params.folderPath);
  const examplesText = buildStyleExamplesText(params.styleExamples ?? []);

  const completion = await getOpenAI().chat.completions.create({
    model: VISION_MODEL,
    response_format: { type: 'json_object' },
    // gpt-5-family models are reasoning models and bill reasoning tokens as
    // output ($/M output is the priciest line). Caption-writing doesn't need
    // deep reasoning, so pin effort to minimal. Older models (gpt-4o etc.)
    // reject the param, hence the guard. (Cast: this SDK version's type union
    // predates 'minimal', but the API accepts it for gpt-5-family models.)
    ...(VISION_MODEL.startsWith('gpt-5')
      ? { reasoning_effort: 'minimal' as unknown as 'low' }
      : {}),
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `${durationText}\n${profileText}\n${bioText}\n${folderText}\n${transcriptText}\n${examplesText}\nFrames follow in order:`,
          },
          ...imageContent,
        ],
      },
    ],
  });

  const content = completion.choices[0]?.message?.content ?? '{}';
  let parsed: z.infer<typeof rawSchema>;
  try {
    parsed = rawSchema.parse(JSON.parse(content));
  } catch {
    parsed = rawSchema.parse({});
  }

  const base: GeneratedMetadata = {
    title: parsed.title.trim(),
    caption: parsed.caption.trim(),
    hashtags: normalizeHashtags(parsed.hashtags),
    category: parsed.category.trim(),
    bestFrameIndex: Math.min(Math.max(0, parsed.bestFrameIndex), Math.max(0, frames.length - 1)),
    // placeholder; filled below once `base` exists
    platforms: {
      TIKTOK: { title: '', caption: '', hashtags: [] },
      INSTAGRAM: { title: '', caption: '', hashtags: [] },
      YOUTUBE: { title: '', caption: '', hashtags: [] },
    },
  };

  base.platforms = {
    TIKTOK: platformOf(parsed.platforms.TIKTOK, base),
    INSTAGRAM: platformOf(parsed.platforms.INSTAGRAM, base),
    YOUTUBE: platformOf(parsed.platforms.YOUTUBE, base),
  };

  return applyBannedWords(base, params.creatorProfile?.bannedWords ?? []);
}
