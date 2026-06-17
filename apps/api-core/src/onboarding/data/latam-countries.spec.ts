import {
  LATAM_COUNTRIES,
  LATAM_COUNTRY_CODES,
  findLatamCountry,
} from './latam-countries';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ct: { getCountry: (id: string) => { timezones: string[] } | null } = require('countries-and-timezones');

describe('LATAM_COUNTRIES', () => {
  it('tiene códigos únicos en ISO alpha-2', () => {
    const codes = LATAM_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((c) => expect(c).toMatch(/^[A-Z]{2}$/));
  });

  it('cada primaryTimezone pertenece a los timezones del país', () => {
    for (const country of LATAM_COUNTRIES) {
      const tzs = ct.getCountry(country.code)?.timezones ?? [];
      expect(tzs).toContain(country.primaryTimezone);
    }
  });

  it('decimalSeparator es "." o ","', () => {
    LATAM_COUNTRIES.forEach((c) => expect(['.', ',']).toContain(c.decimalSeparator));
  });

  it('LATAM_COUNTRY_CODES refleja todos los códigos', () => {
    expect(LATAM_COUNTRY_CODES).toEqual(LATAM_COUNTRIES.map((c) => c.code));
  });

  it('findLatamCountry devuelve el país o undefined', () => {
    expect(findLatamCountry('CL')?.currency).toBe('CLP');
    expect(findLatamCountry('XX')).toBeUndefined();
  });
});
