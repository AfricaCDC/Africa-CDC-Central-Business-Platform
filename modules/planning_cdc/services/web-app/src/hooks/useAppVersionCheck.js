// ── useAppVersionCheck ──
//
// Polls /version.json every 60 s and compares the advertised build id
// with the one baked into the running bundle (injected via Vite
// `define.__APP_VERSION__` at build time). When they differ, the caller
// gets `isStale: true` so we can show a dismissible banner prompting
// the user to reload. No data is ever stale — reloading swaps the
// whole bundle in one go.

import { useEffect, useState, useCallback } from 'react';
import { withBase } from '@/utils/basePath';

const CHECK_INTERVAL_MS = 60_000;
// eslint-disable-next-line no-undef
const BUILT_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export function useAppVersionCheck() {
  const [isStale, setIsStale] = useState(false);
  const [latestVersion, setLatestVersion] = useState(null);

  const check = useCallback(async () => {
    try {
      // Bust caches aggressively — we care about fresh bytes, not bandwidth.
      const res = await fetch(`${withBase('/version.json')}?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (!data?.version) return;
      if (data.version !== BUILT_VERSION) {
        setLatestVersion(data.version);
        setIsStale(true);
      }
    } catch { /* offline / gateway hiccup — silent */ }
  }, []);

  useEffect(() => {
    check();
    const t = setInterval(check, CHECK_INTERVAL_MS);
    const onFocus = () => check();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [check]);

  const reload = useCallback(() => {
    // Force-bypass the browser/service-worker cache. Older browsers
    // ignore the boolean; the no-store Cache-Control on index.html
    // + hashed asset URLs do the real work.
    window.location.reload();
  }, []);

  return { isStale, latestVersion, builtVersion: BUILT_VERSION, reload };
}
