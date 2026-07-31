import { useId, useState } from 'react';

import { type Platform } from '@postpilot/types';

/**
 * Platform brand glyphs. TikTok inherits the current text color (`currentColor`)
 * so it stays legible on any background; YouTube and Instagram render in their
 * official brand colors (red/white and the Instagram gradient). Marks are kept
 * undistorted per each platform's brand guidelines.
 */
export function PlatformGlyph({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  // Unique gradient id per render so multiple Instagram glyphs on one page don't
  // collide (colons stripped so the id is safe inside an SVG url() reference).
  const gradientId = `ig-grad-${useId().replace(/:/g, '')}`;
  switch (platform) {
    case 'INSTAGRAM':
      // Official Instagram gradient camera mark.
      return (
        <svg viewBox="0 0 24 24" className={className} role="img" aria-label="Instagram">
          <defs>
            <radialGradient id={gradientId} cx="30%" cy="107%" r="150%">
              <stop offset="0%" stopColor="#FDF497" />
              <stop offset="5%" stopColor="#FDF497" />
              <stop offset="45%" stopColor="#FD5949" />
              <stop offset="60%" stopColor="#D6249F" />
              <stop offset="90%" stopColor="#285AEB" />
            </radialGradient>
          </defs>
          <rect x="2" y="2" width="20" height="20" rx="5.5" fill={`url(#${gradientId})`} />
          <circle cx="12" cy="12" r="4.2" fill="none" stroke="#fff" strokeWidth="2" />
          <circle cx="17.3" cy="6.7" r="1.2" fill="#fff" />
        </svg>
      );
    case 'TIKTOK':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    case 'YOUTUBE':
      // Official YouTube icon (full-color, unmodified) per YouTube branding
      // guidelines: red rounded-rectangle body + white play triangle, correct
      // shape and Red/White color. Do NOT recolor (currentColor) or reshape it,
      // and keep it at >= 20px height wherever it represents the YouTube brand.
      return (
        <svg viewBox="0 0 28 20" className={className} role="img" aria-label="YouTube">
          <path
            fill="#FF0000"
            d="M27.4 3.12a3.5 3.5 0 0 0-2.46-2.48C22.77.04 14 .04 14 .04S5.23.04 3.06.64A3.5 3.5 0 0 0 .6 3.12 36.6 36.6 0 0 0 0 10a36.6 36.6 0 0 0 .6 6.88 3.5 3.5 0 0 0 2.46 2.48C5.23 19.96 14 19.96 14 19.96s8.77 0 10.94-.6a3.5 3.5 0 0 0 2.46-2.48A36.6 36.6 0 0 0 28 10a36.6 36.6 0 0 0-.6-6.88Z"
          />
          <path fill="#FFFFFF" d="M11.2 14.29 18.63 10 11.2 5.71z" />
        </svg>
      );
    default:
      return null;
  }
}

/** Brand text-color classes, so `PlatformGlyph` (currentColor) renders on-brand. */
export const PLATFORM_BRAND_TEXT: Record<Platform, string> = {
  TIKTOK: 'text-[#010101]',
  INSTAGRAM: 'text-[#E1306C]',
  YOUTUBE: 'text-[#FF0000]',
};


/**
 * A standalone platform logo, sized so the three marks look visually balanced.
 * The logo is rendered on its own and must never be covered or overlapped, per
 * YouTube's branding guidelines (the logo must be fully and clearly visible).
 * Pair it with `AccountAvatar` placed next to the username — never on top of the
 * logo.
 */
export function PlatformLogo({
  platform,
  size = 'md',
}: {
  platform: Platform;
  size?: 'sm' | 'md';
}) {
  // YouTube's mark is a solid filled block, so it reads larger than the TikTok
  // note / Instagram square at the same height — render it a notch smaller for
  // balance, while staying at or above YouTube's 20px minimum.
  const logo =
    platform === 'YOUTUBE'
      ? size === 'sm'
        ? 'h-6 w-auto'
        : 'h-7 w-auto'
      : size === 'sm'
        ? 'h-7 w-auto'
        : 'h-9 w-auto';
  return <PlatformGlyph platform={platform} className={`shrink-0 ${logo}`} />;
}

/**
 * A small circular account avatar with a letter-tile fallback. Rendered beside
 * the username — kept separate from the platform logo so the logo is never
 * covered.
 */
export function AccountAvatar({
  url,
  name,
  className = 'h-4 w-4',
}: {
  url: string | null;
  name: string;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 overflow-hidden rounded-full bg-muted ${className}`}
    >
      {url && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          onError={() => setBroken(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <span className="text-muted-foreground flex h-full w-full items-center justify-center text-[8px] font-semibold uppercase">
          {name.replace(/^@/, '').charAt(0)}
        </span>
      )}
    </span>
  );
}
