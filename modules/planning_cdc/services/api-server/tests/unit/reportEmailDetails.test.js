// ── reportEmailDetails — report content for notification emails (D-20261013-07) ──
//
// Mocks: the shared chainable knex mock from tests/setup.js (db.__chain).

const db = require('../../src/config/db');
const { activityReportEmail, indicatorReportEmail, attachmentsOf, text } = require('../../src/services/reporting/reportEmailDetails');

const evidence = (rows) => db.__chain.then.mockImplementationOnce((r) => Promise.resolve(rows).then(r));

beforeEach(() => {
  jest.clearAllMocks();
  db.__chain.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  db.__chain.first.mockReset().mockResolvedValue(undefined);
});

describe('text', () => {
  it('should join a JSON list and keep plain text', () => {
    expect(text('["Late venue","No budget"]')).toBe('Late venue; No budget');
    expect(text('Plain [not json')).toBe('Plain [not json');
    expect(text(null)).toBe('');
    expect(text(0)).toBe('0');
  });
});

describe('attachmentsOf', () => {
  it('should keep only http(s) links, with a fallback name', async () => {
    evidence([
      { original_name: 'list.pdf', file_url: 'https://x.sharepoint.com/list.pdf' },
      { original_name: 'local', file_url: '/uploads/a.pdf' },
      { original_name: null, file_url: 'http://x/b.png' },
      { original_name: 'evil', file_url: 'javascript:alert(1)' },
    ]);
    await expect(attachmentsOf('activity_report', 12)).resolves.toEqual([
      { name: 'list.pdf', url: 'https://x.sharepoint.com/list.pdf' },
      { name: 'Attachment', url: 'http://x/b.png' },
    ]);
    expect(db).toHaveBeenCalledWith('evidence_files');
  });
});

describe('activityReportEmail', () => {
  it('should carry the filled fields, the attachments and an absolute report link', async () => {
    evidence([{ original_name: 'photo.jpg', file_url: 'https://x/photo.jpg' }]);
    const m = await activityReportEmail({
      report: { id: 12, plan_node_id: 4, quarter: 'Q3', fiscal_year: '2026', location: 'Nairobi', achievements: 'Trained 40', challenges: '', start_date: '2026-09-01', end_date: '2026-09-05', actual_spend: '0.00' },
      node: { code: '1.2.3.1', title: 'EQA workshop', responsible_division_code: 'DHIS' },
      submittedBy: 'Jane Doe',
    });
    expect(m).toMatchObject({ reportType: 'Activity Report', code: '1.2.3.1', division: 'DHIS', quarter: 'Q3', submittedBy: 'Jane Doe' });
    expect(m.reportUrl).toMatch(/^https?:\/\/.+\/activity-report\/4\/report\/12$/);
    expect(m.fields).toEqual(expect.arrayContaining([
      { label: 'Location', value: 'Nairobi' },
      { label: 'Achievements', value: 'Trained 40' },
      { label: 'Dates', value: '2026-09-01 to 2026-09-05' },
    ]));
    expect(m.fields.find((f) => f.label === 'Challenges')).toBeUndefined();
    expect(m.attachments).toEqual([{ name: 'photo.jpg', url: 'https://x/photo.jpg' }]);
  });
});

describe('activityReportEmail — not started yet (D-20261013-08)', () => {
  it('should say the activity has not started and when it should', async () => {
    const m = await activityReportEmail({
      report: { id: 1, plan_node_id: 2, quarter: 'Q3', fiscal_year: '2026', not_started: 1, expected_start_quarter: 'Q1', expected_start_year: '2027' },
      node: { code: 'X' },
      submittedBy: 'Jane',
    });
    expect(m.fields[0]).toEqual({ label: 'Activity status', value: 'Not started yet, expected to start in Q1 2027' });
  });
});

describe('indicatorReportEmail', () => {
  it('should show the quarter target, achievement and the submitter from the users row', async () => {
    db.__chain.first.mockResolvedValueOnce({ first_name: 'Moses', last_name: 'Bamutura' });
    const m = await indicatorReportEmail({
      report: { id: 9, plan_node_id: 6119, division_code: 'KM', quarter: 'Q3', fiscal_year: '2026', actual_value: 45, narrative: 'Done', submitted_by: 3 },
      node: { code: 'KM.10.3-7', title: 'Researchers', q3_target_numeric: 35 },
      actor: { id: 3 },
    });
    expect(m.submittedBy).toBe('Moses Bamutura');
    expect(m.fields).toEqual([
      { label: 'Q3 target', value: '35' },
      { label: 'Achievement', value: '45' },
      { label: 'Narration', value: 'Done' },
    ]);
    expect(m.reportUrl).toMatch(/\/quarterly-report\/6119\?q=Q3&division=KM&fy=2026$/);
  });
});
