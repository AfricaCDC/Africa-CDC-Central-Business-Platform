// ── NewVersionBanner ──
//
// Fixed banner pinned to the bottom of the viewport. Appears when the
// running bundle has been superseded by a newer build. Offers a single
// action: Reload now. Dismiss keeps the user in the stale build until
// they navigate away (full reload on route change would also pick up
// the new version).

import { useState } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useAppVersionCheck } from '@/hooks/useAppVersionCheck';

export default function NewVersionBanner() {
  const { isStale, reload } = useAppVersionCheck();
  const [dismissed, setDismissed] = useState(false);
  if (!isStale || dismissed) return null;
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-[#1A5632] text-white shadow-lg flex items-center gap-3 px-4 py-2.5 border border-[#14442A]">
      <RefreshCw className="w-4 h-4" />
      <div className="text-[11px]">
        <div className="font-semibold">A new version is available</div>
        <div className="text-white/75 text-[10px]">Reload to get the latest features and fixes.</div>
      </div>
      <button
        type="button"
        onClick={reload}
        className="text-[11px] font-semibold bg-white text-[#1A5632] px-3 py-1 hover:bg-white/90"
      >
        Reload now
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="text-white/70 hover:text-white p-1"
        title="Remind me later"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
