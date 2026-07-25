import { type Platform } from '@postpilot/types';

/**
 * Platform brand glyphs. All three inherit the current text color
 * (`currentColor`) so they stay legible wherever they're used — on a colored
 * connect button (inheriting the button text color) or as a brand-colored badge
 * (via `PLATFORM_BRAND_TEXT`). Marks are kept undistorted per each platform's
 * brand guidelines.
 */
export function PlatformGlyph({
  platform,
  className,
}: {
  platform: Platform;
  className?: string;
}) {
  switch (platform) {
    case 'INSTAGRAM':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="2" width="20" height="20" rx="5.5" />
          <circle cx="12" cy="12" r="4.2" />
          <circle cx="17.3" cy="6.7" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'TIKTOK':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
        </svg>
      );
    case 'YOUTUBE':
      return (
        <svg
          viewBox="0 0 24 24"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="2" y="5.5" width="20" height="13" rx="4" />
          <path d="M9.8 9.2 15.6 12 9.8 14.8z" fill="currentColor" stroke="none" />
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
 * A small brand-colored platform glyph in a white circle, positioned to overlap
 * the bottom-right corner of an account avatar. Drop inside a `relative` parent.
 */
export function PlatformCornerBadge({
  platform,
  size = 'md',
}: {
  platform: Platform;
  size?: 'sm' | 'md';
}) {
  const badge = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const glyph = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3';
  return (
    <span
      aria-hidden="true"
      className={`absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white ring-2 ring-white ${badge}`}
    >
      <PlatformGlyph platform={platform} className={`${glyph} ${PLATFORM_BRAND_TEXT[platform]}`} />
    </span>
  );
}
