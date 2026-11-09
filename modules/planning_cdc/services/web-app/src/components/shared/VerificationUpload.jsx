/* eslint-disable no-unused-vars, complexity, cdc-rbm/no-useeffect-fetch -- pre-existing legacy, tracked. `no-api-url-in-component` dropped: the rule no longer fires here and the stale directive tripped the --max-warnings 0 pre-commit gate. */
import React, { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import api from '@/services/api';
import { toast } from 'sonner';

const fmtSize = (bytes) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Shared file upload component for Means of Verification.
 * Uploads to Power Automate via backend proxy, stores reference in evidence_files.
 *
 * @param {object} props
 * @param {number|null} props.reportId - ID of the parent report (activity_report or indicator_report)
 * @param {string} props.parentType - 'activity_report' | 'indicator_report'
 * @param {string} props.reportType - SharePoint folder label, e.g. 'Specific Activities' | 'Quarterly Reports'
 * @param {object} props.entity - The plan_node / indicator object (needs .code, .title, .division)
 * @param {string} props.fiscalYear
 * @param {boolean} props.readOnly
 * @param {(count: number) => void} [props.onFilesChange] - Called with the
 *   number of attached files after every load / upload / delete. Lets the
 *   parent form gate submission on "at least one verification file".
 */
export default function VerificationUpload({ reportId, parentType, reportType, entity, fiscalYear, readOnly, onFilesChange }) {
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Report the count to the parent after every commit — load, upload AND
  // delete all flow through `files`, so one effect covers them. A submit gate
  // reading a stale count would either block a valid report or let an
  // evidence-less one through. Notifying from inside a setState updater would
  // set parent state during render, hence the effect.
  useEffect(() => {
    if (onFilesChange) onFilesChange(files.length);
    // `onFilesChange` is typically an inline arrow — depending on it would
    // re-notify on every parent render, so the file list alone drives this.
  }, [files.length]); // eslint-disable-line react-hooks/exhaustive-deps -- see comment above

  const doDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id || confirmDelete.file_id;
    setDeleting(true);
    try {
      await api.delete(`/reporting/evidence/${id}`);
      setFiles(prev => prev.filter(x => (x.id || x.file_id) !== id));
      toast.success('File deleted');
      setConfirmDelete(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    if (!reportId) return;
    api.get(`/reporting/evidence/${parentType}/${reportId}`)
      .then(r => setFiles(Array.isArray(r.data) ? r.data : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [reportId, parentType]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error('File too large (max 20 MB)'); return; }

    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const divName = entity?.division?.name || entity?.responsible_division_code || 'Unknown';
      const entityName = entity?.code ? `${entity.code} - ${(entity.title || '').slice(0, 60)}` : 'report';

      const { data } = await api.post('/reporting/upload-verification', {
        file_base64: base64,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        parent_type: parentType,
        parent_id: reportId || 0,
        activity_code: entity?.code || '',
        activity_name: entityName,
        division_name: divName,
        report_type: reportType,
        fiscal_year: fiscalYear,
      });

      toast.success(`Uploaded: ${file.name}`);
      setFiles(prev => [...prev, {
        file_id: data.data?.file_id,
        original_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        file_url: data.data?.sharepoint_url || null,
        created_at: new Date().toISOString(),
      }]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 pt-1">
        <span className="inline-flex items-center justify-center w-6 h-6 text-[9px] font-bold bg-purple-600 text-white">
          F
        </span>
      </div>
      <div className="flex-1">
        <label className="text-[10px] font-semibold text-gray-700 uppercase tracking-wide block mb-1.5">
          Verification Files
        </label>

        {!readOnly && (
          <div className="mb-2 px-3 py-2 bg-amber-50 border-l-2 border-amber-400 text-[10px] text-amber-900 leading-snug">
            <span className="font-semibold">Please upload PDF files whenever possible.</span>
            {' '}PDFs preserve layout across devices, are tamper-resistant (reviewers can't accidentally edit them),
            load faster in SharePoint, and work everywhere without needing Word or Excel.
            Word / Excel / PowerPoint files are accepted but will be converted to PDF on upload — original formatting may shift.
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-1 mb-2">
            {files.map((f, i) => (
              <div key={f.id || f.file_id || i} className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border border-gray-200 text-[10px]">
                <span className="text-purple-600 font-bold">{i + 1}.</span>
                {f.file_url ? (
                  <a href={f.file_url} target="_blank" rel="noopener noreferrer" className="text-purple-700 font-medium flex-1 truncate hover:underline">{f.original_name}</a>
                ) : (
                  <span className="text-gray-800 font-medium flex-1 truncate">{f.original_name}</span>
                )}
                <span className="text-gray-400">{fmtSize(f.file_size)}</span>
                <span className="text-gray-400">{f.created_at ? new Date(f.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}</span>
                {!readOnly && (f.id || f.file_id) && (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(f)}
                    className="p-1 text-gray-400 hover:text-red-600"
                    title="Delete file"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {files.length === 0 && loaded && (
          <p className="text-[10px] text-gray-400 mb-2">No files uploaded yet</p>
        )}

        {!readOnly && (
          <label className={`inline-flex items-center gap-1.5 text-[10px] px-3 py-1.5 border border-dashed cursor-pointer ${
            uploading ? 'border-gray-300 text-gray-400' : 'border-purple-300 text-purple-600 hover:bg-purple-50'
          }`}>
            {uploading ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Uploading...</>
            ) : (
              <>+ Upload file (PDF, image, doc — max 20 MB)</>
            )}
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif" />
          </label>
        )}
      </div>
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => (!deleting ? setConfirmDelete(null) : null)}
        >
          <div className="bg-white max-w-sm w-full shadow-lg" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Delete verification file</div>
              <div className="text-[13px] font-semibold text-gray-800 truncate">{confirmDelete.original_name}</div>
            </div>
            <div className="px-5 py-4 text-[11px] text-gray-600">
              This will permanently remove the file reference from this report. The underlying SharePoint copy stays intact.
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="px-3 py-1.5 text-[11px] border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >Cancel</button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="px-3 py-1.5 text-[11px] bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleting && <Loader2 className="w-3 h-3 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
