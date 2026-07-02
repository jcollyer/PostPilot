/**
 * Animated product demo for the marketing hero — Act 1 (Upload).
 *
 * Replaces the static product screenshot with a looping scene: clips drop into
 * the library, upload rings fill, the front clip gains focus handles, and an
 * "uploaded" toast pops. Pure CSS + inline SVG — all styles live in globals.css
 * under the `.pp-*` classes and reference the app's design tokens, so it themes
 * to light/dark automatically. Respects prefers-reduced-motion (resting scene).
 *
 * No client JS: this is a static render, safe as a server component.
 */

function FolderIcon() {
  return (
    <svg className="fico" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M2 4.6c0-.7.5-1.2 1.2-1.2h3L7.7 4.6h5.1c.7 0 1.2.5 1.2 1.2v6c0 .7-.5 1.2-1.2 1.2H3.2c-.7 0-1.2-.5-1.2-1.2V4.6z"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function Chevron({ open, hidden }: { open?: boolean; hidden?: boolean }) {
  return (
    <svg
      className={`chev${open ? ' down' : ''}${hidden ? ' spacer' : ''}`}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClipCard({ variant, name }: { variant: 'a' | 'b' | 'c'; name: string }) {
  return (
    <div className={`pp-card ${variant}`}>
      <div className="thumb">
        <svg viewBox="0 0 34 34" fill="currentColor" aria-hidden>
          <path d="M12 9 L26 17 L12 25 Z" />
        </svg>
      </div>
      <div className="fname">{name}</div>
      <svg className="pp-ring" viewBox="0 0 30 30" fill="none" aria-hidden>
        <circle className="track" cx="15" cy="15" r="13" strokeWidth="3" />
        <circle className="fill" cx="15" cy="15" r="13" strokeWidth="3" />
      </svg>
    </div>
  );
}

export function HeroAnimation() {
  return (
    <div
      className="pp-stage"
      role="img"
      aria-label="PostPilot preparing uploaded video clips to schedule automatically"
    >
      {/* top bar */}
      <div className="pp-topbar">
        <span className="pp-brandmark" aria-hidden />
        <span className="pp-brandname">PostPilot</span>
        <span className="pp-crumb">/ Library</span>
        <span className="pp-uploadbtn">
          <svg className="plus" viewBox="0 0 16 16" fill="none" aria-hidden>
            <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Upload
        </span>
      </div>

      {/* left folder tree (decorative) */}
      <div className="pp-side" aria-hidden>
        <div className="pp-foldershead">
          <b>FOLDERS</b>
          <svg className="add" viewBox="0 0 16 16" fill="none">
            <path
              d="M2 5.2c0-.6.5-1 1-1h2.3l1 1H13c.6 0 1 .5 1 1V12c0 .6-.4 1-1 1H3c-.5 0-1-.4-1-1V5.2z"
              stroke="currentColor"
              strokeWidth="1.2"
            />
            <path
              d="M8 7.4v3.1M6.5 8.9h3"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="pp-tree">
          <div className="pp-row l0">
            <Chevron open />
            <FolderIcon />
            <span className="lbl" style={{ width: '4.5cqw' }} />
          </div>
          <div className="pp-row l1">
            <Chevron hidden />
            <FolderIcon />
            <span className="lbl" style={{ width: '2.6cqw' }} />
          </div>
          <div className="pp-row l1">
            <Chevron open />
            <FolderIcon />
            <span className="lbl" style={{ width: '2.6cqw' }} />
          </div>
          <div className="pp-row l2">
            <Chevron open />
            <FolderIcon />
            <span className="lbl" style={{ width: '4cqw' }} />
          </div>
          <div className="pp-row l3">
            <Chevron hidden />
            <FolderIcon />
            <span className="lbl" style={{ width: '5cqw' }} />
          </div>
          <div className="pp-row l3 active">
            <Chevron hidden />
            <FolderIcon />
            <span className="lbl" style={{ width: '4.6cqw' }} />
          </div>
          <div className="pp-row l1">
            <Chevron />
            <FolderIcon />
            <span className="lbl" style={{ width: '2.6cqw' }} />
          </div>
        </div>
      </div>

      {/* content */}
      <div className="pp-content">
        <div className="pp-dots" aria-hidden />
        <div className="pp-title">
          Media Library
          <small>Auto-preparing captions &amp; thumbnails…</small>
        </div>

        <ClipCard variant="c" name="clip_045.mp4" />
        <ClipCard variant="b" name="clip_046.mp4" />
        <ClipCard variant="a" name="clip_047.mp4" />

        <div className="pp-handles" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>

        <div className="pp-toast">
          <span className="chk">
            <svg viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M3 7.5 L6 10.5 L11.5 4"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          3 clips uploaded
        </div>
      </div>
    </div>
  );
}
