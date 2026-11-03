import { redirect } from 'next/navigation';

import { CalendarPage } from '@/prototype/queue-calendar/CalendarPrototype';
import { getServerSession } from '@/server/session';

/** PROTOTYPE — the "own page" calendar variant (map #104, ticket #105). */
export default async function QueueCalendarPage() {
  const session = await getServerSession();
  if (!session?.user) redirect('/signin');

  return <CalendarPage />;
}
