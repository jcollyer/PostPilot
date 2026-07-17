import type { Metadata } from 'next';

import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'PostPilot Terms of Service',
  description: 'The terms that govern your use of PostPilot.',
};

/**
 * /terms — public terms of service linked from the marketing footer and the
 * OAuth consent screens for Google (YouTube), TikTok, and Meta (Instagram).
 */
export default function TermsPage() {
  const lastUpdated = 'July 13, 2026';

  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
          <h1 className="text-4xl font-semibold tracking-tight">PostPilot Terms of Service</h1>
          <p className="text-muted-foreground mt-3 text-sm">Last updated {lastUpdated}</p>

          <div className="mt-10 space-y-8 text-base leading-relaxed">
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of PostPilot, a service
              operated by RushfordColler LLC (&ldquo;PostPilot,&rdquo; &ldquo;we,&rdquo; or
              &ldquo;us&rdquo;). By creating an account or using PostPilot, you agree to these Terms.
              If you do not agree, do not use the service.
            </p>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">The service</h2>
              <p>
                PostPilot is a social media scheduling tool that lets you upload videos, generate
                captions, and schedule and publish that content to social media accounts you connect,
                including Google (YouTube), TikTok, and Meta (Instagram). We publish content to your
                connected accounts only when and as you direct.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Your account</h2>
              <p>
                You must provide accurate information, keep your credentials secure, and be
                responsible for activity under your account. You must be at least the age of majority
                in your jurisdiction, and old enough to hold accounts on the platforms you connect.
                You are responsible for maintaining the confidentiality of your login.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Connected platforms and their terms</h2>
              <p>
                When you connect a platform, you authorize PostPilot to act on your behalf through
                that platform&rsquo;s official API, solely to provide the features you request. Your
                use of each connected platform through PostPilot is also governed by that
                platform&rsquo;s own terms, and you agree to comply with them:
              </p>
              <ul className="list-disc space-y-2 pl-6">
                <li>
                  <strong>YouTube / Google.</strong> By connecting YouTube, you agree to be bound by
                  the{' '}
                  <a
                    href="https://www.youtube.com/t/terms"
                    className="text-foreground font-medium hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    YouTube Terms of Service
                  </a>
                  . PostPilot uses YouTube API Services, and our use of Google user data is subject
                  to the{' '}
                  <a
                    href="https://policies.google.com/privacy"
                    className="text-foreground font-medium hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Privacy Policy
                  </a>
                  .
                </li>
                <li>
                  <strong>TikTok.</strong> Your use of TikTok through PostPilot is subject to the{' '}
                  <a
                    href="https://www.tiktok.com/legal/terms-of-service"
                    className="text-foreground font-medium hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    TikTok Terms of Service
                  </a>
                  .
                </li>
                <li>
                  <strong>Meta / Instagram.</strong> Your use of Instagram through PostPilot is
                  subject to the{' '}
                  <a
                    href="https://help.instagram.com/581066165581870"
                    className="text-foreground font-medium hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Instagram Terms of Use
                  </a>
                  .
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Your content and responsibilities</h2>
              <p>
                You retain ownership of the content you upload. You grant PostPilot the limited rights
                needed to store, process, and publish that content to the accounts you connect. You
                represent that you own or have the necessary rights to the content you publish, and
                that it does not infringe any third party&rsquo;s rights or violate any law or the
                rules of the platforms you post to. You are solely responsible for the content you
                schedule and publish.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Acceptable use</h2>
              <p>
                You agree not to use PostPilot to publish unlawful, infringing, deceptive, or harmful
                content; to post spam or engage in artificial or automated behavior that violates a
                platform&rsquo;s policies; to misuse the connected platform APIs; or to attempt to
                access, disrupt, or reverse-engineer the service. We may suspend or terminate accounts
                that violate these Terms or a connected platform&rsquo;s policies.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Disconnecting and termination</h2>
              <p>
                You may disconnect any platform or delete your account at any time, which revokes our
                access to that platform. We may suspend or terminate your access if you violate these
                Terms, if required to comply with a platform&rsquo;s policies, or if necessary to
                protect the service or its users. Provisions that by their nature should survive
                termination will survive.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Disclaimers</h2>
              <p>
                PostPilot is provided &ldquo;as is&rdquo; and &ldquo;as available,&rdquo; without
                warranties of any kind. We do not guarantee that publishing will always succeed, that
                the service will be uninterrupted or error-free, or that connected platforms will
                remain available or unchanged. Connected platforms are operated by third parties and
                are outside our control.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Limitation of liability</h2>
              <p>
                To the maximum extent permitted by law, RushfordColler LLC will not be liable for any
                indirect, incidental, special, consequential, or punitive damages, or for any loss of
                content, data, revenue, or goodwill, arising from your use of PostPilot. Our total
                liability for any claim relating to the service will not exceed the amount you paid us
                for the service in the twelve months before the claim.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Changes to these terms</h2>
              <p>
                We may update these Terms from time to time. When we do, we will revise the date above
                and post the updated Terms on this page. Your continued use of PostPilot after a change
                takes effect means you accept the updated Terms.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Governing law</h2>
              <p>
                These Terms are governed by the laws of the State of California, without regard to its
                conflict-of-laws rules. Any dispute will be resolved in the state or federal courts
                located in Sacramento/California, and you consent to their jurisdiction.
              </p>
            </div>

            <div className="space-y-3">
              <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
              <p>
                Questions about these Terms? Email us at{' '}
                <a
                  href="mailto:support@postpilot.app"
                  className="text-foreground font-medium hover:underline"
                >
                  support@postpilot.app
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
