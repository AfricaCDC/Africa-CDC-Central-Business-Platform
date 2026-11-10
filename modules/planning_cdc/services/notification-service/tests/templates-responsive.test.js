/**
 * Every email must fit a phone-width mail client (≈390 px): no fixed width
 * wider than the 600 px card, and no two-column key/value <table> — those are
 * rendered as stacked label/value rows (`kvRow`) since the outbox overflowed on
 * iPhone.
 */

jest.mock('@rbm/lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const { TEMPLATES_BY_KEY } = require('../src/templates');
const { kvRow, kvList } = require('../src/templates/_helpers');

const LONG = 'Number_of_laboratories_participating_in_external_quality_assessment_programmes_0123456789';
const PAYLOAD = {
  code: 'RefLab.5.4-3', title: LONG, reportType: 'Indicator Report', division: LONG, contribOrg: LONG, mainOrg: LONG,
  submittedBy: LONG, submitterName: LONG, approvedBy: LONG, rejectedBy: LONG, reviewedBy: LONG, reason: LONG,
  quarter: 'Q3', fiscalYear: '2026', blockedOrgUnit: LONG, blockedStep: 2, reportId: 42, activityName: LONG,
  entity: { entity_type: 'plan_node', code: 'A.1', title: LONG }, metadata: { actor_name: LONG, note: LONG, reason: LONG },
  user: { first_name: 'Lenny', last_name: 'Tandou' }, count: 1,
  drafts: [{ indicator_code: 'X.1', indicator_title: LONG }], items: [{ indicator_code: 'X.1', indicator_title: LONG }],
};

describe('emails on phones', () => {
  it.each(Object.keys(TEMPLATES_BY_KEY))('%s should use no fixed width above 600px and no key/value table', (key) => {
    const html = TEMPLATES_BY_KEY[key].render(PAYLOAD);
    // `max-width:720px` on the card is fine; a hard `width:` wider than 600 is not.
    for (const m of html.matchAll(/(?<![-\w])width:\s*(\d+)px/g)) expect(Number(m[1])).toBeLessThanOrEqual(600);
    for (const m of html.matchAll(/width="(\d+)"/g)) expect(Number(m[1])).toBeLessThanOrEqual(600);
    expect(html).not.toMatch(/cellpadding="8"/);
    expect(html).not.toMatch(/<td[^>]*width:\s*\d+px/);
  });

  it('should render report-submitted as stacked label/value rows with the long title intact', () => {
    const html = TEMPLATES_BY_KEY['report-submitted'].render(PAYLOAD);
    expect(html).toContain('overflow-wrap:anywhere');
    expect(html).toContain(`<strong>RefLab.5.4-3</strong> — ${LONG}`);
    expect(html).toContain('Submitted by</div>');
    expect(html).toContain('Division</div>');
  });

  it('should omit the optional Division row when the payload has none', () => {
    const html = TEMPLATES_BY_KEY['report-submitted'].render({ ...PAYLOAD, division: '' });
    expect(html).not.toContain('Division</div>');
  });

  it('kvRow should stack the label above the value and kvList should be full width', () => {
    const row = kvRow('Period', 'Q3 2026');
    expect(row.indexOf('Period')).toBeLessThan(row.indexOf('Q3 2026'));
    expect(kvList(row)).toContain('width:100%');
  });
});
