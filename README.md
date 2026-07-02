<p align="center">
  <img src="apps/web/public/logo.png" alt="PostPilot" width="420" />
</p>

<p align="center">
  <img src="apps/web/public/logo-small.png" alt="" width="72" />
</p>

<p align="center">
  <strong>Upload once. Queue it. Walk away — we'll only ping you if we genuinely need you.</strong>
</p>

<p align="center">
  🌐 <a href="https://post-pilot.app/"><strong>post-pilot.app</strong></a>
</p>

## Overview

PostPilot is an AI-powered content queue for short-form video creators. It turns a
folder of hundreds of clips into a hands-off publishing pipeline: you upload, the AI
does the busywork, you skim and approve, and background workers keep posting for
weeks — quietly, only reaching out when a human is genuinely needed.

Top-level features:

- **Batch upload at scale** — drop 100–500 videos in one go, straight to storage via
  presigned direct-to-CDN uploads (no server bottleneck).
- **AI content analysis** — every clip is transcribed and gets a title, caption,
  hashtags, and a category written for it, tailored per platform.
- **Automatic thumbnails** — candidate frames are sampled from each video and a vision
  model picks the strongest one.
- **Duplicate detection** — perceptual hashing plus embedding similarity flag exact
  copies, re-exports, and near-duplicate edits before they clog your queue.
- **Smart queue ordering** — similar videos are spaced apart automatically so your
  feed doesn't post three near-identical clips back to back.
- **Multi-platform publishing** — recurring, timezone-aware scheduling to **TikTok,
  Instagram Reels, and YouTube Shorts** from a single queue.
- **Autonomous always-on engine** — publishing, polling, retries, and token refresh
  run continuously; you're notified (email / push / SMS) only when something breaks.
- **Review-first control** — nothing goes out until you start the queue; you can edit
  any AI-generated metadata first.
- **Web + mobile** — a full web dashboard plus a read-only mobile monitor to check
  status on the go.

It's two systems sharing one codebase: the interactive web/mobile app, and an
always-on engine (AI pipeline, scheduler, publishing + notification workers) that runs
regardless of who's logged in.

## Tech stack & distribution

The whole thing lives in a **Turborepo** monorepo (npm workspaces, `@postpilot/*`),
which lets the web app, the mobile app, and every background worker share the same
typed code — schemas, database client, platform adapters — instead of re-implementing
it three times. Here's what each layer uses and how the layers fit together.

**Frontend & API.** The web app is **Next.js (App Router)**; the mobile monitor is
**Expo / React Native**. Both talk to the backend through a single typed **tRPC** API
(`packages/api`), so a change to a router signature is a compile error in every client
immediately — no drift between app and server. **Better Auth** handles sign-in
(email/password with Resend email verification; Google ready).

**Data & storage.** State lives in **Neon Postgres** accessed through **Prisma**, with
the **pgvector** extension storing a 1536-dim embedding per video. Media never touches
the app server: the browser uploads directly to **Cloudflare R2** using presigned URLs,
and R2's public CDN serves playback and thumbnails. Prisma is the shared contract —
the same client is used by the web API and by every worker.

**AI pipeline.** `packages/ai-pipeline` uses **ffmpeg** to pull audio and candidate
frames, **OpenAI Whisper** to transcribe, **GPT-4o vision** to write metadata and pick
thumbnails, and **OpenAI embeddings** for similarity. See [How AI is used](#how-ai-is-used).

**The always-on engine.** Publishing, scheduling, notifications, and the AI pipeline
are written as plain framework-agnostic functions (`packages/queue`,
`packages/publishing`, `packages/notifications`). Locally they run as `*:watch` loops;
in production the exact same functions are wrapped as durable **Trigger.dev** crons —
so dev and prod run identical logic. Notifications fan out over **Resend** (email),
**Expo** push, and **Twilio** SMS.

**Distribution.** The web app deploys to **Railway** (Nixpacks image with Node 20 +
ffmpeg baked in, no Dockerfile). The engine deploys to **Trigger.dev's** cloud as
scheduled crons. The mobile app ships through **EAS / Expo** and points at the deployed
API. All four surfaces — web, mobile, API, engine — are built from the one monorepo, so
a shared type change propagates everywhere at once. See **`DEPLOY.md`** for the full
wiring.

**How a video flows through it:** browser → presigned upload to **R2** → row in
**Neon/Postgres** → the **Trigger.dev** AI worker runs the **ffmpeg/OpenAI** pipeline
and writes metadata + a **pgvector** embedding → the **queue** worker orders and
schedules it → the **publishing** worker posts it to the platforms at its slot → the
**notifications** worker only pings you if something needs attention.

## Structure

```
apps/
  web/            Next.js app (dashboard, library, queue, settings, auth)
  mobile/         Expo app (read-only monitor + auth)
packages/
  api/            tRPC routers + AppRouter type
  db/             Prisma schema, client, migrations (pgvector)
  types/          Shared Zod schemas + enums
  connectors/     Platform OAuth adapters, token crypto + refresh
  storage/        R2 presigned uploads + public URLs
  ai-pipeline/    ffmpeg / Whisper / vision / embeddings / pHash / dedupe
  queue/          ordering + tz scheduler + PublishTask materializer
  publishing/     Publish(Video) adapters + retry/poll/degradation runner
  notifications/  email / push / SMS dispatch + queue-health alerts
  jobs/           Trigger.dev task definitions (cron wrappers)
  config/         Shared TypeScript configs
```

## How AI is used

AI isn't a single call bolted on — it's a multi-step pipeline
(`packages/ai-pipeline`) that runs per video, with each step feeding the next.
The ordered flow is: **probe → extract frames → transcribe → gather creator
context → vision metadata → persist → embed → perceptual-hash → duplicate
detection.**

**Transcription (Whisper).** ffmpeg pulls the audio track and OpenAI Whisper turns
it into a transcript. That text becomes the raw material for everything downstream —
the metadata prompt, the embedding, and search.

**Vision metadata + thumbnail selection (GPT-4o).** ffmpeg samples candidate frames
at even points through the clip (10/30/50/70/90%) and uploads each to R2. Those frames
plus the transcript go to a GPT-4o vision model acting as a "content manager": it
writes a title, caption, hashtags, and category, tailors a caption set per platform
(TikTok favors hooks/trends, YouTube favors searchable titles, Instagram sits between),
**and picks the strongest frame as the thumbnail** (`bestFrameIndex`) — so thumbnail
choice is an AI decision over real candidates, not a fixed timestamp.

The vision prompt isn't just the frames and transcript — the pipeline assembles
several additional context signals so the metadata matches both the video's *topic*
and the creator's *voice*:

**Folder-tree naming conventions.** The pipeline walks the video's folder chain from
root to leaf (`resolveFolderPath`) and passes the path — e.g.
`2020 / June / New York / Empire State Building / night` — to the model as a strong
topical hint. Creators' own filing usually encodes who/what/where/when (location, event,
client, series, date), so it grounds titles, captions, and hashtags. Obvious
file-management junk ("New Folder", "Final", "Exports", "Misc") is stripped first, and
the model is instructed never to quote raw folder names or internal codes verbatim.

