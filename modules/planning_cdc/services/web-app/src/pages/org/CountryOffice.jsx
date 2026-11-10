import { MapPin } from 'lucide-react';
import { AU_MEMBER_STATES, countryByCode } from '@rbm/lib/countries';
import SearchSelect from '@/components/shared/SearchSelect';

const NOT_AN_OFFICE = '';
const OPTIONS = [
  { value: NOT_AN_OFFICE, label: 'Not a country office' },
  ...AU_MEMBER_STATES.map((c) => ({ value: c.code, label: c.name, sub: c.region })),
];

/**
 * « Country office · Kenya » badge of an org unit marked as a country office
 * (D-20261026-05); nothing otherwise.
 *
 * @param {{ unit: { is_country_office?: boolean|number, country_code?: string|null }, onDark?: boolean }} props
 * @returns {JSX.Element|null}
 * @example <CountryOfficeBadge unit={node} />
 */
export function CountryOfficeBadge({ unit, onDark = false }) {
  if (!unit?.is_country_office) return null;
  const country = countryByCode(unit.country_code)?.name || unit.country_code;
  const tone = onDark ? 'bg-white/15 text-white border-white/30' : 'bg-sky-50 text-sky-800 border-sky-200';
  return (
    <span className={`inline-flex items-center gap-1 border px-1.5 py-0.5 text-[9px] font-bold ${tone}`}>
      <MapPin className="h-2.5 w-2.5" aria-hidden="true" />
      Country office{country ? ` · ${country}` : ''}
    </span>
  );
}

/**
 * Single field that marks an org unit as the country office of one AU member
 * state, or as not a country office.
 *
 * @param {{ unit: { is_country_office?: boolean|number, country_code?: string|null }, onChange: (patch: { is_country_office: boolean, country_code: string|null }) => void, disabled?: boolean }} props
 * @returns {JSX.Element}
 * @example <CountryOfficePicker unit={data} onChange={submitCountryOffice} />
 */
export function CountryOfficePicker({ unit, onChange, disabled = false }) {
  const value = unit?.is_country_office ? unit.country_code : NOT_AN_OFFICE;
  const handleChange = (code) => onChange(code
    ? { is_country_office: true, country_code: code }
    : { is_country_office: false, country_code: null });
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide">Country office</span>
      <div className="w-56 max-w-full text-gray-800">
        <SearchSelect value={value} options={OPTIONS} onChange={handleChange} disabled={disabled} placeholder="Country office…" />
      </div>
    </div>
  );
}

/**
 * Create-dialog fields of a country office (D-20261028-01): tick « Country
 * office », pick the AU member state; the code (« COD-CO ») and the name
 * (« Congo (Democratic Republic) Country Office ») are generated.
 *
 * @param {{ isCountryOffice: boolean, onToggle: (checked: boolean) => void, country: string, onCountry: (code: string) => void }} props
 * @returns {JSX.Element}
 * @example <CountryOfficeFields isCountryOffice={on} onToggle={setOn} country={code} onCountry={setCode} />
 */
export function CountryOfficeFields({ isCountryOffice, onToggle, country, onCountry }) {
  const chosen = countryByCode(country);
  return (
    <div className="space-y-2 border border-gray-200 bg-gray-50 px-3 py-2">
      <label className="flex cursor-pointer items-center gap-2 text-[11px] font-semibold text-gray-700">
        <input type="checkbox" checked={isCountryOffice} onChange={(e) => onToggle(e.target.checked)} className="accent-[#1A5632]" />
        Country office
      </label>
      {isCountryOffice && (
        <>
          <SearchSelect value={country || null} options={OPTIONS.filter((o) => o.value)} onChange={(v) => onCountry(v || '')} placeholder="— Select the country —" />
          {chosen && (
            <p className="text-[10px] text-gray-500">
              Will be created as <strong className="text-gray-800">{chosen.name} Country Office</strong>
              <span className="ml-1 font-mono text-gray-400">({chosen.code}-CO)</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
