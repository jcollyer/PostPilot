import Link from 'next/link';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Sparkles,
  UploadCloud,
  Wand2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

import { HeroAnimation } from './HeroAnimation';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

/**
 * Public marketing homepage for logged-out visitors. Leads with the logo and
 * positioning, walks through the core features, and drives to sign-up. Pricing
 * lives on its own /pricing route, linked from here.
 */

const FEATURES = [
  {
    icon: UploadCloud,
    title: 'Upload once, queue forever',
    body: 'Drop a whole backlog of short-form videos in one go. PostPilot holds them in a tidy queue so you are never scrambling for something to post.',
  },
  {
    icon: Wand2,
    title: 'AI does the busywork',
    body: 'It writes titles, captions, and hashtags and picks thumbnails for each clip — so every post goes out polished without you touching it.',
  },
  {
    icon: CalendarClock,
    title: 'Smart, hands-off scheduling',
    body: 'It spaces similar videos apart and publishes on your schedule to TikTok, Instagram Reels, and YouTube Shorts automatically.',
  },
  {
    icon: Sparkles,
    title: 'Only pings you when it matters',
    body: 'No noisy dashboards to babysit. PostPilot runs itself and reaches out only when something genuinely needs your attention.',
  },
];

const STEPS = [
  { step: '1', title: 'Connect your accounts', body: 'Link TikTok, Reels, and Shorts in a couple of clicks.' },
  { step: '2', title: 'Upload your backlog', body: 'Add videos once; AI preps the captions and thumbnails.' },
  { step: '3', title: 'Walk away', body: 'PostPilot publishes on schedule and keeps you consistent.' },
];

export function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="hero-dots pointer-events-none absolute inset-0 -z-10" aria-hidden />
          <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 to-transparent" />
          <div
            className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
            aria-hidden
          />
          <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24">
            <div className="max-w-3xl">
              <div className="text-foreground border-border bg-secondary mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
                <Sparkles className="h-3.5 w-3.5 fill-primary text-foreground" />
                Your content queue on autopilot
              </div>
              <h1 className="text-4xl font-semibold leading-[1.03] tracking-tight sm:text-6xl">
                Upload once. Queue it. Walk away.
              </h1>
              <p className="text-muted-foreground mt-5 max-w-2xl text-lg">
                PostPilot auto-publishes your short-form videos to TikTok, Instagram Reels, and
                YouTube Shorts — batch your content once, stay consistent, and let AI handle the
                rest.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/signin?mode=signup">
                    Get started free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/pricing">See pricing</Link>
                </Button>
              </div>
              <p className="text-muted-foreground mt-4 text-sm">
                Free to start · no credit card required
              </p>
            </div>

            {/* Animated product demo (replaces the static screenshot) */}
            <div className="border-border/70 bg-card mt-14 overflow-hidden rounded-2xl border shadow-sm sm:mt-16">
              <HeroAnimation />
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="max-w-4xl">
            <h2 className="text-foreground text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Everything you need to post consistently
            </h2>
            <p className="text-muted-foreground mt-1 text-3xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Set it up once and PostPilot keeps your channels fed.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="border-border/60 bg-card rounded-xl border p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="bg-foreground text-primary mb-4 flex size-11 items-center justify-center rounded-lg">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold">{f.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-secondary/40 border-border/60 border-y">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">Live in three steps</h2>
              <p className="text-muted-foreground mt-3">
                From zero to a self-running content queue in minutes.
              </p>
            </div>
            <div className="mt-12 grid gap-8 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.step} className="text-center">
                  <div className="bg-primary text-primary-foreground mx-auto flex size-10 items-center justify-center rounded-full text-sm font-semibold">
                    {s.step}
                  </div>
                  <h3 className="mt-4 font-semibold">{s.title}</h3>
                  <p className="text-muted-foreground mt-2 text-sm">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-20">
          <div className="bg-foreground text-background relative overflow-hidden rounded-2xl px-8 py-14 text-center">
            <div
              className="bg-primary/20 pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full blur-3xl"
              aria-hidden
            />
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Stop scrambling to stay consistent
            </h2>
            <p className="text-background/70 mx-auto mt-3 max-w-xl">
              Batch your videos once and let PostPilot do the posting. Affordable enough to be an
              impulse.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/signin?mode=signup">
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="border-background/30 text-background hover:bg-background/10 hover:text-background bg-transparent"
              >
                <Link href="/pricing">Compare plans</Link>
              </Button>
            </div>
            <div className="text-background/70 mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="text-primary h-4 w-4" /> Free plan to try it
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="text-primary h-4 w-4" /> TikTok, Reels &amp; Shorts
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="text-primary h-4 w-4" /> Cancel anytime
              </span>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
