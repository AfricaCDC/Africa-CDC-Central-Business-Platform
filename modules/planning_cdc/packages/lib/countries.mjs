/**
 * @rbm/lib/countries — ESM (D-20261026-05, D-20261028-01).
 *
 * Countries for the web forms and the API: the African Union member states
 * (source: au.int, with their region) — the only ones that can host an Africa
 * CDC country office — and the other countries of the world, which an
 * activity or a report can take place in. A location is stored as text;
 * several places are separated by « ; » (D-20261028-01).
 */

/** AU member states: ISO alpha-3 code, name, region. */
export const AU_MEMBER_STATES = Object.freeze([
  { code: 'DZA', name: 'Algeria', region: 'Northern' },
  { code: 'AGO', name: 'Angola', region: 'Southern' },
  { code: 'BEN', name: 'Benin', region: 'Western' },
  { code: 'BWA', name: 'Botswana', region: 'Southern' },
  { code: 'BFA', name: 'Burkina Faso', region: 'Western' },
  { code: 'BDI', name: 'Burundi', region: 'Eastern' },
  { code: 'CMR', name: 'Cameroon', region: 'Central' },
  { code: 'CPV', name: 'Cabo Verde', region: 'Western' },
  { code: 'CAF', name: 'Central African Republic', region: 'Central' },
  { code: 'TCD', name: 'Chad', region: 'Central' },
  { code: 'COM', name: 'Comoros', region: 'Eastern' },
  { code: 'COG', name: 'Congo (Republic)', region: 'Central' },
  { code: 'COD', name: 'Congo (Democratic Republic)', region: 'Central' },
  { code: 'CIV', name: 'Côte d\'Ivoire', region: 'Western' },
  { code: 'DJI', name: 'Djibouti', region: 'Eastern' },
  { code: 'EGY', name: 'Egypt', region: 'Northern' },
  { code: 'GNQ', name: 'Equatorial Guinea', region: 'Central' },
  { code: 'ERI', name: 'Eritrea', region: 'Eastern' },
  { code: 'SWZ', name: 'Eswatini', region: 'Southern' },
  { code: 'ETH', name: 'Ethiopia', region: 'Eastern' },
  { code: 'GAB', name: 'Gabon', region: 'Central' },
  { code: 'GMB', name: 'Gambia', region: 'Western' },
  { code: 'GHA', name: 'Ghana', region: 'Western' },
  { code: 'GIN', name: 'Guinea', region: 'Western' },
  { code: 'GNB', name: 'Guinea-Bissau', region: 'Western' },
  { code: 'KEN', name: 'Kenya', region: 'Eastern' },
  { code: 'LSO', name: 'Lesotho', region: 'Southern' },
  { code: 'LBR', name: 'Liberia', region: 'Western' },
  { code: 'LBY', name: 'Libya', region: 'Northern' },
  { code: 'MDG', name: 'Madagascar', region: 'Eastern' },
  { code: 'MWI', name: 'Malawi', region: 'Southern' },
  { code: 'MLI', name: 'Mali', region: 'Western' },
  { code: 'MRT', name: 'Mauritania', region: 'Western' },
  { code: 'MUS', name: 'Mauritius', region: 'Eastern' },
  { code: 'MAR', name: 'Morocco', region: 'Northern' },
  { code: 'MOZ', name: 'Mozambique', region: 'Southern' },
  { code: 'NAM', name: 'Namibia', region: 'Southern' },
  { code: 'NER', name: 'Niger', region: 'Western' },
  { code: 'NGA', name: 'Nigeria', region: 'Western' },
  { code: 'RWA', name: 'Rwanda', region: 'Eastern' },
  { code: 'ESH', name: 'Sahrawi Arab Democratic Republic', region: 'Northern' },
  { code: 'STP', name: 'São Tomé and Príncipe', region: 'Central' },
  { code: 'SEN', name: 'Senegal', region: 'Western' },
  { code: 'SYC', name: 'Seychelles', region: 'Eastern' },
  { code: 'SLE', name: 'Sierra Leone', region: 'Western' },
  { code: 'SOM', name: 'Somalia', region: 'Eastern' },
  { code: 'ZAF', name: 'South Africa', region: 'Southern' },
  { code: 'SSD', name: 'South Sudan', region: 'Eastern' },
  { code: 'SDN', name: 'Sudan', region: 'Northern' },
  { code: 'TZA', name: 'Tanzania', region: 'Eastern' },
  { code: 'TGO', name: 'Togo', region: 'Western' },
  { code: 'TUN', name: 'Tunisia', region: 'Northern' },
  { code: 'UGA', name: 'Uganda', region: 'Eastern' },
  { code: 'ZMB', name: 'Zambia', region: 'Southern' },
  { code: 'ZWE', name: 'Zimbabwe', region: 'Southern' },
]);

