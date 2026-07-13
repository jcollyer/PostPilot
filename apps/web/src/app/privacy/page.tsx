import type { Metadata } from 'next';

import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'Privacy Policy — PostPilot',
  description: 'How PostPilot handles your data. Short version: we don’t store your personal information.',
};

/**
 * /privacy — public privacy policy linked from the marketing footer.
 */
export default function PrivacyPage() {
  const lastUpdated = 'July 13, 2026';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-muted-foreground mt-3 text-sm">Last updated {lastUpdated}</p>

          <div className="mt-10 space-y-8 text-base leading-relaxed">
            <p>
              PostPilot is a service operated by RushfordColler LLC (&ldquo;PostPilot,&rdquo;
              &ldquo;we,&rdquo; or &ldquo;us&rdquo;). PostPilot is a social media scheduling tool that
              publishes videos to the accounts you connect. This policy explains what data we access
              from those connected accounts — including Google (YouTube), TikTok, and Meta (Instagram)
              — and how we use, share, protect, retain, and delete it. We do not sell your data, use
              it for advertising, or use it to train machine-learning models.
            </p>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Data we access from connected accounts</h2>
              <p>
                When you connect a platform, you grant PostPilot access through that platform&rsquo;s
                official API. We access only what is needed to publish and manage the content you
                schedule:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>Google user data (YouTube Data API v3), via the
                  <span className="whitespace-nowrap"> youtube.upload</span> and
                  <span className="whitespace-nowrap"> youtube.readonly</span> scopes:</strong> your
                  YouTube channel identity (channel ID, title, handle, and description), the titles,
                  descriptions, and publish dates of your recent uploads, and the OAuth access and
                  refresh tokens that authorize these calls. We also upload the videos you schedule to
                  your channel.
                </li>
                <li>
                  <strong>TikTok:</strong> your basic account and creator information (such as
                  display name and the posting options your account supports) and OAuth tokens, plus
                  the videos you schedule for publishing.
                </li>
                <li>
                  <strong>Meta / Instagram:</strong> your Instagram professional account identity
                  (account ID and username) and OAuth tokens, plus the videos (Reels) you schedule
                  for publishing.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">How we use this data</h2>
              <p>
                We use data from connected accounts solely to provide the features you request: to
                identify and display your connected channel or profile, to publish the videos you
                schedule to your own accounts, and — for YouTube channels — to read your channel
                description and recent upload titles so we can generate on-brand captions for the
                posts you create. We do not use this data for advertising, profiling, resale, or to
                train machine-learning models.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">How we share this data</h2>
              <p>
                We do not sell your data or share it for marketing. We transmit it only as needed to
                deliver the service:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  To the platform&rsquo;s own API (Google/YouTube, TikTok, Meta) to carry out the
                  action you asked for, such as publishing a video.
                </li>
                <li>
                  To a small set of service providers that operate our infrastructure strictly on our
                  behalf: <strong>Cloudflare R2</strong> for temporary media storage and
                  <strong> OpenAI</strong> to generate captions. Where YouTube channel data is used to
                  generate a caption, it is sent to OpenAI only to produce that caption at your
                  request; it is never used to train models.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">How we protect this data</h2>
              <p>
                All data is transmitted over encrypted connections (TLS). OAuth access and refresh
                tokens — the most sensitive data we hold — are encrypted at rest using
                authenticated AES-256-GCM encryption and are never stored in plaintext or exposed to
                the client. Access to production systems is restricted to authorized personnel.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Data retention and deletion</h2>
              <p>
                We retain your OAuth tokens and connected-account details only while your account is
                connected, so we can publish on your behalf. Video files are stored temporarily to
                enable publishing and are removed once they are no longer needed. Channel and recent
                post metadata used to generate captions is processed transiently and is not retained
                for any other purpose. When you disconnect a platform or delete your account, we revoke
                the platform access and delete the associated tokens and account data. You can
                disconnect a platform at any time in Settings, request deletion at{' '}
                <a href="/data-deletion" className="text-foreground font-medium hover:underline">
                  post-pilot.app/data-deletion
                </a>
                , or email us and we will delete your data.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Google API Services — Limited Use</h2>
              <p>
                PostPilot&rsquo;s use and transfer of information received from Google APIs to any
                other app will adhere to the{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  className="text-foreground font-medium hover:underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Google API Services User Data Policy
                </a>
                , including the Limited Use requirements. We apply these same limited-use principles
                to data received from TikTok and Meta.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Cookies and analytics</h2>
              <p>
                We use only the strictly necessary cookies required to keep you signed in and to
                operate the app. We do not use tracking cookies to follow you across other sites.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Your choices</h2>
              <p>
                You can disconnect any linked platform or delete your account at any time, which
                revokes our access and removes your associated data. If you have any question about
                your data, reach out and we&rsquo;ll help.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Changes to this policy</h2>
              <p>
                If we ever change how we handle data, we’ll update this page and revise the date
                above. Continued use of PostPilot after a change means you accept the updated policy.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
              <p>
                Questions about this policy? Email us at{' '}
                <a href="mailto:privacy@postpilot.app" className="text-foreground font-medium hover:underline">
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
