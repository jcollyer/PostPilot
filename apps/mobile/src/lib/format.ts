/** Friendly first name from a full name or, failing that, an email. */
export function getFirstName(name: string | null | undefined, email: string | null | undefined) {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  return email ?? 'there';
}
