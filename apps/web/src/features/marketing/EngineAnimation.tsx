/**
 * Feature-box animation #5 — An engine that never sleeps.
 *
 * Looping scene: a heartbeat monitor pulses continuously while a background job
 * feed works through publishing, a token refresh, and a retry-then-posted — each
 * flipping from a spinner to a done chip in sequence. The last event is the one
 * that actually needs a human ("Needs you"), which pings the header bell. Pure
 * CSS + inline SVG; all styles live in globals.css under the `.fe-*` classes and
 * reference the app design tokens. No client JS: safe as a server component.
 */

function Spinner({ cls }: { cls: string }) {
  return (
    <svg className={`fe-sp ${cls}`} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 7.3 5.7 10 11 4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function EngineAnimation() {
  return (
    <div
      className="fe-stage"
      role="img"
      aria-label="PostPilot's always-on engine publishing on schedule, refreshing tokens, retrying, and pinging only when needed"
    >
      <div className="fb-bar">
        <span className="fb-brand">
          <span className="fs-livedot" />
          Engine
          <span className="fs-muted">always on</span>
        </span>
        <span className="fe-bellwrap">
          <svg className="fe-bell" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M4 7a4 4 0 0 1 8 0c0 2.5.8 3.5 1.3 4H2.7C3.2 10.5 4 9.5 4 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M6.5 13a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <span className="fe-badge">1</span>
        </span>
      </div>

      <div className="fb-body">
        <div className="fe-scene">
          <div className="fe-beat">
            <span className="fe-baseline" />
            <svg className="fe-ekg" viewBox="0 0 40 20" fill="none" aria-hidden>
              <polyline
                points="0,10 9,10 12,10 14,4 16,16 18,10 21,10 40,10"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="fe-beatlabel">worker · healthy</span>
          </div>

          <div className="fe-feed">
            <div className="fe-row">
              <span className="fe-ico">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 11V4M5 6.5 8 3.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3.5 11.5v.8a.7.7 0 0 0 .7.7h7.6a.7.7 0 0 0 .7-.7v-.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
              <span className="fe-line fe-ln1" />
              <span className="fe-status">
                <Spinner cls="fe-sp1" />
                <span className="fe-done fe-done-ok fe-d1">
                  <Check />
                  Posted
                </span>
              </span>
            </div>

            <div className="fe-row">
              <span className="fe-ico">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M12.5 6.5A5 5 0 0 0 3.6 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M3.5 9.5A5 5 0 0 0 12.4 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M12.7 3v3.3H9.4M3.3 13V9.7h3.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="fe-line fe-ln2" />
              <span className="fe-status">
                <Spinner cls="fe-sp2" />
                <span className="fe-done fe-done-info fe-d2">
                  <Check />
                  Refreshed
                </span>
              </span>
            </div>

            <div className="fe-row">
              <span className="fe-ico">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M11.5 5.5A4.5 4.5 0 1 0 12 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  <path d="M11.8 2.6V5.6H8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <span className="fe-line fe-ln3" />
              <span className="fe-status">
                <Spinner cls="fe-sp3" />
                <span className="fe-done fe-done-ok fe-d3">
                  <Check />
                  Retried
                </span>
              </span>
            </div>

            <div className="fe-row">
              <span className="fe-ico fe-ico-warn">
                <svg viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path d="M8 2.8 14 13H2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                  <path d="M8 6.5v3M8 11.2v.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </span>
              <span className="fe-line fe-ln4" />
              <span className="fe-status">
                <Spinner cls="fe-sp4" />
                <span className="fe-done fe-done-warn fe-d4">Needs you</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
