/** Compute up to two uppercase initials from a name or email. */
export function getInitials(value: string | null | undefined): string {
  const parts = (value ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return ((parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '')).toUpperCase();
  }
  return (value ?? '?').slice(0, 2).toUpperCase() || '?';
}

/** Friendly first name from a full name or, failing that, an email. */
export function getFirstName(name: string | null | undefined, email: string | null | undefined) {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return email ?? 'there';
}
