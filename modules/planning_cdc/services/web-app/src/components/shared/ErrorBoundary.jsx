import { Component } from 'react';
import { AlertTriangle, RotateCw } from 'lucide-react';
import { logger } from '@/utils/logger';

/**
 * Detect a lazy-chunk load failure (stale hashed bundle after a deploy, or a
 * transient network blip while fetching a code-split route). These present as a
 * thrown error during render of a `React.lazy` boundary and are recoverable by
 * a hard reload, so we surface a "Reload" affordance rather than a plain retry.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isChunkLoadError(error) {
  const name = error?.name || '';
  const message = error?.message || '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [\d]+ failed/i.test(message) ||
    /failed to fetch dynamically imported module/i.test(message) ||
    /importing a module script failed/i.test(message)
  );
}

/**
 * Reusable React error boundary. Catches render-time errors in its subtree and
 * renders a recoverable fallback instead of letting the whole app go blank
 * (CLAUDE.md §10 — "Users should never see a blank white screen").
 *
 * - Logs the error via the structured logger (never `console`).
 * - Offers "Try again" (re-mounts the subtree) and, for stale-bundle / network
 *   chunk failures, a "Reload page" action.
 * - `resetKey` lets a parent force a reset when it changes (e.g. on route
 *   change) so navigating away from a broken page clears the error.
 * - `zone` is a short label used in the fallback copy and the log record so we
 *   can tell which functional area failed (e.g. "page", "sidebar").
 *
 * @example
 * <ErrorBoundary zone="page" resetKey={location.pathname}>
 *   <Routes>…</Routes>
 * </ErrorBoundary>
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.handleReset = this.handleReset.bind(this);
    this.handleReload = this.handleReload.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidUpdate(prevProps) {
    // A changed resetKey (e.g. the route pathname) clears a stale error so the
    // next page renders normally instead of inheriting the previous crash.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error, info) {
    logger.error('ui.error_boundary', {
      zone: this.props.zone || 'unknown',
      err: { name: error?.name, message: error?.message },
      componentStack: info?.componentStack,
    });
  }

  handleReset() {
    this.setState({ error: null });
  }

  handleReload() {
    window.location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (typeof this.props.fallback === 'function') {
      return this.props.fallback({ error, reset: this.handleReset });
    }

    const chunkError = isChunkLoadError(error);
    const title = chunkError ? 'This page needs to reload' : 'Something went wrong';
    const detail = chunkError
      ? 'A newer version of the app is available, or the connection dropped while loading this page.'
      : 'We hit an unexpected error while displaying this page. You can try again — your data is safe.';

    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6" role="alert">
        <div className="bg-white border border-gray-200 px-8 py-10 max-w-md w-full text-center">
          <AlertTriangle className="w-9 h-9 text-[#1A5632] mx-auto mb-4" />
          <h2 className="text-[16px] font-semibold text-gray-800">{title}</h2>
          <p className="text-[12px] text-gray-500 mt-2">{detail}</p>
          <div className="flex items-center justify-center gap-2 mt-6">
            {chunkError ? (
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[12px] px-4 py-2 hover:bg-[#14492a]"
              >
                <RotateCw className="w-3.5 h-3.5" /> Reload page
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={this.handleReset}
                  className="inline-flex items-center gap-1.5 bg-[#1A5632] text-white text-[12px] px-4 py-2 hover:bg-[#14492a]"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Try again
                </button>
                <button
                  type="button"
                  onClick={this.handleReload}
                  className="text-[12px] text-gray-500 px-4 py-2 border border-gray-200 hover:bg-gray-50"
                >
                  Reload page
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