/** The other countries of the world: ISO alpha-3 code (XKX for Kosovo), name. */
export const OTHER_COUNTRIES = Object.freeze([
  { code: 'AFG', name: 'Afghanistan' },
  { code: 'ALB', name: 'Albania' },
  { code: 'AND', name: 'Andorra' },
  { code: 'ATG', name: 'Antigua and Barbuda' },
  { code: 'ARG', name: 'Argentina' },
  { code: 'ARM', name: 'Armenia' },
  { code: 'AUS', name: 'Australia' },
  { code: 'AUT', name: 'Austria' },
  { code: 'AZE', name: 'Azerbaijan' },
  { code: 'BHS', name: 'Bahamas' },
  { code: 'BHR', name: 'Bahrain' },
  { code: 'BGD', name: 'Bangladesh' },
  { code: 'BRB', name: 'Barbados' },
  { code: 'BLR', name: 'Belarus' },
  { code: 'BEL', name: 'Belgium' },
  { code: 'BLZ', name: 'Belize' },
  { code: 'BTN', name: 'Bhutan' },
  { code: 'BOL', name: 'Bolivia' },
  { code: 'BIH', name: 'Bosnia and Herzegovina' },
  { code: 'BRA', name: 'Brazil' },
  { code: 'BRN', name: 'Brunei' },
  { code: 'BGR', name: 'Bulgaria' },
  { code: 'KHM', name: 'Cambodia' },
  { code: 'CAN', name: 'Canada' },
  { code: 'CHL', name: 'Chile' },
  { code: 'CHN', name: 'China' },
  { code: 'COL', name: 'Colombia' },
  { code: 'CRI', name: 'Costa Rica' },
  { code: 'HRV', name: 'Croatia' },
  { code: 'CUB', name: 'Cuba' },
  { code: 'CYP', name: 'Cyprus' },
  { code: 'CZE', name: 'Czechia' },
  { code: 'DNK', name: 'Denmark' },
  { code: 'DMA', name: 'Dominica' },
  { code: 'DOM', name: 'Dominican Republic' },
  { code: 'ECU', name: 'Ecuador' },
  { code: 'SLV', name: 'El Salvador' },
  { code: 'EST', name: 'Estonia' },
  { code: 'FJI', name: 'Fiji' },
  { code: 'FIN', name: 'Finland' },
  { code: 'FRA', name: 'France' },
  { code: 'GEO', name: 'Georgia' },
  { code: 'DEU', name: 'Germany' },
  { code: 'GRC', name: 'Greece' },
  { code: 'GRD', name: 'Grenada' },
  { code: 'GTM', name: 'Guatemala' },
  { code: 'GUY', name: 'Guyana' },
  { code: 'HTI', name: 'Haiti' },
  { code: 'VAT', name: 'Holy See' },
  { code: 'HND', name: 'Honduras' },
  { code: 'HKG', name: 'Hong Kong' },
  { code: 'HUN', name: 'Hungary' },
  { code: 'ISL', name: 'Iceland' },
  { code: 'IND', name: 'India' },
  { code: 'IDN', name: 'Indonesia' },
  { code: 'IRN', name: 'Iran' },
  { code: 'IRQ', name: 'Iraq' },
  { code: 'IRL', name: 'Ireland' },
  { code: 'ISR', name: 'Israel' },
  { code: 'ITA', name: 'Italy' },
  { code: 'JAM', name: 'Jamaica' },
  { code: 'JPN', name: 'Japan' },
  { code: 'JOR', name: 'Jordan' },
  { code: 'KAZ', name: 'Kazakhstan' },
  { code: 'KIR', name: 'Kiribati' },
  { code: 'XKX', name: 'Kosovo' },
  { code: 'KWT', name: 'Kuwait' },
  { code: 'KGZ', name: 'Kyrgyzstan' },
  { code: 'LAO', name: 'Laos' },
  { code: 'LVA', name: 'Latvia' },
  { code: 'LBN', name: 'Lebanon' },
  { code: 'LIE', name: 'Liechtenstein' },
  { code: 'LTU', name: 'Lithuania' },
  { code: 'LUX', name: 'Luxembourg' },
  { code: 'MAC', name: 'Macao' },
  { code: 'MYS', name: 'Malaysia' },
  { code: 'MDV', name: 'Maldives' },
  { code: 'MLT', name: 'Malta' },
  { code: 'MHL', name: 'Marshall Islands' },
  { code: 'MEX', name: 'Mexico' },
  { code: 'FSM', name: 'Micronesia' },
  { code: 'MDA', name: 'Moldova' },
  { code: 'MCO', name: 'Monaco' },
  { code: 'MNG', name: 'Mongolia' },
  { code: 'MNE', name: 'Montenegro' },
  { code: 'MMR', name: 'Myanmar' },
  { code: 'NRU', name: 'Nauru' },
  { code: 'NPL', name: 'Nepal' },
  { code: 'NLD', name: 'Netherlands' },
  { code: 'NZL', name: 'New Zealand' },
  { code: 'NIC', name: 'Nicaragua' },
  { code: 'PRK', name: 'North Korea' },
  { code: 'MKD', name: 'North Macedonia' },
  { code: 'NOR', name: 'Norway' },
  { code: 'OMN', name: 'Oman' },
  { code: 'PAK', name: 'Pakistan' },
  { code: 'PLW', name: 'Palau' },
  { code: 'PSE', name: 'Palestine' },
  { code: 'PAN', name: 'Panama' },
  { code: 'PNG', name: 'Papua New Guinea' },
  { code: 'PRY', name: 'Paraguay' },
  { code: 'PER', name: 'Peru' },
  { code: 'PHL', name: 'Philippines' },
  { code: 'POL', name: 'Poland' },
  { code: 'PRT', name: 'Portugal' },
  { code: 'QAT', name: 'Qatar' },
  { code: 'ROU', name: 'Romania' },
  { code: 'RUS', name: 'Russia' },
  { code: 'KNA', name: 'Saint Kitts and Nevis' },
  { code: 'LCA', name: 'Saint Lucia' },
  { code: 'VCT', name: 'Saint Vincent and the Grenadines' },
  { code: 'WSM', name: 'Samoa' },
  { code: 'SMR', name: 'San Marino' },
  { code: 'SAU', name: 'Saudi Arabia' },
  { code: 'SRB', name: 'Serbia' },
  { code: 'SGP', name: 'Singapore' },
  { code: 'SVK', name: 'Slovakia' },
  { code: 'SVN', name: 'Slovenia' },
  { code: 'SLB', name: 'Solomon Islands' },
  { code: 'KOR', name: 'South Korea' },
  { code: 'ESP', name: 'Spain' },
  { code: 'LKA', name: 'Sri Lanka' },
  { code: 'SUR', name: 'Suriname' },
  { code: 'SWE', name: 'Sweden' },
  { code: 'CHE', name: 'Switzerland' },
  { code: 'SYR', name: 'Syria' },
  { code: 'TWN', name: 'Taiwan' },
  { code: 'TJK', name: 'Tajikistan' },
  { code: 'THA', name: 'Thailand' },
  { code: 'TLS', name: 'Timor-Leste' },
  { code: 'TON', name: 'Tonga' },
  { code: 'TTO', name: 'Trinidad and Tobago' },
  { code: 'TUR', name: 'Türkiye' },
  { code: 'TKM', name: 'Turkmenistan' },
  { code: 'TUV', name: 'Tuvalu' },
  { code: 'UKR', name: 'Ukraine' },
  { code: 'ARE', name: 'United Arab Emirates' },
  { code: 'GBR', name: 'United Kingdom' },
  { code: 'USA', name: 'United States' },
  { code: 'URY', name: 'Uruguay' },
  { code: 'UZB', name: 'Uzbekistan' },
  { code: 'VUT', name: 'Vanuatu' },
  { code: 'VEN', name: 'Venezuela' },
  { code: 'VNM', name: 'Viet Nam' },
  { code: 'YEM', name: 'Yemen' },
]);

