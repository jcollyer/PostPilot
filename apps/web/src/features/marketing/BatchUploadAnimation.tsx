/**
 * Feature-box animation #1 — Batch uploads.
 *
 * Looping scene: a fanned stack of clips (badged "101") drags into the drop
 * zone, then cross-fades to per-file upload progress bars filling at different
 * speeds with spinners flipping to green checks. Pure CSS + inline SVG — all
 * styles live in globals.css under the `.fb-*` classes and reference the app's
 * design tokens, so it themes to light/dark automatically and respects
 * prefers-reduced-motion. No client JS: safe as a server component.
 */

function MovieIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="3.5" width="12" height="9" rx="1.4" stroke="currentColor" strokeWidth="1.2" />
      <path d="M2 6.2h12M2 9.8h12M5.2 3.5v9M10.8 3.5v9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function EmptyPill({ cls }: { cls: string }) {
  return <div className={`fb-pill fb-pe ${cls}`} />;
}

export function BatchUploadAnimation() {
  return (
    <div
      className="fb-stage"
      role="img"
      aria-label="Dropping 101 video clips into PostPilot, then bulk uploading them with progress bars"
    >
      {/* faux app chrome */}
      <div className="fb-bar">
        <span className="fb-brand">Media library</span>
        <span className="fb-upbtn">
          <svg viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 12V4M4.5 7.5 8 4l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Upload videos
        </span>
      </div>

      <div className="fb-body">
        {/* Scene 1 — drag the stack into the drop zone */}
        <div className="fb-scene fb-scene1">
          <div className="fb-dz">
            <svg className="fb-dzicon" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 16V6M7.5 10.5 12 6l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 17.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <div className="fb-dztitle">Drop to upload</div>
            <div className="fb-dzsub">MP4, MOV, or WebM · up to 10 GB each</div>
          </div>

          <div className="fb-drag">
            <svg className="fb-cursor" viewBox="0 0 24 24" aria-hidden>
              <path d="M4 2 L4 20 L9 15 L12 22 L15 21 L12 14 L19 14 Z" fill="hsl(var(--foreground))" stroke="hsl(var(--card))" strokeWidth="1.2" />
            </svg>
            <span className="fb-badge">101</span>
            <EmptyPill cls="fb-p10" />
            <EmptyPill cls="fb-p9" />
            <EmptyPill cls="fb-p8" />
            <EmptyPill cls="fb-p7" />
            <EmptyPill cls="fb-p6" />
            <EmptyPill cls="fb-p5" />
            <div className="fb-pill fb-p4">clip_118.mp4</div>
            <div className="fb-pill fb-p3">clip_089.mp4</div>
            <div className="fb-pill fb-p2">clip_072.mp4</div>
            <div className="fb-pill fb-p1">
              <MovieIcon className="fb-pillico" />
              clip_101.mp4
            </div>
          </div>
        </div>

        {/* Scene 2 — bulk upload progress */}
        <div className="fb-scene fb-scene2" aria-hidden>
          <div className="fb-schead">
            <span className="fb-schtitle">Uploading 101 clips</span>
            <span className="fb-schnote">direct to CDN</span>
          </div>
          <div className="fb-over">
            <span className="fb-overfill" />
          </div>

          <div className="fb-row">
            <MovieIcon className="fb-rico" />
            <span className="fb-fn">clip_034.mp4</span>
            <span className="fb-sz">318 MB</span>
            <svg className="fb-sp fb-sp-a" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <svg className="fb-ck fb-ck-a" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3.5 8.2 6.5 11 12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="fb-track">
              <span className="fb-fill fb-fill-a" />
            </span>
          </div>

          <div className="fb-row">
            <MovieIcon className="fb-rico" />
            <span className="fb-fn">clip_072.mp4</span>
            <span className="fb-sz">204 MB</span>
            <svg className="fb-sp fb-sp-b" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <svg className="fb-ck fb-ck-b" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3.5 8.2 6.5 11 12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="fb-track">
              <span className="fb-fill fb-fill-b" />
            </span>
          </div>

          <div className="fb-row">
            <MovieIcon className="fb-rico" />
            <span className="fb-fn">clip_101.mp4</span>
            <span className="fb-sz">450 MB</span>
            <svg className="fb-sp fb-sp-c" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M8 2a6 6 0 1 0 6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <svg className="fb-ck fb-ck-c" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3.5 8.2 6.5 11 12.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="fb-track">
              <span className="fb-fill fb-fill-c" />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
