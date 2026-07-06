import type { Metadata } from 'next';

import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'Data Deletion — PostPilot',
  description:
    'How to delete your PostPilot account and remove your data, including data associated with connected Instagram, TikTok, and YouTube accounts.',
};

/**
 * /data-deletion — public data deletion instructions. Required by Meta App
 * Review for the Instagram integration; linked from the marketing footer.
 */
export default function DataDeletionPage() {
  const lastUpdated = 'July 6, 2026';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight">Data Deletion</h1>
          <p className="text-muted-foreground mt-3 text-sm">Last updated {lastUpdated}</p>

          <div className="mt-10 space-y-8 text-base leading-relaxed">
            <p>
              PostPilot is a service operated by RushfordColler LLC. You can delete your PostPilot
              account and all associated data at any time. This page explains how, what gets removed,
              and how to reach us if you need help.
            </p>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Delete your account in the app</h2>
              <p>
                The fastest way is to do it yourself. Sign in and go to{' '}
                <span className="text-foreground font-medium">Settings → Delete account</span>. This
                permanently removes your account, your uploaded videos, your queue and schedule, and
                the access tokens for any connected platforms. The action is immediate and cannot be
                undone.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Disconnect a single platform</h2>
              <p>
                If you only want to revoke access for one connected account — for example, your
                Instagram professional account — go to{' '}
                <span className="text-foreground font-medium">Settings → Connections</span> and click
                Disconnect next to that platform. This revokes the access you granted and deletes the
                stored token for that account. You can also revoke PostPilot from Instagram directly
                under Instagram Settings → Apps and Websites.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Request deletion by email</h2>
              <p>
                If you can&rsquo;t sign in, or you&rsquo;d prefer we handle it for you, email{' '}
                <a
                  href="mailto:privacy@postpilot.app?subject=Data%20deletion%20request"
                  className="text-foreground font-medium hover:underline"
                >
                  privacy@postpilot.app
                </a>{' '}
                from the address on your account with the subject &ldquo;Data deletion request.&rdquo;
                We&rsquo;ll verify ownership and permanently delete your account and associated data
                within 30 days, and confirm by email once it&rsquo;s done.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">What is deleted</h2>
              <p>
                Deletion removes your profile and login, uploaded videos and any generated captions,
                titles, hashtags, and thumbnails, your queue and posting schedule, and the access
                tokens for every connected platform. Content you already published to Instagram,
                TikTok, or YouTube stays on those platforms — you control that from within each
                platform. If you only need certain posts removed from a platform, delete them there.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
              <p>
                Questions about deleting your data? Email us at{' '}
                <a
                  href="mailto:privacy@postpilot.app"
                  className="text-foreground font-medium hover:underline"
                >
                  privacy@postpilot.app
                </a>
                .
              </p>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
