/**
 * Feature-box animation #3 — AI writes platform-specific posts.
 *
 * Looping scene: platform tabs (TikTok / Reels / Shorts) cycle as the AI
 * "types" a title, caption lines, and hashtag chips (represented as animated
 * bars with a caret, not literal text). It then cross-fades to a row of AI
 * thumbnail suggestions where one is selected with a ring + check. Pure CSS +
 * inline SVG; all styles live in globals.css under the `.fw-*` classes and
 * reference the app design tokens. No client JS: safe as a server component.
 */

export function WritePostsAnimation({ still = false }: { still?: boolean }) {
  return (
    <div
      className={`fw-stage${still ? ' is-still' : ''}`}
      role="img"
      aria-label="PostPilot AI writing a platform-specific caption, then selecting a thumbnail from suggestions"
    >
      <div className="fb-bar">
        <span className="fb-brand">
          <svg className="fw-spark" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 1.5 9.4 5.8 13.7 7.2 9.4 8.6 8 12.9 6.6 8.6 2.3 7.2 6.6 5.8 Z" />
          </svg>
          Captions
        </span>
        <span className="fb-brand fs-muted">per platform</span>
      </div>

      <div className="fb-body">
        {/* Scene 1 — AI writes the copy */}
        <div className="fw-scene fw-scene1">
          <div className="fw-tabs">
            <span className="fw-tab fw-tab1">TikTok</span>
            <span className="fw-tab fw-tab2">Reels</span>
            <span className="fw-tab fw-tab3">Shorts</span>
          </div>

          <div className="fw-line fw-l-title">
            <span className="fw-fill fw-f-title" />
          </div>
          <div className="fw-line">
            <span className="fw-fill fw-f-c1" />
          </div>
          <div className="fw-line">
            <span className="fw-fill fw-f-c2" />
          </div>
          <div className="fw-line">
            <span className="fw-fill fw-f-c3" />
          </div>

          <div className="fw-chips">
            <span className="fw-chip fw-ch1" />
            <span className="fw-chip fw-ch2" />
            <span className="fw-chip fw-ch3" />
          </div>
          <div className="fw-chips fw-chips2">
            <span className="fw-chip fw-ch4" />
            <span className="fw-chip fw-ch5" />
            <span className="fw-chip fw-ch6" />
          </div>
        </div>

        {/* Scene 2 — pick a thumbnail */}
        <div className="fw-scene fw-scene2" aria-hidden>
          <div className="fw-schead">AI thumbnail suggestions</div>
          <div className="fw-thumbs">
            <span className="fw-thumb fw-t-a">
              <span className="fw-tower" />
            </span>
            <span className="fw-thumb fw-t-b">
              <span className="fw-tower" />
            </span>
            <span className="fw-thumb fw-t-c">
              <span className="fw-tower" />
              <span className="fw-ring" />
              <span className="fw-check">
                <svg viewBox="0 0 14 14" fill="none" aria-hidden>
                  <path d="M3 7.3 5.7 10 11 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </span>
            <span className="fw-thumb fw-t-d">
              <span className="fw-tower" />
            </span>
            <span className="fw-thumb fw-t-e">
              <span className="fw-tower" />
            </span>

            <svg className="fw-cursor" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 2 L4 20 L9 15 L12 22 L15 21 L12 14 L19 14 Z" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="1.2" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
