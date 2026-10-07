/** First whitespace-separated token; used when a full name (first + surname) is present. */
export function firstNameOf(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

/** Alphabetical compare by first name; full name breaks ties. */
export function compareByFirstName(a: string, b: string): number {
  const byFirst = firstNameOf(a).localeCompare(firstNameOf(b), undefined, {
    sensitivity: 'base',
  });
  if (byFirst !== 0) return byFirst;
  return a.trim().localeCompare(b.trim(), undefined, { sensitivity: 'base' });
}
