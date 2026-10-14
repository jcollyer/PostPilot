import { connectionLabel, fmtDate, fmtDateTime, PLATFORM_LABEL } from '../lib/dashboard-format';
import type { RouterOutputs } from '../lib/trpc';

/**
 * Home screen model: everything the glanceable monitor shows, derived from
 * `dashboard.overview` plus `now`. The screen only maps this to components.
 *
 * Verdict precedence (worst wins): Needs attention > Paused > Running low >
 * Running. Outranked queue problems still surface as cards so nothing hides
 * behind a milder verdict.
 */

export type HomeOverview = RouterOutputs['dashboard']['overview'];

export type HomeTone = 'critical' | 'warn' | 'ok';
export type HomeTarget = 'queue' | 'settings';

export interface HomeVerdict {
  state: 'needs-attention' | 'paused' | 'running-low' | 'running';
  tone: HomeTone;
  label: string;
  detail: string;
  /** `label · detail`, for the single verdict line. */
  copy: string;
}

export interface HomeProblemCard {
  kind: 'connection' | 'queue-paused' | 'running-low';
  key: string;
  tone: Exclude<HomeTone, 'ok'>;
  title: string;
  detail: string;
  target: HomeTarget;
}

export interface HomeNextPost {
  title: string;
  platform: string;
  when: string;
  thumbnailUrl: string | null;
  target: 'queue';
}

export interface HomeModel {
  verdict: HomeVerdict;
  problems: HomeProblemCard[];
  nextPost: HomeNextPost | null;
}

export function buildHomeModel(overview: HomeOverview, now: Date): HomeModel {
  const { health } = overview;

  // Tone comes from `connectionLabel`, so a connection status is never toned
  // differently here than anywhere else in the app.
  const troubled = overview.connections.flatMap((c) => {
    const { tone } = connectionLabel(c.configured, c.connection?.status);
    return tone === 'critical' || tone === 'warn'
      ? [{ platform: c.platform, name: platformName(c.platform), tone }]
      : [];
  });
  const reconnect = troubled.filter((c) => c.tone === 'critical');
  const paused = overview.queueStatus === 'PAUSED';
  const low = runningLow(health, now);

  const verdict: HomeVerdict =
    reconnect.length > 0
      ? makeVerdict(
          'needs-attention',
          'critical',
          'Needs attention',
          `${joinNames(reconnect.map((c) => c.name))} ${
            reconnect.length === 1 ? 'needs' : 'need'
          } reconnecting`,
        )
      : paused
        ? makeVerdict('paused', 'warn', 'Paused', 'nothing will post until you resume')
        : low
          ? makeVerdict('running-low', 'warn', 'Running low', low.verdict)
          : makeVerdict(
              'running',
              'ok',
              'Running',
              `posting through ${fmtDate(health.estimatedEmptyDate)} (~${days(health.daysRemaining)} of content)`,
            );

  const problems: HomeProblemCard[] = troubled.map(({ platform, name, tone }) => ({
    kind: 'connection',
    key: `connection-${platform}`,
    tone,
    ...(tone === 'critical'
      ? {
          title: `${name} needs reconnecting`,
          detail: `Posts to ${name} are on hold until you reconnect on the web.`,
        }
      : {
          title: `${name} is paused`,
          detail: `Nothing will post to ${name} while it is paused.`,
        }),
    target: 'settings',
  }));

  if (paused && verdict.state !== 'paused') {
    problems.push({
      kind: 'queue-paused',
      key: 'queue-paused',
      tone: 'warn',
      title: 'Queue is paused',
      detail: 'Nothing will post until you resume.',
      target: 'queue',
    });
  }

  if (low && verdict.state !== 'running-low') {
    problems.push({
      kind: 'running-low',
      key: 'running-low',
      tone: 'warn',
      title: 'Running low',
      detail: low.card,
      target: 'queue',
    });
  }

  const next = overview.nextPost;
  const nextPost: HomeNextPost | null = next
    ? {
        title: next.title ?? 'Untitled',
        platform: platformName(next.platform),
        when: fmtDateTime(next.scheduledAt),
        thumbnailUrl: next.thumbnailUrl,
        target: 'queue',
      }
    : null;

  return { verdict, problems, nextPost };
}

/**
 * Why the queue is running low, worded for the verdict line and for a card,
 * or null when it isn't. The upload-by date has already passed whenever this
 * fires, so the date shown is the day the queue runs dry.
 */
function runningLow(
  health: HomeOverview['health'],
  now: Date,
): { verdict: string; card: string } | null {
  if (health.remaining === 0) {
    return {
      verdict: 'queue is empty, upload more to keep posting',
      card: 'Queue is empty. Upload more to keep posting.',
    };
  }
  if (health.postsPerDay <= 0) {
    return {
      verdict: 'no posting schedule, add one on the web',
      card: 'No posting schedule. Add one on the web.',
    };
  }
  const uploadBy = health.recommendedUploadBy;
  if (uploadBy != null && now.getTime() >= new Date(uploadBy).getTime()) {
    const by = fmtDate(health.estimatedEmptyDate);
    return { verdict: `upload more by ${by}`, card: `Upload more by ${by}.` };
  }
  return null;
}

function makeVerdict(
  state: HomeVerdict['state'],
  tone: HomeTone,
  label: string,
  detail: string,
): HomeVerdict {
  return { state, tone, label, detail, copy: `${label} · ${detail}` };
}

function platformName(platform: string): string {
  return PLATFORM_LABEL[platform] ?? platform;
}

function days(n: number | null): string {
  const rounded = Math.round(n ?? 0);
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
