# Product

<!-- impeccable:product-schema 1 -->

## Platform

ios

Shared record for the whole monorepo. The bare value above names the surface Impeccable is
currently designing — `apps/mobile`, an Expo app that ships to iOS and Android from one
codebase, with **iOS as the platform that is actually tested and shipped**; Android rides
along on the same design language. `apps/web` is a `web` surface (Next.js App Router) and is
the primary product surface. When design work moves to `apps/web`, read it as `web`.

## Users

**Primary:** solo short-form video creators who produce in batches — YouTube Shorts, TikTok,
and Instagram Reels creators, faceless channels, drone creators, travel creators.

Their situation: they spend an afternoon making dozens of videos, then face weeks of manual
uploading and scheduling. The job they are hiring the product for is literally *"I have 150
videos. Can someone please keep posting them while I keep creating?"*

**Secondary:** real estate agents, small businesses, local service businesses, solo
entrepreneurs.

**Explicitly not the audience:** enterprise marketing teams and agencies. Their workflows
(approvals, collaboration, reporting, CRM) are out of scope by design, not by omission.

## Product Purpose

PostPilot is an AI-powered content queue that turns a backlog of 100–500 videos into a
hands-off publishing pipeline. The creator uploads once, the AI does the organizing busywork,
the creator skims and approves, and background workers keep publishing for weeks.

Success is defined by absence: the creator clicks **Start Queue**, walks away, and returns
weeks later to find content published consistently across TikTok, Instagram Reels, and
YouTube Shorts — having been contacted only if something genuinely required a human.

The product should feel like hiring a quiet, reliable employee: it runs the operation on its
own, and taps the creator on the shoulder only when it hits something it cannot resolve.

## Positioning

Never describe PostPilot as a "social media management platform," a marketing platform, or a
social media manager. Sanctioned framings: *Your Content Queue*, *Your Publishing Pipeline*,
*Your Posting Machine*, *Your AI Content Manager*.

The mechanism a neighboring product could not truthfully copy is the **AI Queue Builder**
combined with the **always-on engine**:

- Every uploaded video is transcribed (Whisper), read by a vision model over sampled frames,
  and given a title, caption, hashtags, category, and an AI-chosen thumbnail frame — with
  captions tailored per platform rather than duplicated.
- Metadata is grounded in *this specific creator's* voice: an explicit profile (niche, tone,
  audience, banned words, emoji preference) outranks everything, then their real past captions
  and bio pulled from connected accounts, then vector search over their own library, with their
  folder-tree naming used as a topical hint.
- One set of pgvector embeddings powers both near-duplicate detection (with perceptual dHash)
  and smart ordering that spaces similar videos apart.
- PostPilot owns the schedule. None of the three platforms offer reliable native scheduling and
  TikTok offers none at all, so the engine computes what is due and publishes it.

Competing tools make users manage calendars. PostPilot manages content. Creators think "I have
90 videos ready," not "I need to schedule Tuesday."

## Operating Context

- **Batch-then-walk-away.** Work arrives in large upload sessions (100–500 videos), then the
  creator is absent for weeks. The steady state of this product is nobody looking at it.
- **Creators' own folder trees carry meaning.** Paths like
  `2020 / June / New York / Empire State Building / night` encode who/what/where/when and are
  fed to the model as topical grounding (junk segments like "Final", "Exports", "Misc" stripped).
- **Two surfaces with different jobs.** `apps/web` is the full management surface: library,
  queue, drag-to-reorder, schedule, connections, settings. `apps/mobile` is the glanceable
  companion — check queue health, receive push when something breaks, and reconnect a dead
  platform connection from the phone. Queue and library management stay on web.
- **Mobile is opened in two moments:** an idle check-in ("is it still running?") and a
  notification-driven repair ("TikTok needs reconnecting"). Design for both, not for dwell time.
- **Platform review is the critical path, not code.** TikTok restricts unaudited apps to private
  posts, Instagram requires a Business/Creator account plus Meta App Review, YouTube requires a
  verified project. Default post visibility is private/self-only so the product can be tested
  within those limits.
- **Two systems, one codebase.** The interactive app, and an always-on engine (AI pipeline,
  scheduler, publishing and notification workers) running on Trigger.dev regardless of who is
  logged in. Heavy work never runs in a request handler.

## Capabilities and Constraints

**Scope, fixed:** TikTok, Instagram Reels, and YouTube Shorts only. Never Facebook, LinkedIn,
Pinterest, or X. No analytics, social inbox, comments, team collaboration, approval workflows,
agency features, AI chatbots, AI image generation, social listening, CRM, or marketing
automation. The dashboard shows queue remaining, days of content remaining, next scheduled post,
last published, and connection health — no charts, no engagement graphs.

**Auth:** Better Auth — email/password with Resend verification, Google ready but not enabled.
Token sessions work across web and mobile via the Expo plugin; the mobile app stores them in
`expo-secure-store`.

**Reliability contract, and it is a product promise, not an implementation detail:**

- Handled without a human: proactive OAuth token refresh ahead of expiry (TikTok's rotating
  refresh tokens persisted on every rotation), exponential-backoff retries on transient publish
  failures, polling through platform processing delays.
- Escalated to a human: an unrecoverable connection (revoked access, password change, app
  removed, re-auth required), content rejected by a platform, anything else the system cannot fix.
- **Per-platform graceful degradation.** An unrecoverable failure pauses only the affected
  platform and **holds** the impacted videos — never silently consuming or skipping them —
  surfaces a "Reconnect [Platform]" call to action, and notifies. Other platforms keep publishing.
