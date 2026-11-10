// ── "Import CBP users" button (D-20260713-01) ──
//
// Runs one synchronous import (POST /api/admin/import-cbp-users) through a
// React Query mutation. The request can take up to ~1-2 minutes, so the button
// shows an in-progress state for its whole duration and reports the outcome as
// a toast: counts on success, a readable message on failure.

import { Loader2, RefreshCw } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { staffService } from '@/services/staffService';
import { describeCbpImportError, formatCbpImportSummary } from './cbpImportMessages';

/**
 * Admin button that pulls the CBP staff directory into platform users.
 *
 * On success it refreshes the admin users list (same query key as AdminUsersPage).
 *
 * @returns {JSX.Element}
 * @example <CbpImportButton />
 */
export default function CbpImportButton() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => staffService.importCbpUsers(),
    onSuccess: (summary) => {
      const base = formatCbpImportSummary(summary);
      if (summary?.failed > 0) toast.warning(`${base} — ${summary.failed} could not be imported, see the server logs`);
      else toast.success(base);
      queryClient.invalidateQueries({ queryKey: ['admin', 'users-page'] });
    },
    onError: (err) => toast.error(describeCbpImportError(err)),
  });

  const isImporting = mutation.isPending;
  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={isImporting}
      title="Pull the CBP staff directory and create/update the matching platform users"
      className="ml-auto text-[11px] px-3 py-1.5 border border-[#1A5632] text-[#1A5632] hover:bg-[#1A5632] hover:text-white disabled:opacity-50 flex items-center gap-1.5"
    >
      {isImporting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
      {isImporting ? 'Importing… (up to 2 min)' : 'Import CBP users'}
    </button>
  );
}
