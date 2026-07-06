'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

/**
 * Secondary marketing feature strip — a horizontal carousel of capability
 * cards, each pairing a beige visual card with a title + subtitle below it
 * (styled after the reference bento). Each card drops in a product screenshot
 * from /public/marketing (see that folder's README for expected filenames).
 *
 * The track full-bleeds to the right edge of the screen so the first card
 * aligns with the page gutter and later cards peek/scroll off-screen. Clickable
 * dots scroll the matching card to the gutter. Client component (scroll state).
 */

// Left gutter that lines the first card up with the centered page content
// (max-w-7xl = 80rem, px-6 = 1.5rem), while the track itself spans full width.
const GUTTER = 'max(1.5rem, calc((100vw - 80rem) / 2 + 1.5rem))';

function HiliteCard({
  title,
  subtitle,
  frame = false,
  children,
}: {
  title: string;
  subtitle: string;
  frame?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      {/* Illustrations sit on a beige surface; screenshots use the Mac window
          frame itself as the card border (no beige wrapper). */}
      <div className={frame ? 'h-[22rem] sm:h-[27rem]' : 'pp-feature-soft relative h-[22rem] overflow-hidden rounded-2xl sm:h-[27rem]'}>
        {children}
      </div>
      <h3 className="text-foreground mt-4 text-lg font-semibold leading-snug tracking-tight">
        {title}
      </h3>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">{subtitle}</p>
    </div>
  );
}

/**
 * Screenshot in a Mac-style window that fills the whole card — the window frame
 * is the card border. The image covers the body anchored top-left, so a tall
 * shot crops at the bottom and a wide one crops on the right, keeping the
 * top-left of the UI in view.
 */
function Shot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="pp-window flex h-full flex-col shadow-sm" style={{ borderRadius: '1rem' }}>
      <div className="pp-titlebar" aria-hidden>
        <span className="pp-dot" />
        <span className="pp-dot" />
        <span className="pp-dot" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <ShotSideNav />
        <div className="pp-winbody flex-1 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={alt} className="h-full w-full object-cover object-left-top" />
        </div>
      </div>
    </div>
  );
}

/**
 * Decorative Mac-style left sidebar shown inside every screenshot window:
 * product logo up top, then dashboard / folder / settings icons.
 */
function ShotSideNav() {
  return (
    <div
      aria-hidden
      className="flex w-10 shrink-0 flex-col items-center gap-3 border-r border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] py-3"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-small.png" alt="" className="h-5 w-5 object-contain opacity-55" />
      <div className="flex flex-col items-center gap-3 text-[hsl(var(--muted-foreground)/0.55)]">
        {/* Dashboard */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="7" height="9" />
          <rect x="14" y="3" width="7" height="5" />
          <rect x="14" y="12" width="7" height="9" />
          <rect x="3" y="16" width="7" height="5" />
        </svg>
        {/* Folder */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
        {/* Settings gear */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
      </div>
    </div>
  );
}

const CARDS = [
  {
    title: 'Review-first control',
    subtitle: 'Tune AI captions per platform and approve everything before it publishes.',
    frame: true,
    render: () => <Shot src="/marketing/review-first.webp" alt="Per-platform caption editor" />,
  },
  {
    title: 'Media, neatly organized',
    subtitle: 'Sort clips into folders, tag them, and find any shot in seconds.',
    frame: true,
    render: () => (
      <Shot src="/marketing/media-library.webp" alt="Media library organized into folders" />
    ),
  },
  {
    title: 'Queue schedules on autopilot',
    subtitle: 'Set recurring time slots and PostPilot drips your queue out automatically.',
    frame: true,
    render: () => (
      <Shot src="/marketing/schedule-helper.webp" alt="Queue schedule builder with recurring time slots" />
    ),
  },
  {
    title: 'Duplicates caught before they post',
    subtitle: 'PostPilot flags near-identical clips before they go live, so you never double-post.',
    frame: true,
    render: () => (
      <Shot src="/marketing/duplicate-warning.webp" alt="A queued post flagged as a duplicate" />
    ),
  },
  {
    title: 'Alerts your way',
    subtitle: 'Email, push, or SMS for the moments that matter — failed posts, an empty queue, and more.',
    frame: true,
    render: () => <Shot src="/marketing/alert-methods.webp" alt="Notification delivery preferences" />,
  },
  {
    title: 'Thumbnails picked for you',
    subtitle: 'AI surfaces the strongest frames and pre-selects the best one — swap it in a click.',
    frame: true,
    render: () => (
      <Shot src="/marketing/thumb-selector.webp" alt="AI thumbnail suggestions with the best frame selected" />
    ),
  },
  {
    title: 'Tuned to your voice',
    subtitle: 'Your profile — niche, tone, audience — steers the AI so captions sound like you.',
    frame: true,
    render: () => <Shot src="/marketing/profile-form.webp" alt="Voice profile form" />,
  },
];

export function FeatureHighlights() {
  // Which card sits at the gutter on first render (0-indexed → the 3rd card).
  const INITIAL_CARD = 2;

  const trackRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [active, setActive] = useState(INITIAL_CARD);

  // Align the initial card to the gutter on mount. Setting the track's own
  // scrollLeft (rather than scrollIntoView) avoids yanking the whole page.
  useEffect(() => {
    const track = trackRef.current;
    const first = cardRefs.current[0];
    const target = cardRefs.current[INITIAL_CARD];
    if (!track || !first || !target) return;
    track.scrollLeft = target.offsetLeft - first.offsetLeft;
  }, []);

  const scrollToCard = (i: number) => {
    cardRefs.current[i]?.scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    setActive(i);
  };

  // Highlight the dot for whichever card is closest to the left gutter.
  const handleScroll = () => {
    const track = trackRef.current;
    if (!track) return;
    const base = cardRefs.current[0]?.offsetLeft ?? 0;
    const sl = track.scrollLeft;
    let best = 0;
    let bestDist = Infinity;
    cardRefs.current.forEach((c, i) => {
      if (!c) return;
      const dist = Math.abs(c.offsetLeft - base - sl);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setActive(best);
  };

  return (
    <>
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-4xl">
          <h2 className="text-foreground text-2xl font-normal leading-[1.05] tracking-tight sm:text-4xl">
            And a few more things working for you
          </h2>
          <p className="text-muted-foreground mt-1 text-2xl font-normal leading-[1.05] tracking-tight sm:text-4xl">
            Small safeguards and finishing touches that keep every post clean, on-brand, and on time.
          </p>
        </div>
      </div>

      <div
        ref={trackRef}
        onScroll={handleScroll}
        className="mt-10 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-6 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ paddingLeft: GUTTER, paddingRight: GUTTER, scrollPaddingLeft: GUTTER }}
      >
        {CARDS.map((card, i) => (
          <div
            key={card.title}
            ref={(el) => {
              cardRefs.current[i] = el;
            }}
            className="w-[82vw] max-w-[23rem] shrink-0 snap-start sm:w-[23rem]"
          >
            <HiliteCard title={card.title} subtitle={card.subtitle} frame={card.frame}>
              {card.render()}
            </HiliteCard>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-8 flex max-w-7xl gap-2.5 px-6">
        {CARDS.map((card, i) => (
          <button
            key={card.title}
            type="button"
            onClick={() => scrollToCard(i)}
            aria-label={`Show “${card.title}”`}
            aria-current={active === i}
            className={`h-2.5 rounded-full transition-all ${
              active === i
                ? 'bg-foreground w-6'
                : 'bg-muted-foreground/30 hover:bg-muted-foreground/50 w-2.5'
            }`}
          />
        ))}
      </div>
    </>
  );
}
