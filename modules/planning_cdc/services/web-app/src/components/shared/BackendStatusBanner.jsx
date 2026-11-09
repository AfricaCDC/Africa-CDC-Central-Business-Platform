// ── BackendStatusBanner ──
//
// Global, fixed banner shown when the API backend becomes unreachable
// (502/503/504 or a network error after retries — see services/api.js).
// Its whole reason to exist: users must NEVER see the raw
// `{"success":false,...,"code":"BAD_GATEWAY"}` envelope. Instead they get a
// calm "reconnecting…" bar that auto-clears the moment the backend answers.
//
// Recovery is automatic: while down, we poll the edge `/health` route every
// few seconds. Any 200 means the nginx → gateway → api-server → DB chain is
// alive again, so we hide the banner and tell the app to refetch.

import { useEffect, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';
import { isBackendHealthy } from '@/services/health.api';

const HEALTH_POLL_MS = 6000;

export default function BackendStatusBanner() {
  const [down, setDown] = useState(false);

  // Subscribe to the reachability signals emitted by the axios interceptor.
  useEffect(() => {
    const onDown = () => setDown(true);
    const onUp = () => setDown(false);
    window.addEventListener('api:backend-unreachable', onDown);
    window.addEventListener('api:backend-reachable', onUp);
    return () => {
      window.removeEventListener('api:backend-unreachable', onDown);
      window.removeEventListener('api:backend-reachable', onUp);
    };
  }, []);

  // While down, poll the edge health route. A 200 means the backend is back.
  useEffect(() => {
    if (!down) return undefined;
    let cancelled = false;
    const ping = async () => {
      const healthy = await isBackendHealthy();
      if (!cancelled && healthy) {
        setDown(false);
        // Nudge any data layer listening for recovery to refetch.
        window.dispatchEvent(new CustomEvent('api:backend-reachable'));
      }
    };
    const id = setInterval(ping, HEALTH_POLL_MS);
    ping();
    return () => { cancelled = true; clearInterval(id); };
  }, [down]);

  if (!down) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-[9999] bg-[#B45309] text-white flex items-center justify-center gap-2.5 px-4 py-2 border-b border-[#92400E]"
    >
      <WifiOff className="w-3.5 h-3.5 flex-shrink-0" />
      <span className="text-[11px] font-semibold">Connexion au serveur interrompue</span>
      <span className="text-[10px] text-white/80 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" /> Reconnexion automatique…
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="text-[10px] font-semibold bg-white text-[#92400E] px-2.5 py-0.5 ml-1 hover:bg-white/90"
      >
        Réessayer
      </button>
    </div>
  );
}
