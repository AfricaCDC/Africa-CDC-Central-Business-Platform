// ── Vitest setup for the rbm web-app ──
//
// Runs once per worker, after Vitest globals are available, before any
// test file. Three jobs:
//   1. Register the @testing-library/jest-dom custom matchers.
//   2. Auto-cleanup the React DOM after each test.
//   3. Provide global stubs for the central API client and the
//      react-router navigation hook so individual tests don't need to
//      wire up an axios instance or a real <BrowserRouter>.
//
// Tests are free to override any of these mocks locally with
// `vi.mock(...)` at the top of their file.

import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// ── 1. DOM cleanup between tests ────────────────────────────────────
// React Testing Library leaves the rendered tree in jsdom unless we
// unmount it — `cleanup()` makes each test start from a blank page.
afterEach(() => {
  cleanup();
});

// ── 2. Central API client stub ──────────────────────────────────────
// `services/api.js` exports an axios instance shared by every domain
// service file (workplanService, indicatorService, …). Stubbing it at
// the module path means hooks/components that import any domain
// service get a deterministic mock without spinning up a real HTTP
// client.
const makeAxiosStub = () => ({
  get: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
  post: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
  put: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
  patch: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
  delete: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
  request: vi.fn().mockResolvedValue({ data: {}, status: 200 }),
  interceptors: {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  },
});

vi.mock('@/services/api', () => {
  const instance = makeAxiosStub();
  return { __esModule: true, default: instance, api: instance };
});

// Some files import from a relative `../services/api` path instead of
// the alias. We can't mock relative paths in setup, so test authors
// who use relative imports should mock locally in their test file.

// ── 3. react-router-dom navigation stub ─────────────────────────────
// `useNavigate()` returns a callable mock; `useParams()` and
// `useLocation()` return safe defaults. Tests that need real routing
// (e.g. checking redirect behaviour) should re-mock locally with
// `vi.mock('react-router-dom', () => ({ ... }))`.
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({}),
    useLocation: () => ({
      pathname: '/',
      search: '',
      hash: '',
      state: null,
      key: 'test',
    }),
    useSearchParams: () => [new URLSearchParams(), vi.fn()],
  };
});

// ── 4. Quiet jsdom warnings we can't fix ────────────────────────────
// jsdom doesn't implement window.matchMedia, ResizeObserver, or
// IntersectionObserver. Stubbing them prevents Radix UI / lucide
// components from crashing during render.
if (typeof window !== 'undefined') {
  if (!window.matchMedia) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  }
  if (!window.ResizeObserver) {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.IntersectionObserver) {
    window.IntersectionObserver = class {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return []; }
    };
  }
  // jsdom doesn't implement scrollTo — Radix uses it.
  if (!window.scrollTo) {
    window.scrollTo = vi.fn();
  }
}
