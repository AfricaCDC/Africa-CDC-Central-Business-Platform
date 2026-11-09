import { describe, it, expect, vi, afterEach } from 'vitest';

async function load(base) {
  vi.stubEnv('BASE_URL', base);
  vi.resetModules();
  return import('../basePath');
}

afterEach(() => vi.unstubAllEnvs());

describe('basePath, standalone (/)', () => {
  it('leaves paths untouched', async () => {
    const m = await load('/');
    expect(m.withBase('/login')).toBe('/login');
    expect(m.stripBase('/decide/3')).toBe('/decide/3');
    expect(m.BASE_PREFIX).toBe('');
    expect(m.DEFAULT_API_URL).toBe('/api');
  });
});

describe('basePath, embedded (/staff/planning/)', () => {
  it('prefixes app paths and the API base', async () => {
    const m = await load('/staff/planning/');
    expect(m.withBase('/login')).toBe('/staff/planning/login');
    expect(m.BASE_PREFIX).toBe('/staff/planning');
    expect(m.DEFAULT_API_URL).toBe('/staff/planning/api');
  });

  it('strips the prefix to get the router path', async () => {
    const m = await load('/staff/planning/');
    expect(m.stripBase('/staff/planning/decide/3')).toBe('/decide/3');
    expect(m.stripBase('/staff/planning')).toBe('/');
    expect(m.stripBase('/staff/planningX')).toBe('/staff/planningX');
  });
});
