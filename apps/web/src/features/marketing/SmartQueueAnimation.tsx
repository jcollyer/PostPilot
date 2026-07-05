/**
 * Feature-box animation #4 — Smart queue and scheduling.
 *
 * Looping scene: a queue of clips sits in its original order; a cursor clicks
 * the "Smart arrange" button (which presses and spins its shuffle icon) and the
 * items animate into a new, spaced-out "smart" order, hold, then reset. Item
 * thumbnails are tinted differently so the reorder is easy to follow. Pure CSS
 * + inline SVG; all styles live in globals.css under the `.sq-*` classes and
 * reference the app design tokens. No client JS: safe as a server component.
 */

const HANDLE_DOTS = [0, 1, 2, 3, 4, 5];

function QueueItem({ variant }: { variant: string }) {
  return (
    <div className={`sq-item ${variant}`}>
      <span className="sq-handle" aria-hidden>
        {HANDLE_DOTS.map((d) => (
          <i key={d} />
        ))}
      </span>
      <span className="sq-thumb">
        <svg viewBox="0 0 16 16" fill="none" aria-hidden>
          <circle cx="5.5" cy="6" r="1.2" fill="currentColor" />
          <path d="M2.4 11.6 6.2 8l2.3 2.2 2.2-2 2.5 2.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="sq-lines">
        <span className="sq-l1" />
        <span className="sq-l2" />
      </span>
    </div>
  );
}

export function SmartQueueAnimation({ still = false }: { still?: boolean }) {
  return (
    <div
      className={`sq-stage${still ? ' is-still' : ''}`}
      role="img"
      aria-label="Clicking Smart arrange to reorder the PostPilot queue into a spaced-out order"
    >
      <div className="fb-bar">
        <span className="fb-brand">Queue</span>
        <span className="fb-brand fs-muted">18 in rotation</span>
      </div>

      <div className="fb-body">
        <div className="sq-scene">
          <div className="sq-head">
            <span className="sq-btn">
              <svg className="sq-shuffle" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M2 4h2.5c1 0 1.7.5 2.3 1.4l2.4 5.2c.6.9 1.3 1.4 2.3 1.4H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12h2.5c1 0 1.7-.5 2.3-1.4M11.5 4H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 2.5 14 4l-2 1.5M12 10.5 14 12l-2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Smart arrange
            </span>
          </div>

          <div className="sq-list">
            <QueueItem variant="sq-a" />
            <QueueItem variant="sq-b" />
            <QueueItem variant="sq-c" />
            <QueueItem variant="sq-d" />
            <QueueItem variant="sq-e" />
          </div>

          <svg className="sq-cursor" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 2 L4 20 L9 15 L12 22 L15 21 L12 14 L19 14 Z" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="1.2" />
          </svg>
        </div>
      </div>
    </div>
  );
}
