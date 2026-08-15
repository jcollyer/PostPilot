import type { Metadata } from 'next';
import Link from 'next/link';

import { PricingTiers } from '@/features/marketing/PricingTiers';
import { SiteFooter } from '@/features/marketing/SiteFooter';
import { SiteHeader } from '@/features/marketing/SiteHeader';

export const metadata: Metadata = {
  title: 'Pricing — PostPilot',
  description:
    'Simple, affordable plans for staying consistent. Start free, upgrade when your queue grows.',
};

/**
 * /pricing — public pricing page linked from the marketing homepage.
 *
 * Stays a server component for metadata; the tier cards are a client component
 * because of the monthly/annual toggle.
 */
export default function PricingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-semibold tracking-tight">Simple, affordable pricing</h1>
            <p className="text-muted-foreground mt-4 text-lg">
              Every plan runs the full AI pipeline on every video. Plans differ by how much you keep
              in your library — start free and upgrade when your queue grows.
            </p>
          </div>

          <PricingTiers />

          <p className="text-muted-foreground mx-auto mt-12 max-w-xl text-center text-sm">
            Cancel anytime. Already have an account?{' '}
            <Link href="/signin" className="text-foreground font-medium hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
