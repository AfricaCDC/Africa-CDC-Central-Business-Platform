/**
 * User profile page — available to ALL authenticated users.
 * Shows personal info, division, roles, and account details.
 *
 * Route: /profile
 */

import { useMemo } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useActiveDivision } from '@/contexts/ActiveDivisionContext';
import { DIVISION_ASSIGNMENT_ROLE_LABELS } from '@rbm/lib/user-divisions';
import { User, Mail, Building2, Shield, Calendar, KeyRound } from 'lucide-react';
import { ROLE_LABELS } from '@rbm/lib/roles';

// eslint-disable-next-line complexity -- pre-existing; file touched only for responsive classes, refactor out of scope (25)
export default function ProfilePage() {
  const { user } = useAuth();
  const { roles } = usePermissions();
  const { divisions = [], loaded } = useActiveDivision();

  // The business units the user belongs to (user_divisions, or the legacy
  // users.division_code), primary first; units reached only through a
  // directorate or a contribution are not memberships.
  const myUnits = useMemo(
    () => divisions
      .filter(d => d.junction_roles?.length || d.reasons?.includes('attached'))
      .map(d => ({ ...d, roleLabels: [...new Set((d.junction_roles || []).map(r => DIVISION_ASSIGNMENT_ROLE_LABELS[r] || r))] }))
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    [divisions],
  );
  const primaryUnit = myUnits[0] || null;
  const unitsText = myUnits.map(d => d.division_name || d.code).join(', ');

  if (!user) return null;

  const fullName = user.full_name || `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;
  const initials = fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <DashboardLayout breadcrumbs={[{ label: 'Profile' }]}>
      <div className="space-y-0">

        {/* Hero */}
        <div className="bg-[#1A5632] text-white">
          <div className="px-6 py-6 flex items-center gap-5">
            <div className="w-16 h-16 bg-white/15 border-2 border-white/30 flex items-center justify-center text-[22px] font-bold">
              {initials}
            </div>
            <div>
              <h1 className="text-[18px] font-semibold">{fullName}</h1>
              <p className="text-[12px] text-white/60 mt-0.5">{user.email}</p>
              {primaryUnit && (
                <p className="text-[11px] text-white/50 mt-0.5">{primaryUnit.division_name || primaryUnit.code}</p>
              )}
            </div>
          </div>
        </div>

        {/* Info sections */}
        <div className="bg-white border border-gray-200 border-t-0 px-6 py-5">
          <h2 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide mb-4">Account Information</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-4">
            <InfoRow icon={User} label="Full name" value={fullName} />
            <InfoRow icon={Mail} label="Email" value={user.email} />
            <InfoRow icon={Building2} label="Business units" value={loaded ? unitsText || 'None' : '…'} />
            <InfoRow icon={Calendar} label="Account created" value={user.created_at ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : '—'} />
            <InfoRow icon={Shield} label="User ID" value={`#${user.id}`} />
          </div>
        </div>

        {/* Roles */}
        <div className="bg-white border border-gray-200 border-t-0 px-6 py-5">
          <h2 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide mb-3">Roles & Permissions</h2>
          <div className="flex flex-wrap gap-2">
            {roles.length === 0 && <span className="text-[11px] text-gray-400">No roles assigned</span>}
            {roles.map(r => (
              <span key={r} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#14442A] text-white text-[10px] font-semibold">
                <Shield className="w-3 h-3" />
                {ROLE_LABELS[r] || r}
              </span>
            ))}
          </div>
        </div>

        {/* Business units */}
        {myUnits.length > 0 && (
          <div className="bg-white border border-gray-200 border-t-0 px-6 py-5">
            <h2 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide mb-3">My Business Units ({myUnits.length})</h2>
            <div className="space-y-2">
              {myUnits.map(d => (
                <div key={d.code} className="flex flex-wrap items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <span className="inline-block px-1.5 py-0.5 text-[9px] font-bold bg-[#1A5632] text-white min-w-[60px] text-center">{d.code}</span>
                  <span className="text-[11px] text-gray-800 font-medium flex-1">{d.division_name}</span>
                  {d.parent_code && <span className="text-[10px] text-gray-400">{d.parent_code}</span>}
                  <div className="flex gap-1">
                    {d.is_primary && <span className="text-[8px] font-bold px-1.5 py-0.5 bg-[#14442A] text-white">PRIMARY</span>}
                    {d.roleLabels.map(label => (
                      <span key={label} className="text-[8px] font-bold px-1.5 py-0.5 border border-[#1A5632] text-[#1A5632]">{label.toUpperCase()}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sign-in: Microsoft only, no password (D-20261107-03) */}
        <div className="bg-white border border-gray-200 border-t-0 px-6 py-5">
          <h2 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wide mb-2">Security</h2>
          <p className="text-[11px] text-gray-600 flex items-center gap-1.5">
            <KeyRound className="w-3 h-3 text-[#1A5632]" />
            You sign in with your Africa CDC Microsoft account. There is no separate password for this platform.
          </p>
        </div>
      </div>
    </DashboardLayout>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[9px] text-gray-400 uppercase font-semibold">{label}</p>
        <p className="text-[12px] text-gray-800 font-medium">{value}</p>
      </div>
    </div>
  );
}
