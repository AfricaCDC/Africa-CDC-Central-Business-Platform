/* eslint-disable no-restricted-syntax --
 * P-17 (JWT must not live in localStorage) is an APP-CODE rule. This test file
 * deliberately reads/writes localStorage to exercise the real interceptor's
 * documented token-injection + 401-clear behavior and authService logout
 * — verifying that behavior requires simulating the very storage the rule
 * governs. No app code is added here. Scope is the whole file because the
 * token assertions are spread across the logout/getCurrentUser suites.
 */
// ── api.js tests ──
//
// The project-wide test setup (`src/__tests__/setup.js`) auto-mocks
// `@/services/api`. Here we want to exercise the REAL interceptor logic,
// so we:
//   1. Unmock `@/services/api` and `axios` locally
//   2. Build a minimal axios stub that captures the interceptor functions
//      as api.js registers them
//   3. Invoke those functions with crafted payloads to verify:
//         - Bearer token injection
//         - 401 → redirect + localStorage clear
//         - Error envelope flattening so React never receives an object as a child
//
// Notes:
//   - We re-create the module with `vi.resetModules()` before each test so
//     interceptor wiring runs fresh.
//   - `window.location.href` is redefined via a getter/setter so we can
//     assert the login redirect without jsdom blowing up.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Bypass the global setup mock for this file only
vi.unmock('@/services/api');

// Capture handlers as api.js registers them.
let capturedRequestOk;
let capturedResponseErr;
let _capturedResponseOk;

// Custom axios stub — `axios.create()` returns an object that exposes an
// interceptors API identical to real axios's shape. We record every
// interceptor registration so we can re-invoke them from the test body.
vi.mock('axios', () => {
  const instance = {
    get: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
    post: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
    put: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
    patch: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
    delete: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
    // The interceptor re-issues retried GETs via api.request(cfg).
    request: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
    interceptors: {
      request: {
        use: vi.fn((okHandler /* , errHandler */) => {
          capturedRequestOk = okHandler;
        }),
      },
      response: {
        use: vi.fn((okHandler, errHandler) => {
          _capturedResponseOk = okHandler;
          capturedResponseErr = errHandler;
        }),
      },
    },
  };
  const axios = {
    create: vi.fn(() => instance),
  };
  return { __esModule: true, default: axios };
});

// Re-import after mocks are in place. Using dynamic import + resetModules
// so each test gets a freshly-wired set of interceptors.
let api;
let authService;

async function freshImport() {
  vi.resetModules();
  capturedRequestOk = undefined;
  capturedResponseErr = undefined;
  _capturedResponseOk = undefined;
  const mod = await import('@/services/api');
  api = mod.default;
  authService = mod.authService;
}

// Track window.location.href without jsdom navigation errors
let hrefSpy;
let originalLocation;

beforeEach(async () => {
  // Replace window.location with a writable stub
  originalLocation = window.location;
  hrefSpy = vi.fn();
  delete window.location;
  window.location = {
    ...originalLocation,
    href: '',
    assign: vi.fn(),
  };
  Object.defineProperty(window.location, 'href', {
    get: () => '',
    set: hrefSpy,
    configurable: true,
  });

  // Clear localStorage between tests
  localStorage.clear();

  await freshImport();
});

afterEach(() => {
  window.location = originalLocation;
});

describe('api.js — request interceptor', () => {
  it('should register a request interceptor at module load', () => {
    expect(typeof capturedRequestOk).toBe('function');
  });

  it('should attach a Bearer token when localStorage has one', () => {
    localStorage.setItem('token', 'abc.def.ghi');
    const config = { headers: {} };
    const result = capturedRequestOk(config);
    expect(result.headers.Authorization).toBe('Bearer abc.def.ghi');
  });

  it('should NOT attach a header when localStorage has no token', () => {
    const config = { headers: {} };
    const result = capturedRequestOk(config);
    expect(result.headers.Authorization).toBeUndefined();
  });
});

