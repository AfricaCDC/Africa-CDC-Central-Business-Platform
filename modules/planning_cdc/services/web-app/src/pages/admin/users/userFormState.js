/**
 * Pure form-state helpers for the admin user create / edit / duplicate modal.
 * No React in here, so each rule can be unit tested directly.
 */

export const TITLE_OPTIONS = ['', 'Mr', 'Mrs', 'Ms', 'Mx', 'Dr.', 'Prof.', 'Eng.', 'Hon.', 'Rev.'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Split a single full-name string into first / middle / last parts.
 *
 * @param {string|null|undefined} fullName
 * @returns {{ first_name: string, middle_name: string, last_name: string }}
 * @example splitFullName('Ada Kwame Mensah') // { first_name: 'Ada', middle_name: 'Kwame', last_name: 'Mensah' }
 */
export function splitFullName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: '', middle_name: '', last_name: '' };
  if (parts.length === 1) return { first_name: parts[0], middle_name: '', last_name: '' };
  return {
    first_name: parts[0],
    middle_name: parts.slice(1, -1).join(' '),
    last_name: parts[parts.length - 1],
  };
}

/**
 * Name fields to show for an existing user. Structured fields win. When both
 * first and last name are empty (rows created by the CBP import before the
 * split existed) the name is recovered from full_name, so the admin always
 * sees the person's name.
 *
 * @param {object} user — admin users list row
 * @returns {{ first_name: string, middle_name: string, last_name: string }}
 * @example resolveNameParts({ full_name: 'Ada Mensah' }).last_name // 'Mensah'
 */
export function resolveNameParts(user) {
  const structured = {
    first_name: user.first_name || '',
    middle_name: user.middle_name || '',
    last_name: user.last_name || '',
  };
  if (structured.first_name || structured.last_name) return structured;
  return splitFullName(user.full_name);
}

/**
 * Role ids currently attached to a user row.
 *
 * @param {object|null|undefined} user
 * @returns {number[]}
 * @example roleIdsOf({ roles: [{ id: 3, code: 'PLANNER' }] }) // [3]
 */
export function roleIdsOf(user) {
  return (user?.roles || []).map((r) => (typeof r === 'object' ? r.id : null)).filter(Boolean);
}

/**
 * Initial form values for a given modal mode.
 *
 * @param {'create'|'edit'|'duplicate'} mode
 * @param {object|null} user — row being edited or duplicated
 * @returns {object} form state
 * @example buildInitialForm('create', null).status // 'ACTIVE'
 */
function blankForm() {
  return {
    title: '', first_name: '', middle_name: '', last_name: '', email: '',
    division_code: '', user_type: 'STAFF', status: 'ACTIVE', role_ids: [],
  };
}

/** Classification fields copied from a row (shared by edit and duplicate). */
function classificationOf(user) {
  return {
    title: user.title || '',
    division_code: user.division_code || '',
    user_type: user.user_type || 'STAFF',
    role_ids: roleIdsOf(user),
  };
}

export function buildInitialForm(mode, user) {
  if (!user || mode === 'create') return blankForm();
  if (mode === 'edit') {
    return {
      ...blankForm(),
      ...classificationOf(user),
      ...resolveNameParts(user),
      email: user.email || '',
      status: user.status || 'ACTIVE',
    };
  }
  // duplicate: copy the classification, not the identity
  return { ...blankForm(), ...classificationOf(user) };
}

/**
 * First human-readable problem with the form, or null when Save may proceed.
 * Only the Save path calls this; Cancel and close never do.
 *
 * @param {object} form
 * @returns {string|null}
 * @example validateUserForm({ ...blankForm, first_name: '' }) // 'First name, last name and email are required.'
 */
export function validateUserForm(form) {
  if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
    return 'First name, last name and email are required.';
  }
  if (!EMAIL_PATTERN.test(form.email.trim())) return 'Enter a valid email address.';
  return null;
}

/**
 * Request body for POST / PUT /admin/users.
 *
 * @param {object} form — validated form state
 * @returns {object}
 * @example buildUserPayload({ ...form, email: ' A@X.org ' }).email // 'a@x.org'
 */
export function buildUserPayload(form) {
  const payload = {
    title: form.title || null,
    first_name: form.first_name.trim(),
    middle_name: form.middle_name.trim() || null,
    last_name: form.last_name.trim(),
    email: form.email.trim().toLowerCase(),
    user_type: form.user_type,
    status: form.status,
    division_code: form.division_code || null,
  };
  return payload;
}

/**
 * Title select options, keeping a stored title that is not in the list
 * (e.g. "Dr" vs "Dr.") selectable so it is not silently replaced.
 *
 * @param {string} current
 * @returns {string[]}
 * @example titleOptionsFor('Dr') // [...TITLE_OPTIONS, 'Dr']
 */
export function titleOptionsFor(current) {
  if (!current || TITLE_OPTIONS.includes(current)) return TITLE_OPTIONS;
  return [...TITLE_OPTIONS, current];
}
