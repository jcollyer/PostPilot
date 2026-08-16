import { redirect } from 'next/navigation';

import { AppThemeScope } from '@/components/AppThemeScope';
import { NavBar } from '@/components/NavBar';
import { CreatorProfileOnboarding } from '@/features/onboarding/CreatorProfileOnboarding';
import { PlanSelection } from '@/features/onboarding/PlanSelection';
import { getServerSession } from '@/server/session';

/**
 * Layout for the authenticated area (/home, /settings). Guards access — any
 * unauthenticated visitor is bounced to the login page at the root route —
 * and renders the global navigation bar above every page.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session?.user) redirect('/signin');

  return (
    <div className="app-theme flex min-h-dvh flex-col">
      <AppThemeScope />
      <NavBar name={session.user.name} email={session.user.email} image={session.user.image} />
      <main className="container flex-1 py-8">{children}</main>
      {/* Plan choice comes first — it gates the account, whereas the creator
          profile is optional. Both are modals; the plan one wins because it
          renders last and cannot be dismissed. */}
      <CreatorProfileOnboarding />
      <PlanSelection />
    </div>
  );
}
