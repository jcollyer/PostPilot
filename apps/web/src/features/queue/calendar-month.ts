/** A calendar month, `month` 0-based like `Date#getMonth`. */
export interface Month {
  year: number;
  month: number;
}

export function monthOf(date: Date): Month {
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function addMonths({ year, month }: Month, n: number): Month {
  const d = new Date(year, month + n, 1);
  return monthOf(d);
}

/** "November 2026" in the viewer's locale. */
export function formatMonth({ year, month }: Month): string {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1),
  );
}

/** The viewer-local `YYYY-MM-DD` of an instant — the key the server buckets chips by. */
export function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * The days a Sunday-first month grid shows: the month itself plus the days from
 * its neighbours that fill the first and last weeks. `from`/`to` are the grid's
 * first local midnight and the (exclusive) midnight after its last day — the
 * range the calendar fetches.
 */
export function monthGrid({ year, month }: Month): { days: Date[]; from: Date; to: Date } {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const from = new Date(year, month, 1 - first.getDay());
  const to = new Date(year, month + 1, 7 - last.getDay());
  const days: Date[] = [];
  // Step by calendar day, not 24h, so DST changes don't skew the grid.
  for (let d = from; d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    days.push(d);
  }
  return { days, from, to };
}
