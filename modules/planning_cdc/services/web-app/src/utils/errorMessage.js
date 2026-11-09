/**
 * Extract a user-friendly error message from an API error.
 * Never shows raw SQL, stack traces, or technical internals.
 */
export function getErrorMessage(err, fallback = 'An unexpected error occurred.') {
  if (!err) return fallback;

  // Axios error with backend payload
  const backendMsg = err?.response?.data?.error || err?.response?.data?.message;
  if (backendMsg && typeof backendMsg === 'string') {
    // Reject anything that looks like SQL or a stack trace
    if (
      backendMsg.includes('select ') ||
      backendMsg.includes('INSERT ') ||
      backendMsg.includes('UPDATE ') ||
      backendMsg.includes('Unknown column') ||
      backendMsg.includes('Error:') ||
      backendMsg.includes('at Object.') ||
      backendMsg.includes('node_modules')
    ) {
      return fallback;
    }
    return backendMsg;
  }

  // HTTP status-based fallbacks
  const status = err?.response?.status;
  if (status === 401) return 'Your session has expired. Please log in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 422) return 'The submitted data is invalid. Please check your inputs.';
  if (status >= 500) return 'A server error occurred. Please try again later.';

  // Network error
  if (err?.message === 'Network Error') return 'Cannot reach the server. Check your connection.';

  return fallback;
}
