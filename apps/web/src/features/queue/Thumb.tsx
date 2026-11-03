import { Film } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * A post's thumbnail, with a film glyph when it has none. Rendered as a span so
 * it stays valid inside clickable rows and chips.
 */
export function Thumb({
  url,
  size = 'md',
  faded,
}: {
  url: string | null;
  /** `md` for list rows, `xs` for calendar chips. */
  size?: 'md' | 'xs';
  /** Muted, for posts that already went out. */
  faded?: boolean;
}) {
  return (
    <span
      className={cn(
        'bg-muted flex shrink-0 items-center justify-center overflow-hidden',
        size === 'md' ? 'ring-line h-12 w-8 rounded ring-1' : 'h-4 w-4 rounded-sm',
        faded && 'opacity-60',
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Film
          className={cn('text-muted-foreground', size === 'md' ? 'h-4 w-4' : 'h-2.5 w-2.5')}
          aria-hidden
        />
      )}
    </span>
  );
}
