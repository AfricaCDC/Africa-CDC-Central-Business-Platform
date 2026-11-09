// ── ErrorBoundary tests ──
//
// The boundary must (1) render children when healthy, (2) catch a render error
// and show a recoverable fallback, (3) reset on "Try again" and when resetKey
// changes, (4) surface a "Reload page" affordance for stale-bundle chunk-load
// failures, and (5) log via the structured logger — never console directly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ErrorBoundary from '../ErrorBoundary';

vi.mock('@/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
import { logger } from '@/utils/logger';

/** Test child that throws on demand. */
function Boom({ error }) {
  if (error) throw error;
  return <div>healthy content</div>;
}

describe('<ErrorBoundary />', () => {
  let consoleErr;

  beforeEach(() => {
    // React logs caught render errors to console.error; silence for clean output.
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleErr.mockRestore();
  });

  it('should render children when no error is thrown', () => {
    render(<ErrorBoundary zone="page"><Boom /></ErrorBoundary>);
    expect(screen.getByText('healthy content')).toBeInTheDocument();
  });

  it('should render the fallback and log when a child throws', () => {
    render(
      <ErrorBoundary zone="page">
        <Boom error={new Error('kaboom')} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(logger.error).toHaveBeenCalledWith(
      'ui.error_boundary',
      expect.objectContaining({ zone: 'page' }),
    );
  });

  it('should show a Reload affordance for chunk-load errors', () => {
    const chunkErr = new Error('Loading chunk 42 failed');
    chunkErr.name = 'ChunkLoadError';
    render(
      <ErrorBoundary zone="page">
        <Boom error={chunkErr} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('This page needs to reload')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('should recover when Try again is clicked after the error clears', () => {
    const { rerender } = render(
      <ErrorBoundary zone="page">
        <Boom error={new Error('boom')} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // The next render of the subtree will be healthy; clicking reset re-mounts it.
    rerender(
      <ErrorBoundary zone="page">
        <Boom />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(screen.getByText('healthy content')).toBeInTheDocument();
  });

  it('should clear the error when resetKey changes', () => {
    const { rerender } = render(
      <ErrorBoundary zone="page" resetKey="/a">
        <Boom error={new Error('boom')} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    rerender(
      <ErrorBoundary zone="page" resetKey="/b">
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('healthy content')).toBeInTheDocument();
  });

  it('should render a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={({ error }) => <div>custom: {error.message}</div>}>
        <Boom error={new Error('nope')} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom: nope')).toBeInTheDocument();
  });
});
