import type { ReactNode } from 'react';

import { BatchUploadAnimation } from './BatchUploadAnimation';
import { EngineAnimation } from './EngineAnimation';
import { FootageScanAnimation } from './FootageScanAnimation';
import { SmartQueueAnimation } from './SmartQueueAnimation';
import { WritePostsAnimation } from './WritePostsAnimation';

/**
 * Marketing feature showcase — a bento grid of capability boxes, each pairing a
 * short two-tone heading with a looping (or still) product animation on a solid
 * surface. Layout: three smaller boxes on the top row, two larger boxes below.
 */

function MacWindow({ children }: { children: ReactNode }) {
  return (
    <div className="pp-window">
      <div className="pp-titlebar" aria-hidden>
        <span className="pp-dot" />
        <span className="pp-dot" />
        <span className="pp-dot" />
      </div>
      <div className="pp-winbody">{children}</div>
    </div>
  );
}

function FeatureBox({
  lead,
  tail,
  span,
  bleed = false,
  children,
}: {
  lead: string;
  tail: string;
  span: string;
  bleed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`pp-feature flex flex-col overflow-hidden rounded-2xl ${span}`}>
      <div className="p-6 pb-0">
        <h3 className="text-xl font-normal leading-snug tracking-tight">
          <span className="text-foreground">{lead}</span>{' '}
          <span className="text-muted-foreground">{tail}</span>
        </h3>
      </div>
      {bleed ? (
        <div className="mt-10 flex flex-1 flex-col justify-end pb-0">
          <div className="w-[106%] translate-x-6 translate-y-10">{children}</div>
        </div>
      ) : (
        <div className="pp-fullbleed mt-10 flex flex-1 flex-col justify-end">{children}</div>
      )}
    </div>
  );
}

export function FeatureShowcase() {
  return (
    <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-6">
      {/* Top row — three smaller boxes */}
      <FeatureBox
        span="lg:col-span-2"
        bleed
        lead="Batch uploads that just land —"
        tail="drop 100–500 clips at once, straight to the CDN, no server bottleneck."
      >
        <MacWindow>
          <BatchUploadAnimation />
        </MacWindow>
      </FeatureBox>

      <FeatureBox
        span="lg:col-span-2"
        lead="AI scans your footage in the background —"
        tail="every clip is transcribed and analyzed the moment it lands."
      >
        <FootageScanAnimation still />
      </FeatureBox>

      <FeatureBox
        span="lg:col-span-2"
        lead="Captions written for every platform —"
        tail="titles, hashtags, and copy tailored to each clip you post."
      >
        <WritePostsAnimation still />
      </FeatureBox>

      {/* Bottom row — two larger boxes */}
      <FeatureBox
        span="lg:col-span-3"
        bleed
        lead="A smart queue that spaces itself out —"
        tail="similar clips are spread apart and published on your recurring schedule."
      >
        <MacWindow>
          <SmartQueueAnimation still />
        </MacWindow>
      </FeatureBox>

      <FeatureBox
        span="lg:col-span-3"
        lead="An engine that never sleeps —"
        tail="publishing, retries, and token refresh all keep running 24/7."
      >
        <EngineAnimation />
      </FeatureBox>
    </div>
  );
}
