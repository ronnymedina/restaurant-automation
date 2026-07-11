export function formatDate(
  isoString: string | null | undefined,
  timezone: string,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!isoString) return '—';
  const defaultOptions: Intl.DateTimeFormatOptions = {
    dateStyle: 'medium',
    timeStyle: 'short',
  };
  return new Intl.DateTimeFormat('es', {
    timeZone: timezone,
    ...(options ?? defaultOptions),
  }).format(new Date(isoString));
}

export function formatTime(
  isoString: string | null | undefined,
  timezone: string,
): string {
  return formatDate(isoString, timezone, { hour: '2-digit', minute: '2-digit', hour12: false });
}