- **Alerts are deduplicated and throttled.** One "reconnect TikTok," never one per failed video.
  The same alerting surface powers queue-health states ("running low," "empty in 3 days").

**Notification channels:** Resend email (default), Expo push (app users), Twilio SMS (reserved
for genuinely urgent "your queue is stalled until you act" alerts, given cost and US 10DLC
registration overhead).

**Platform limits to design around:** TikTok ~6 requests/minute per user token and ~15 posts/day
per creator; Instagram Reels capped near 90 seconds via API, roughly 25–100 posts per 24h per
account, requires a Business/Creator account linked to a Facebook Page, and video must be served
from a publicly accessible URL; YouTube ~100 uploads/day at the default 10,000-unit quota. Even
via official APIs, botlike pacing can be throttled — favor humanized timing.

**No watermarks or superimposed branding** on published content, in any tier. TikTok's content
guidelines prohibit adding brand names, logos, watermarks, or promotional overlays to content
shared through its API.

**Pricing, as published today at `/pricing`:** Free $0, Creator $5/mo, Pro $8/mo — positioned to
be an impulse purchase. Tiers are announced publicly but **no payment processor is wired in the
repo**; there is no Stripe or equivalent integration.

**Confirmed gaps and undecided facts:**

- **Mobile push is half-built.** The server side exists — `sendPush` in
  `packages/notifications/src/channels.ts` and a unique `expoPushToken` in the Prisma schema —
  but the Expo app does not install `expo-notifications` and never registers a device token. The
  push half of mobile's confirmed role is not yet real.
- **Reconnect-from-phone does not exist yet.** It is part of mobile's intended role; today the
  app only displays connection status and tells the user to go to the web app.
- **Build-vs-buy on publishing is undecided.** A unified publishing API (e.g. Ayrshare) could
  skip per-platform audits for MVP at a per-post cost, then be replaced by native adapters behind
  the same `Publish(Video)` interface.
- **Credential reuse is unresolved.** API access approved for a previous app is tied to that
  app's reviewed use case and UX; reusing those keys for PostPilot may require re-audit. Confirm
  before building on them.
- Google login is scaffolded but not enabled.

## Brand Commitments

**Name:** PostPilot. The `PostPilot-app-brief.md` document still calls the product "Video
Queue" — that is a superseded working name, not a current one.

**Tagline:** *"Upload once. Queue it. Walk away — we'll only ping you if we genuinely need you."*

**Voice:** the dependable employee. Calm, plain, specific, never hyped. Messaging in this
register: "Your content should work while you don't." / "Stop scheduling posts. Start filling
your queue." / "Batch once. Stay consistent." Anxiety reduction is an explicit goal of the
queue-health copy.

**Assets on hand:** `apps/web/public/logo.png`, `logo-small.png`, `app-icon-1024.png`;
`apps/mobile/assets/icon.png` and `adaptive-icon.png`. Brand typeface is **Geist** (SIL OFL 1.1,
weights 400/500/600/700), loaded via `next/font/google` in the web app; see
`assets/fonts/README.md`.

**Undecided:** two palettes coexist in the repo — `assets/fonts/README.md` records lime
`#e8f256` / ink `#0b0a08` / white, while `apps/mobile/tailwind.config.js` uses a navy
`#2d3f63` primary with slate neutrals and comments that it matches the web app. Which is
binding has not been established. Recorded here as a fact; resolving it is visual work.

## Evidence on Hand

- **Live site:** https://post-pilot.app
- **Product documents in-repo:** `PostPilot-app-brief.md` (full vision, under the superseded
  "Video Queue" name), `README.md`, `HANDOFF.md`, `DEPLOY.md`, `CI-SETUP.md`,
  `LIBRARY-FOLDERS-ARCHITECTURE.md`, `INSTAGRAM-APP-REVIEW.md`, `GOV-DATA-REQUEST-POLICY.md`,
  and two Instagram screencast scripts.
- **Marketing assets:** `apps/web/public/marketing/`. Public pages exist for pricing, privacy,
  terms, and data deletion.
- **Do not fabricate.** There are no testimonials, named customers, user counts, revenue
  figures, growth metrics, benchmarks, case studies, press mentions, or awards. None exist.
  Platform approvals (TikTok audit, Meta App Review, YouTube verification) are **not** confirmed
  complete — do not present the product as fully approved for public posting.

## Product Principles

1. **Absence is the success state.** The best session is the one that never had to happen.
   Judge changes by how little the creator must do, not by engagement.
2. **Interrupt only when a human is genuinely required.** Auto-recover first. When escalating,
   escalate once per cause, deduplicated and throttled — never once per failed item.
3. **Never silently lose content.** Failures hold videos and degrade one platform at a time.
   The queue must never quietly consume, skip, or drop work.
4. **Content-shaped, not calendar-shaped.** Creators think in backlogs, not in Tuesdays. Reject
   complex calendar interfaces; the queue consumes itself.
5. **Relentless anti-scope.** Every proposed feature must survive one question: does this help
   someone with 150 videos keep posting? If not, it belongs to the tools this product refuses
   to become.

## Accessibility & Inclusion

No product-specific standard or user requirement has been established — this is an open
decision, not a settled one.

Two durable facts for future work: the iOS app currently ships **zero** accessibility labels,
roles, or hints across its screens and components, and `app.json` declares
`userInterfaceStyle: "automatic"` (inheriting the OS light/dark setting) while the app has no
dark treatment at all.
