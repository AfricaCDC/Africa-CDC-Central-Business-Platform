import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import api from '@/services/api';

/**
 * Tracks every SPA page navigation by POSTing to the audit endpoint.
 * Mounted once in DashboardLayout so it only fires for authenticated pages.
 *
 * Fire-and-forget: errors are silently swallowed so audit never disrupts UX.
 *
 * @returns {void}
 * @example
 * // Inside DashboardLayout component body:
 * usePageTracker();
 */
export default function usePageTracker() {
  const location = useLocation();

  useEffect(() => {
    api
      .post('/governance/page-view', {
        path: location.pathname,
        search: location.search,
        timestamp: new Date().toISOString(),
      })
      .catch(() => {});
  }, [location.pathname, location.search]);
}