describe('api.js — response error interceptor', () => {
  it('should register a response error handler at module load', () => {
    expect(typeof capturedResponseErr).toBe('function');
  });

  it('should clear localStorage and send the user to /login with the session-expired notice on an unrecoverable 401', async () => {
    localStorage.setItem('token', 'abc');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    const err = {
      response: { status: 401, data: { error: 'unauth' } },
      config: { url: '/api/workplans' },
    };

    await expect(capturedResponseErr(err)).rejects.toBe(err);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(hrefSpy).toHaveBeenCalledWith('/login?reason=session_expired');
  });

  it('should bring the user back to the page they were on after an expired session', async () => {
    window.location.pathname = '/plan/node/5';
    window.location.search = '?tab=reports';
    const err = { response: { status: 401, data: {} }, config: { url: '/api/workplans' } };

    await expect(capturedResponseErr(err)).rejects.toBe(err);

    expect(hrefSpy).toHaveBeenCalledWith(`/login?return_to=${encodeURIComponent('/plan/node/5?tab=reports')}&reason=session_expired`);
  });

  it('should flatten the { error: { code, message } } envelope into a plain string', async () => {
    const err = {
      response: {
        status: 400,
        data: { success: false, error: { code: 'VALIDATION_FAILED', message: 'Bad input' } },
      },
      config: { url: '/api/workplans' },
    };

    await expect(capturedResponseErr(err)).rejects.toBe(err);

    // The interceptor mutates data in place
    expect(typeof err.response.data.error).toBe('string');
    expect(err.response.data.error).toBe('Bad input');
    // Original object preserved under error_obj so callers can still read the code
    expect(err.response.data.error_obj).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Bad input',
    });
  });

  it('should fall back to code when the envelope has no message', async () => {
    const err = {
      response: {
        status: 400,
        data: { success: false, error: { code: 'NOT_FOUND' } },
      },
      config: { url: '/api/workplans/999' },
    };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(err.response.data.error).toBe('NOT_FOUND');
  });

  it('should expose the message of the canonical envelope as data.error for older callers', async () => {
    const err = {
      response: {
        status: 403,
        data: { success: false, message: 'Insufficient permissions', code: 'FORBIDDEN' },
      },
      config: { url: '/api/workplans' },
    };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(err.response.data).toEqual({ success: false, message: 'Insufficient permissions', code: 'FORBIDDEN', error: 'Insufficient permissions' });
  });

  it('should leave a legacy string-shaped error untouched', async () => {
    const err = {
      response: {
        status: 400,
        data: { error: 'Something blew up' },
      },
      config: { url: '/api/legacy' },
    };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(err.response.data.error).toBe('Something blew up');
    expect(err.response.data.error_obj).toBeUndefined();
  });

  it('should retry a GET network error then reject when it persists', async () => {
    // A network error (no response) on a GET is transient — the interceptor
    // re-issues it via api.request(cfg). When the retry also fails, the error
    // bubbles. (Regression guard for the BAD_GATEWAY resilience work.)
    const err = { message: 'Network Error', config: { url: '/foo', method: 'get' } };
    api.request.mockRejectedValueOnce(err);
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(api.request).toHaveBeenCalledTimes(1);
    expect(err.response).toBeUndefined(); // no crash, no mutation
  });

  it('should NOT retry a network error on a mutation (POST)', async () => {
    const err = { message: 'Network Error', config: { url: '/foo', method: 'post' } };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(api.request).not.toHaveBeenCalled();
  });
});

