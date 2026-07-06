/**
 * Marketing "Live in three steps" section — full-bleed, tall, dark panel with
 * three numbered columns. The columns are separated by two slanted neon divider
 * lines, each with a right-pointing arrow fused into its center so the line and
 * arrow read as one continuous neon tube. Everything glows via layered
 * drop-shadows in the brand lime. See globals.css (`.pp-neon-*`) for the glow.
 */

const STEPS = [
  {
    step: '1',
    title: 'Connect your accounts',
    body: 'Link TikTok, Reels, and Shorts in a couple of clicks.',
  },
  {
    step: '2',
    title: 'Upload your backlog',
    body: 'Add videos once; AI preps the captions and thumbnails.',
  },
  {
    step: '3',
    title: 'Walk away',
    body: 'PostPilot publishes on schedule and keeps you consistent.',
  },
];

/** A single slanted neon divider (line + centered arrow) positioned at `left`. */
function NeonDivider({ left }: { left: string }) {
  const glowId = `pp-arrow-inner-glow-${left.replace(/\W/g, '')}`;
  return (
    <div
      className="pointer-events-none absolute inset-y-0 hidden w-40 -translate-x-1/2 sm:block"
      style={{ left }}
      aria-hidden
    >
      {/* Slanted full-height line. The line is centered on the column boundary at
          mid-height, so the arrow (also centered) sits exactly on it. */}
      <svg
        className="pp-neon-line absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <line
          x1="62"
          y1="0"
          x2="38"
          y2="100"
          vectorEffect="non-scaling-stroke"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>

      {/* Right-pointing arrow fused into the center of the line. Its fill matches
          the panel background so the line appears to flow into the outline. */}
      <svg
        className="pp-neon-arrow absolute left-1/2 top-1/2 h-[3.75rem] w-24 -translate-x-1/2 -translate-y-1/2 lg:h-24 lg:w-36"
        viewBox="0 0 96 64"
        fill="none"
      >
        <defs>
          {/* Inner glow — floods the shape, keeps only the part that falls just
              inside the outline, so the neon appears to bleed inward like a lit
              gas tube. */}
          <filter id={glowId} x="-30%" y="-30%" width="160%" height="160%">
            <feFlood floodColor="#f4ff8f" floodOpacity="1" result="flood" />
            <feComposite in="flood" in2="SourceAlpha" operator="out" result="outside" />
            <feGaussianBlur in="outside" stdDeviation="2.5" result="blur" />
            <feComposite in="blur" in2="SourceAlpha" operator="in" result="innerGlow" />
          </filter>
        </defs>

        {/* Black tube body with the neon outline. */}
        <path
          d="M 9 26 L 55 26 Q 58 26 58 23 L 58 15 Q 58 12 60.54 13.59 L 87.45 30.41 Q 90 32 87.45 33.59 L 60.54 50.41 Q 58 52 58 49 L 58 41 Q 58 38 55 38 L 9 38 Q 6 38 6 35 L 6 29 Q 6 26 9 26 Z"
          fill="hsl(var(--pp-panel))"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Inner glow overlay hugging the inside of the outline. */}
        <path
          d="M 9 26 L 55 26 Q 58 26 58 23 L 58 15 Q 58 12 60.54 13.59 L 87.45 30.41 Q 90 32 87.45 33.59 L 60.54 50.41 Q 58 52 58 49 L 58 41 Q 58 38 55 38 L 9 38 Q 6 38 6 35 L 6 29 Q 6 26 9 26 Z"
          fill="#000"
          filter={`url(#${glowId})`}
        />
      </svg>
    </div>
  );
}

export function ThreeSteps() {
  return (
    <section className="pp-steps relative overflow-hidden pb-[5.25rem] sm:pb-[7.5rem]">
      {/* soft ambient glow behind everything */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -z-0 h-72 w-[48rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-3xl"
        aria-hidden
      />

      <div className="mx-auto max-w-3xl px-6 pt-16 text-center sm:pt-20">
        <h2 className="pp-neon-text text-3xl font-semibold tracking-tight sm:text-5xl">
          Live in three steps
        </h2>
        <p className="mt-3 text-lg text-white/60">
          From zero to a self-running content queue in minutes.
        </p>
      </div>

      <div className="relative">
        <NeonDivider left="33.333%" />
        <NeonDivider left="66.666%" />

        <div className="grid grid-cols-1 sm:grid-cols-3">
          {STEPS.map((s) => (
            <div
              key={s.step}
              className="flex flex-col items-center justify-center px-8 py-24 text-center sm:min-h-[26rem] sm:py-32"
            >
              <div className="pp-neon-num flex size-14 items-center justify-center rounded-full border-2 text-xl font-bold">
                {s.step}
              </div>
              <h3 className="mt-6 text-2xl font-semibold text-white">{s.title}</h3>
              <p className="mt-3 max-w-xs text-base text-white/60">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
