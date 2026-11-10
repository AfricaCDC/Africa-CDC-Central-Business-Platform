import { SPECIAL_LOCATIONS, WORLD_COUNTRIES } from '@rbm/lib/countries';

const SPECIAL_SUBS = { 'Addis Ababa (HQ)': 'Headquarters', Virtual: 'Remote' };

/**
 * Places an activity or a report can take place in (D-20261028-01):
 * headquarters, virtual, then every country of the world (AU member states
 * marked with their region). The value stored is the place name.
 *
 * @type {Array<{ value: string, label: string, sub: string }>}
 */
export const LOCATION_OPTIONS = [
  ...SPECIAL_LOCATIONS.map((p) => ({ value: p, label: p, sub: SPECIAL_SUBS[p] || '' })),
  ...WORLD_COUNTRIES.map((c) => ({ value: c.name, label: c.name, sub: c.au ? `African Union · ${c.region}` : '' })),
];
