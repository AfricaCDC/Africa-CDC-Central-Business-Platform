// ── config/env.js — production boot guards (D-20260818-02) ──
//
// The 2026-08-18 security audit found a silent `DB_PASSWORD ?? 'root'`
// fallback and a `DEBUG_ERRORS` switch that re-enables stack traces and raw
// SQL in API responses anywhere. Production must refuse to boot rather than
// run with superuser credentials or leak internals, so these guards are
// load-time throws — the tests below re-require the module with a mutated
// environment to prove each one fires (and, just as importantly, that none
// of them fire on a correctly configured production env).

// With NODE_ENV=production the module loads real .env files through dotenv
// (config/env.js:15-22), which would clobber the values under test with the
// machine's own configuration. Stub dotenv so each case controls its env.
jest.mock('dotenv', () => ({ config: () => ({ parsed: {} }) }));

const VALID_ACCESS = 'a'.repeat(40);
const VALID_REFRESH = 'b'.repeat(40);

/**
 * Load a fresh copy of config/env.js under the given environment.
 *
 * @param {Record<string, string|undefined>} overrides
 * @returns {() => object} thunk that requires the module
 * @example expect(loadEnv({ DB_PASSWORD: undefined })).toThrow(/DB_PASSWORD/);
 */
function loadEnv(overrides) {
  return () => {
    jest.resetModules();
    const previous = { ...process.env };
    Object.assign(process.env, {
      NODE_ENV: 'production',
      JWT_ACCESS_SECRET: VALID_ACCESS,
      JWT_REFRESH_SECRET: VALID_REFRESH,
      DB_USER: 'rbm',
      DB_PASSWORD: 'a-real-password',
    });
    // Assigning `undefined` would set the string "undefined" — delete instead.
    delete process.env.DEBUG_ERRORS;
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      return require('../../src/config/env');
    } finally {
      process.env = previous;
    }
  };
}

describe('config/env — production guards', () => {
  afterEach(() => jest.resetModules());

  it('boots when production is configured correctly', () => {
    expect(loadEnv({})).not.toThrow();
  });

  it('refuses to boot when DB_PASSWORD is missing in production', () => {
    expect(loadEnv({ DB_PASSWORD: undefined })).toThrow(/DB_PASSWORD/);
  });

  it('refuses to boot when DB_PASSWORD is the empty string in production', () => {
    // Empty is rejected deliberately — a blank password authenticates like a
    // missing one on a permissive MySQL server.
    expect(loadEnv({ DB_PASSWORD: '' })).toThrow(/DB_PASSWORD/);
  });

  it('refuses to boot when DB_USER is the MySQL superuser in production', () => {
    expect(loadEnv({ DB_USER: 'root' })).toThrow(/superuser/);
  });

  it.each(['ROOT', 'Root', 'rOoT'])(
    'refuses to boot when DB_USER is the superuser spelled %s (case-insensitive)',
    (spelling) => {
      expect(loadEnv({ DB_USER: spelling })).toThrow(/superuser/);
    },
  );

  it.each(['1', 'true', 'TRUE', 'yes', 'Yes'])(
    'refuses to boot when DEBUG_ERRORS is switched on with %s',
    (value) => {
      expect(loadEnv({ DEBUG_ERRORS: value })).toThrow(/DEBUG_ERRORS/);
    },
  );

  // Regression: any non-empty string is truthy in JS, so the previous guard
  // threw on `DEBUG_ERRORS=0` — an operator turning the flag OFF crash-looped
  // production.
  it.each(['0', 'false', 'no', ''])(
    'boots when DEBUG_ERRORS is explicitly off with %s',
    (value) => {
      expect(loadEnv({ DEBUG_ERRORS: value })).not.toThrow();
    },
  );

  it('never falls back to the root password', () => {
    const config = loadEnv({})();
    expect(config.db.password).toBe('a-real-password');
    expect(config.db.password).not.toBe('root');
  });

  it('keeps the dev fallbacks outside production', () => {
    expect(loadEnv({ NODE_ENV: 'development', DB_PASSWORD: undefined, DB_USER: 'root' })).not.toThrow();
  });
});
