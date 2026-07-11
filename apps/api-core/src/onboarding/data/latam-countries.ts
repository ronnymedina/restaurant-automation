export interface LatamCountry {
  code: string;                 // ISO 3166-1 alpha-2 (ej. 'CL')
  name: string;                 // nombre en español (ej. 'Chile')
  currency: string;             // ISO 4217 (ej. 'CLP') — solo display
  decimalSeparator: '.' | ',';  // convención local por defecto
  primaryTimezone: string;      // IANA canónico (fallback si el del navegador no aplica)
}

export const LATAM_COUNTRIES: readonly LatamCountry[] = [
  { code: 'AR', name: 'Argentina',            currency: 'ARS', decimalSeparator: ',', primaryTimezone: 'America/Argentina/Buenos_Aires' },
  { code: 'BO', name: 'Bolivia',              currency: 'BOB', decimalSeparator: ',', primaryTimezone: 'America/La_Paz' },
  { code: 'BR', name: 'Brasil',               currency: 'BRL', decimalSeparator: ',', primaryTimezone: 'America/Sao_Paulo' },
  { code: 'CL', name: 'Chile',                currency: 'CLP', decimalSeparator: ',', primaryTimezone: 'America/Santiago' },
  { code: 'CO', name: 'Colombia',             currency: 'COP', decimalSeparator: ',', primaryTimezone: 'America/Bogota' },
  { code: 'CR', name: 'Costa Rica',           currency: 'CRC', decimalSeparator: ',', primaryTimezone: 'America/Costa_Rica' },
  { code: 'CU', name: 'Cuba',                 currency: 'CUP', decimalSeparator: '.', primaryTimezone: 'America/Havana' },
  { code: 'DO', name: 'República Dominicana', currency: 'DOP', decimalSeparator: '.', primaryTimezone: 'America/Santo_Domingo' },
  { code: 'EC', name: 'Ecuador',              currency: 'USD', decimalSeparator: '.', primaryTimezone: 'America/Guayaquil' },
  { code: 'GT', name: 'Guatemala',            currency: 'GTQ', decimalSeparator: '.', primaryTimezone: 'America/Guatemala' },
  { code: 'HN', name: 'Honduras',             currency: 'HNL', decimalSeparator: '.', primaryTimezone: 'America/Tegucigalpa' },
  { code: 'MX', name: 'México',               currency: 'MXN', decimalSeparator: '.', primaryTimezone: 'America/Mexico_City' },
  { code: 'NI', name: 'Nicaragua',            currency: 'NIO', decimalSeparator: '.', primaryTimezone: 'America/Managua' },
  { code: 'PA', name: 'Panamá',               currency: 'PAB', decimalSeparator: '.', primaryTimezone: 'America/Panama' },
  { code: 'PE', name: 'Perú',                 currency: 'PEN', decimalSeparator: '.', primaryTimezone: 'America/Lima' },
  { code: 'PY', name: 'Paraguay',             currency: 'PYG', decimalSeparator: ',', primaryTimezone: 'America/Asuncion' },
  { code: 'SV', name: 'El Salvador',          currency: 'USD', decimalSeparator: '.', primaryTimezone: 'America/El_Salvador' },
  { code: 'UY', name: 'Uruguay',              currency: 'UYU', decimalSeparator: ',', primaryTimezone: 'America/Montevideo' },
  { code: 'VE', name: 'Venezuela',            currency: 'VES', decimalSeparator: ',', primaryTimezone: 'America/Caracas' },
] as const;

export const LATAM_COUNTRY_CODES: readonly string[] = LATAM_COUNTRIES.map((c) => c.code);

export function findLatamCountry(code: string): LatamCountry | undefined {
  return LATAM_COUNTRIES.find((c) => c.code === code);
}
