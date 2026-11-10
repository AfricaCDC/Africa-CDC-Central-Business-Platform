// ── plan-nodes _helpers.pickEditableFields — contributing_divisions ──
//
// D-20260708-01: contributing_divisions is whitelisted on specific
// activities so admins can declare which divisions may contributor-report.
// The column is TEXT holding a JSON array — pickEditableFields must
// serialise arrays and null-out anything else.

const sharedDb = global.__makeKnexMock();
const knex = require('knex');
knex.mockReturnValue(sharedDb);

const { pickEditableFields, EDITABLE_FIELDS } = require('../../src/routes/plan-nodes/_helpers');

describe('pickEditableFields — contributing_divisions', () => {
  it('should whitelist contributing_divisions', () => {
    expect(EDITABLE_FIELDS).toContain('contributing_divisions');
  });

  it('should serialise an array to its JSON string form', () => {
    const out = pickEditableFields({ title: 'X', contributing_divisions: ['CPI', 'WHC'] });
    expect(out.contributing_divisions).toBe('["CPI","WHC"]');
  });

  it('should serialise an empty array to "[]" (explicit clear keeps a list)', () => {
    const out = pickEditableFields({ contributing_divisions: [] });
    expect(out.contributing_divisions).toBe('[]');
  });

  it('should null-out non-array values', () => {
    expect(pickEditableFields({ contributing_divisions: null }).contributing_divisions).toBeNull();
    expect(pickEditableFields({ contributing_divisions: 'CPI' }).contributing_divisions).toBeNull();
  });

  it('should leave the key absent when not sent (PATCH partial semantics)', () => {
    const out = pickEditableFields({ title: 'X' });
    expect(Object.prototype.hasOwnProperty.call(out, 'contributing_divisions')).toBe(false);
  });
});

describe('pickEditableFields — secondary_division_codes (D-20261026-02)', () => {
  it('should store the secondary divisions as a deduplicated JSON array', () => {
    expect(EDITABLE_FIELDS).toContain('secondary_division_codes');
    const out = pickEditableFields({ secondary_division_codes: ['EPR', ' SCI ', 'EPR', '', 7] });
    expect(out.secondary_division_codes).toBe('["EPR","SCI"]');
  });

  it('should null-out a value that is not an array', () => {
    expect(pickEditableFields({ secondary_division_codes: 'EPR' }).secondary_division_codes).toBeNull();
  });
});