/** Every country, AU member states flagged `au: true`, sorted by name. */
export const WORLD_COUNTRIES = Object.freeze([
  ...AU_MEMBER_STATES.map((c) => ({ ...c, au: true })),
  ...OTHER_COUNTRIES.map((c) => ({ ...c, au: false })),
].sort((a, b) => a.name.localeCompare(b.name)));

/** The five AU geographic regions used to group member states. */
export const AU_REGIONS = Object.freeze(['Central', 'Eastern', 'Southern', 'Northern', 'Western']);

/** Number of AU member states listed. */
export const AU_TOTAL = AU_MEMBER_STATES.length;

/** Places that are not a country, offered before the countries. */
export const SPECIAL_LOCATIONS = Object.freeze(['Addis Ababa (HQ)', 'Virtual']);

/**
 * The AU member state with this ISO 3166-1 alpha-3 code, or null.
 *
 * @param {string} code - e.g. 'KEN'
 * @returns {{ code: string, name: string, region: string }|null}
 * @example countryByCode('KEN') // { code: 'KEN', name: 'Kenya', region: 'Eastern' }
 */
export function countryByCode(code) {
  return AU_MEMBER_STATES.find((c) => c.code === code) || null;
}

const LOCATION_SEPARATOR = ';';

/**
 * Places of a stored location text.
 *
 * @param {string|null|undefined} text - e.g. 'Kenya; Uganda'
 * @returns {string[]} trimmed places, empty ones dropped
 * @example parseLocations('Kenya; Uganda') // ['Kenya', 'Uganda']
 */
export function parseLocations(text) {
  if (!text) return [];
  return String(text).split(LOCATION_SEPARATOR).map((p) => p.trim()).filter(Boolean);
}

/**
 * Location text stored for a list of places (deduplicated), or null when empty.
 *
 * @param {string[]} places
 * @returns {string|null}
 * @example formatLocations(['Kenya', 'Uganda']) // 'Kenya; Uganda'
 */
export function formatLocations(places) {
  const unique = [...new Set((places || []).map((p) => String(p).trim()).filter(Boolean))];
  return unique.length ? unique.join(`${LOCATION_SEPARATOR} `) : null;
}
