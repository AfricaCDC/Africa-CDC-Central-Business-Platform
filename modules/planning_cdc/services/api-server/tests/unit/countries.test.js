// ── @rbm/lib/countries — AU member states (D-20261026-05) ──

const { AU_MEMBER_STATES, AU_REGIONS, WORLD_COUNTRIES, countryByCode, parseLocations, formatLocations } = require('@rbm/lib/countries');

describe('@rbm/lib/countries', () => {
  it('should list 55 member states with unique ISO alpha-3 codes and a known region', () => {
    expect(AU_MEMBER_STATES).toHaveLength(55);
    expect(new Set(AU_MEMBER_STATES.map((c) => c.code)).size).toBe(55);
    for (const c of AU_MEMBER_STATES) {
      expect(c.code).toMatch(/^[A-Z]{3}$/);
      expect(AU_REGIONS).toContain(c.region);
    }
  });

  it('should find a member state by code and return null otherwise', () => {
    expect(countryByCode('KEN')).toEqual({ code: 'KEN', name: 'Kenya', region: 'Eastern' });
    expect(countryByCode('FRA')).toBeNull();
    expect(countryByCode(undefined)).toBeNull();
  });
});

describe('WORLD_COUNTRIES (D-20261028-01)', () => {
  it('should list every country once, AU member states flagged, sorted by name', () => {
    expect(WORLD_COUNTRIES.length).toBeGreaterThan(190);
    expect(new Set(WORLD_COUNTRIES.map((c) => c.code)).size).toBe(WORLD_COUNTRIES.length);
    expect(WORLD_COUNTRIES.filter((c) => c.au)).toHaveLength(55);
    expect(WORLD_COUNTRIES.find((c) => c.code === 'FRA')).toMatchObject({ name: 'France', au: false });
    const names = WORLD_COUNTRIES.map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('should keep the names already stored in locations', () => {
    expect(countryByCode('COD').name).toBe('Congo (Democratic Republic)');
    expect(countryByCode('COG').name).toBe('Congo (Republic)');
  });
});

describe('parseLocations / formatLocations', () => {
  it('should read a single place unchanged and split several places on « ; »', () => {
    expect(parseLocations('Kenya')).toEqual(['Kenya']);
    expect(parseLocations('Kenya; Uganda ;')).toEqual(['Kenya', 'Uganda']);
    expect(parseLocations(null)).toEqual([]);
  });

  it('should store one place as its name and drop duplicates', () => {
    expect(formatLocations(['Kenya'])).toBe('Kenya');
    expect(formatLocations(['Kenya', 'Uganda', 'Kenya'])).toBe('Kenya; Uganda');
    expect(formatLocations([])).toBeNull();
  });
});
