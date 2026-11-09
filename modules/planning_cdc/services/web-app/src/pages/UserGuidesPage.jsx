import { Download, FileText } from 'lucide-react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { USER_GUIDES, USER_GUIDES_VERSION, guideUrl } from '@/config/userGuides';

/**
 * User guides, one per role, to read or download (D-20261105-03).
 *
 * @returns {JSX.Element}
 * @example <Route path="/user-guides" element={<UserGuidesPage />} />
 */
export default function UserGuidesPage() {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Home', path: '/' }, { label: 'User guides' }]}>
      <div className="max-w-3xl space-y-4">
        <div>
          <h1 className="text-[18px] font-semibold text-[#1A5632]">User guides</h1>
          <p className="text-[11px] text-gray-500">One guide per role, version {USER_GUIDES_VERSION}. Open it in the browser or download the PDF.</p>
        </div>
        <ul className="divide-y divide-gray-100 border border-gray-200 bg-white">
          {USER_GUIDES.map((g) => (
            <li key={g.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-[#1A5632]" aria-hidden />
                <div>
                  <p className="text-[12px] font-semibold text-gray-900">{g.title}</p>
                  <p className="text-[11px] text-gray-600">{g.audience}</p>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <a href={guideUrl(g)} target="_blank" rel="noopener noreferrer"
                  className="border border-gray-300 px-3 py-1.5 text-[11px] text-gray-700 hover:bg-gray-50">Open</a>
                <a href={guideUrl(g)} download={g.file}
                  className="flex items-center gap-1.5 bg-[#1A5632] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#14452a]">
                  <Download className="h-3.5 w-3.5" aria-hidden /> Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </DashboardLayout>
  );
}
