/**
 * Feature-box animation #2 — AI scans uploaded footage in the background.
 *
 * Looping scene: a list of freshly uploaded clips is swept by a scan line, each
 * row flipping from "queued" to "analyzed", then it cross-fades into a close-up
 * of a single clip — a scan bar crosses the frame while sampled screenshots pop
 * into a filmstrip and detected metadata chips appear. Pure CSS + inline SVG;
 * all styles live in globals.css under the `.fs-*` classes and reference the
 * app's design tokens. No client JS: safe as a server component.
 */

import type { CSSProperties } from 'react';

function PlayThumb({ className }: { className?: string }) {
  return (
    <span className={`fs-thumb ${className ?? ''}`}>
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M6 4.5 11.5 8 6 11.5 Z" />
      </svg>
    </span>
  );
}

function ScanRow({ name, delay }: { name: string; delay: string }) {
  return (
    <div className="fs-item" style={{ '--d': delay } as CSSProperties}>
      <PlayThumb />
      <span className="fs-name">{name}</span>
      <span className="fs-status">
        <span className="fs-st-scan">Scanning…</span>
        <span className="fs-st-done">
          <svg viewBox="0 0 14 14" fill="none" aria-hidden>
            <path d="M3 7.3 5.7 10 11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Analyzed
        </span>
      </span>
    </div>
  );
}

export function FootageScanAnimation({ still = false }: { still?: boolean }) {
  return (
    <div
      className={`fs-stage${still ? ' is-still' : ''}`}
      role="img"
      aria-label="PostPilot scanning uploaded clips in the background, then analyzing sampled frames from one clip"
    >
      <div className="fb-bar">
        <span className="fb-brand">
          <span className="fs-livedot" />
          AI analysis
        </span>
        <span className="fb-brand fs-muted">background</span>
      </div>

      <div className="fb-body">
        {/* Scene 1 — the whole list gets scanned */}
        <div className="fs-scene fs-scene1">
          <div className="fs-list">
            <ScanRow name="clip_034.mp4" delay="0s" />
            <ScanRow name="clip_072.mp4" delay="0.5s" />
            <ScanRow name="clip_101.mp4" delay="1s" />
            <ScanRow name="clip_118.mp4" delay="1.5s" />
          </div>
          <span className="fs-sweepline" />
        </div>

        {/* Scene 2 — close-up analysis of one clip */}
        <div className="fs-scene fs-scene2" aria-hidden>
          <div className="fs-frame">
            <PlayThumb className="fs-frameplay" />
            <span className="fs-framesweep" />
            <span className="fs-framelabel">Analyzing frames…</span>
          </div>

          <div className="fs-strip">
            <span className="fs-cand fs-c1" />
            <span className="fs-cand fs-c2" />
            <span className="fs-cand fs-c3 fs-best">
              <svg viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M7 1.5 8.7 5l3.8.5-2.8 2.6.7 3.8L7 10.1 3.6 12l.7-3.8L1.5 5.5 5.3 5 Z" fill="currentColor" />
              </svg>
            </span>
            <span className="fs-cand fs-c4" />
            <span className="fs-cand fs-c5" />
          </div>

          <div className="fs-tags">
            <span className="fs-tag fs-t1">transcript</span>
            <span className="fs-tag fs-t2">scene tags</span>
            <span className="fs-tag fs-t3">best frame</span>
          </div>
        </div>
      </div>
    </div>
  );
}
