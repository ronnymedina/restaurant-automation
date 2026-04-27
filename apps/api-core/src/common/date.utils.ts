/**
 * Converts a YYYY-MM-DD date string to a UTC Date representing the
 * start or end of that calendar day in the given IANA timezone.
 *
 * Uses iterative Intl refinement to handle DST transitions correctly.
 */
export function toUtcBoundary(
  dateStr: string,
  timezone: string,
  boundary: 'start' | 'end',
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const wantHour = boundary === 'end' ? 23 : 0;
  const wantMin = boundary === 'end' ? 59 : 0;
  const wantSec = boundary === 'end' ? 59 : 0;
  const wantMs = boundary === 'end' ? 999 : 0;

  // Start at noon UTC to avoid same-day edge cases
  let utcMs = Date.UTC(year, month - 1, day, 12, 0, 0);

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const get = (parts: Intl.DateTimeFormatPart[], type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);

  for (let i = 0; i < 3; i++) {
    const parts = fmt.formatToParts(new Date(utcMs));
    const h = get(parts, 'hour') === 24 ? 0 : get(parts, 'hour');
    const actualMs = Date.UTC(
      get(parts, 'year'),
      get(parts, 'month') - 1,
      get(parts, 'day'),
      h,
      get(parts, 'minute'),
      get(parts, 'second'),
    );
    const wantedMs = Date.UTC(year, month - 1, day, wantHour, wantMin, wantSec);
    utcMs -= actualMs - wantedMs;
  }

  return new Date(utcMs + wantMs);
}