describe('api.js — silent token refresh on 401', () => {
  it('should refresh the access token and replay the original request on a 401', async () => {
    localStorage.setItem('token', 'expired-jwt');
    localStorage.setItem('refreshToken', 'good-refresh');
    // /auth/refresh returns a fresh access token
    api.post.mockResolvedValueOnce({ data: { accessToken: 'fresh-jwt' } });
    // the replayed request succeeds
    api.request.mockResolvedValueOnce({ data: { ok: true }, status: 200 });

    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/workplans', headers: {} },
    };

    const result = await capturedResponseErr(err);

    expect(api.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'good-refresh' });
    expect(localStorage.getItem('token')).toBe('fresh-jwt');
    expect(api.request).toHaveBeenCalledTimes(1);
    const replayed = api.request.mock.calls[0][0];
    expect(replayed.headers.Authorization).toBe('Bearer fresh-jwt');
    expect(replayed._authRetry).toBe(true);
    expect(result).toEqual({ data: { ok: true }, status: 200 });
    // No logout when refresh succeeds
    expect(hrefSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('refreshToken')).toBe('good-refresh');
  });

  it('should NOT log out when the refresh succeeds but the replayed request fails for a non-auth reason', async () => {
    // Regression for E-1 (intempestive logout): the old interceptor wrapped the
    // refresh AND the replay in one try/catch, so a 403/404/500/transient error
    // on the replayed request force-logged-out a session that had just been
    // successfully renewed. The replay's failure must now bubble up untouched.
    localStorage.setItem('token', 'expired-jwt');
    localStorage.setItem('refreshToken', 'good-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    api.post.mockResolvedValueOnce({ data: { accessToken: 'fresh-jwt' } });
    const replayErr = { response: { status: 403, data: {} }, config: { url: '/api/workplans', headers: {}, _authRetry: true } };
    api.request.mockRejectedValueOnce(replayErr);

    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/workplans', headers: {} },
    };

    await expect(capturedResponseErr(err)).rejects.toBe(replayErr);

    // Refresh ran and the access token was renewed…
    expect(localStorage.getItem('token')).toBe('fresh-jwt');
    // …but a 403 on the replay must NOT clear the session or redirect.
    expect(hrefSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('user')).not.toBeNull();
    expect(localStorage.getItem('refreshToken')).toBe('good-refresh');
  });

  it('should NOT log out on a stray 401 that was never retried and had no recovery attempted (token-mint route)', async () => {
    // A 401 from /auth/refresh itself is handled by the refresh path, never by
    // a blanket fall-through logout. (Guards against the old line-163 catch-all.)
    localStorage.setItem('token', 'tok');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    localStorage.setItem('refreshToken', 'r');
    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/auth/refresh', headers: {} },
    };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(api.post).not.toHaveBeenCalled();
    expect(hrefSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('token')).toBe('tok');
  });

  it('should log out when the refresh call itself fails', async () => {
    localStorage.setItem('token', 'expired-jwt');
    localStorage.setItem('refreshToken', 'bad-refresh');
    localStorage.setItem('user', JSON.stringify({ id: 1 }));
    api.post.mockRejectedValueOnce({ response: { status: 401 } });

    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/workplans', headers: {} },
    };

    await expect(capturedResponseErr(err)).rejects.toBe(err);

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(hrefSpy).toHaveBeenCalledWith('/login?reason=session_expired');
  });

  it('should NOT attempt a refresh when no refreshToken is stored (legacy logout path)', async () => {
    localStorage.setItem('token', 'expired-jwt');
    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/workplans', headers: {} },
    };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(api.post).not.toHaveBeenCalled();
    expect(hrefSpy).toHaveBeenCalledWith('/login?reason=session_expired');
  });

  it('should NOT attempt a refresh on a 401 from /auth/* itself (no recursion)', async () => {
    localStorage.setItem('refreshToken', 'r');
    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/auth/refresh', headers: {} },
    };
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(api.post).not.toHaveBeenCalled();
  });

  it('should replay the original request at most once (no infinite loop)', async () => {
    localStorage.setItem('refreshToken', 'good-refresh');
    api.post.mockResolvedValueOnce({ data: { accessToken: 'fresh-jwt' } });
    // The replayed request 401s AGAIN — but it carries _authRetry, so we must
    // NOT refresh a second time; it should bubble to logout.
    api.request.mockResolvedValueOnce({ data: { ok: true } });
    const err = {
      response: { status: 401, data: {} },
      config: { url: '/api/workplans', headers: {}, _authRetry: true },
    };
    // _authRetry already set → skip refresh, go straight to logout
    await expect(capturedResponseErr(err)).rejects.toBe(err);
    expect(api.post).not.toHaveBeenCalled();
    expect(hrefSpy).toHaveBeenCalledWith('/login?reason=session_expired');
  });
});

describe('api.js — authService refresh token', () => {

  it('should clear the refreshToken on logout', () => {
    localStorage.setItem('token', 'x');
    localStorage.setItem('refreshToken', 'ref');
    authService.logout();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

describe('api.js — authService.logout', () => {
  it('should wipe token + user from localStorage and redirect to /login', () => {
    localStorage.setItem('token', 'x');
    localStorage.setItem('user', 'y');
    authService.logout();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(hrefSpy).toHaveBeenCalledWith('/login');
  });
});

describe('api.js — authService.getCurrentUser', () => {
  it('should return the parsed user row from localStorage', () => {
    localStorage.setItem('user', JSON.stringify({ id: 7, email: 'c@d.com' }));
    expect(authService.getCurrentUser()).toEqual({ id: 7, email: 'c@d.com' });
  });

  it('should return null when there is no stored user', () => {
    expect(authService.getCurrentUser()).toBeNull();
  });

  it('should wipe + return null when stored user is malformed JSON', () => {
    localStorage.setItem('user', '{not valid json');
    expect(authService.getCurrentUser()).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('api.js — authService session helpers', () => {
  it('should report a session only when an access token is stored', () => {
    expect(authService.hasSession()).toBe(false);
    localStorage.setItem('token', 'x');
    expect(authService.hasSession()).toBe(true);
  });

  it('should load the profile from /auth/me and cache it', async () => {
    api.get.mockResolvedValueOnce({ data: { user: { id: 9, email: 'me@x.com' } } });
    await expect(authService.fetchProfile()).resolves.toEqual({ id: 9, email: 'me@x.com' });
    expect(api.get).toHaveBeenCalledWith('/auth/me');
    expect(JSON.parse(localStorage.getItem('user'))).toEqual({ id: 9, email: 'me@x.com' });
  });

  it('should return null and cache nothing when /auth/me sends no user', async () => {
    api.get.mockResolvedValueOnce({ data: {} });
    await expect(authService.fetchProfile()).resolves.toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('should reject a Microsoft session whose profile load sends no user', async () => {
    api.get.mockResolvedValueOnce({ data: {} });
    await expect(authService.completeSsoSession({ accessToken: 'a', refreshToken: 'r' }))
      .rejects.toThrow('SSO profile load returned no user');
    expect(localStorage.getItem('token')).toBe('a');
    expect(localStorage.getItem('refreshToken')).toBe('r');
  });
});