**Onboarding profile form (Settings).** A creator profile set directly by the user —
niche, tone, target audience, a "words to avoid" list, an example caption, and an emoji
preference (none / moderate / heavy) — is injected as the *highest-priority* instruction
block, overriding every inferred signal. The banned-words list is enforced twice: once
in the prompt and again as a hard post-process filter over every generated field, so it
holds even when the model slips.

**RAG — retrieval-augmented metadata that sounds like the creator.** The pipeline also
retrieves examples of the creator's own voice and injects them as few-shot references
(`steps/style-examples.ts`), from two sources: (1) the creator's real past captions and
bio, cached from their connected TikTok/Instagram/YouTube accounts, and (2) when those
are sparse — e.g. a brand-new creator — it falls back to **vector search over their
existing library**, using the transcript as the query to find the most similar past
videos via pgvector.

Together these give a clear priority order in the prompt: explicit **profile
instructions** first, then the creator's **bio**, then **past-post examples**, with the
**folder path** grounding the topic — metadata grounded in how this specific creator
actually writes and files, not generic AI boilerplate.

**Embeddings & vector search (pgvector).** Each video is embedded from its richest text
— title, category, hashtags, caption, and transcript — into a 1536-dim OpenAI embedding
stored in a `vector(1536)` column in Postgres. Cosine nearest-neighbour queries
(`embedding <=> query`) over that column power two features from one index:

- **Near-duplicate detection** — combined with a perceptual **dHash** (a 64-bit hash
  from a 9×8 grayscale frame that survives re-encoding and trims). dHash Hamming
  distance catches exact copies and re-exports cheaply; embedding cosine similarity
  catches "same shoot, different edit" that the pixels miss. Both write
  `DuplicateMatch` rows so the queue can warn before publishing.
- **Smart queue ordering** — the scheduler reads back the embeddings and uses cosine
  similarity to *space similar videos apart*, penalizing adjacency so your feed doesn't
  post three near-identical clips in a row. Videos still missing an embedding fall back
  to category matching so nothing gets stuck.

Every AI step is written to degrade gracefully: a failed transcription or missing style
example produces less context rather than failing the whole pipeline, and missing
config surfaces as an operator-visible `FAILED` status instead of a silent hang.

## Getting started

```bash
npm install                              # also runs prisma generate
cp .env.example .env                     # then fill in the values
npm run db:migrate:deploy                # apply migrations
npm run dev                              # web → http://localhost:3000
```

See `.env.example` for every variable (Neon, Better Auth, R2, OpenAI, the
platform OAuth clients, and the optional Twilio/Expo notification channels).

## The background engine

Heavy work never runs in request handlers. During development, run the worker
loops (each is a framework-agnostic entrypoint that Trigger.dev wraps in
production — see `DEPLOY.md`):

| Command                       | What it does                                  |
| ----------------------------- | --------------------------------------------- |
| `npm run ai:watch`            | Drains PENDING videos through the AI pipeline |
| `npm run publish:watch`       | Publishes due posts + polls in-flight ones    |
| `npm run notify:watch`        | Queue-health checks + delivers notifications  |
| `npm run refresh:connections` | Proactive OAuth token refresh                 |
| `npm run queue:reschedule`    | Recomputes the publish plan                   |

ffmpeg must be installed locally (`brew install ffmpeg`) and on the worker host.

## Deployment

See **`DEPLOY.md`** for wiring Trigger.dev (durable crons) + Railway (hosting).

## Platform review realities

Publishing requires each platform's audit/verification before going public:
TikTok restricts unaudited apps to private posts, Instagram needs a Business/
Creator account + Meta App Review, and YouTube needs a verified project. Default
post visibility is private/self-only so you can test within those limits. No
watermarks or superimposed branding are added to published content (TikTok ToS).
