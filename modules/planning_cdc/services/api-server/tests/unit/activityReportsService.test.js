// ── activityReportsService unit tests (D-20260818-01) ──
//
// The single write path for activity reports: POST always inserts, PUT
// updates by primary key. There is no (plan_node_id, quarter, fiscal_year)
// upsert any more — two reports on the same tuple are two independent rows.
//
// Mocks: the shared chainable knex mock from tests/setup.js (db.__chain).

const { STATUSES, MISSION_TYPES } = require('@rbm/lib/enums');

const svc = require('../../src/services/reporting/activityReportsService');
const db = require('../../src/config/db');

function resetChain() {
  const c = db.__chain;
  c.first.mockReset().mockResolvedValue(undefined);
  c.insert.mockReset().mockResolvedValue([1]);
  c.update.mockReset().mockResolvedValue(1);
  c.then.mockReset().mockImplementation((r) => Promise.resolve([]).then(r));
  c.where.mockReset().mockReturnValue(c);
  c.orderBy.mockReset().mockReturnValue(c);
}

beforeEach(() => {
  resetChain();
  jest.clearAllMocks();
});

// ── createReport ──────────────────────────────────────────────────────────────
describe('activityReportsService.createReport', () => {
  it('always inserts a new row — two calls on the same tuple create two rows', async () => {
    db.__chain.insert
      .mockResolvedValueOnce([11]) // insert #1
      .mockResolvedValueOnce([12]); // insert #2
    db.__chain.first
      .mockResolvedValueOnce({ activity_type: null }) // activity #1
      .mockResolvedValueOnce({ id: 11, status: STATUSES.DRAFT }) // readback #1
      .mockResolvedValueOnce({ activity_type: null }) // activity #2
      .mockResolvedValueOnce({ id: 12, status: STATUSES.DRAFT }); // readback #2

    const a = await svc.createReport({
      data: { plan_node_id: 5, quarter: 'Q3', fiscal_year: '2026' }, userId: 7,
    });
    const b = await svc.createReport({
      data: { plan_node_id: 5, quarter: 'Q3', fiscal_year: '2026' }, userId: 8,
    });

    expect(a.id).toBe(11);
    expect(b.id).toBe(12);
    const inserted = db.__chain.insert.mock.calls;
    expect(inserted).toHaveLength(2);
    expect(inserted[0][0].status).toBe(STATUSES.DRAFT);
    expect(inserted[0][0].user_id).toBe(7);
    expect(inserted[1][0].user_id).toBe(8);
  });

  it('should take the activity and mission type from the activity, whatever the payload says', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ activity_type: MISSION_TYPES.EVENT })
      .mockResolvedValueOnce({ id: 13, status: STATUSES.DRAFT });
    await svc.createReport({ data: { plan_node_id: 5, quarter: 'Q3', mission_type: MISSION_TYPES.TRAINING }, userId: 7 });
    expect(db.__chain.insert.mock.calls[0][0].mission_type).toBe(MISSION_TYPES.EVENT);
  });

  it('should keep the report value for a legacy activity without a type', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ activity_type: null })
      .mockResolvedValueOnce({ id: 14, status: STATUSES.DRAFT });
    await svc.createReport({ data: { plan_node_id: 5, quarter: 'Q3', mission_type: MISSION_TYPES.TRAINING }, userId: 7 });
    expect(db.__chain.insert.mock.calls[0][0].mission_type).toBe(MISSION_TYPES.TRAINING);
  });

  it('throws ValidationError (400) when plan_node_id is missing', async () => {
    await expect(svc.createReport({ data: { quarter: 'Q3' }, userId: 7 }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(db.__chain.insert).not.toHaveBeenCalled();
  });
});

// ── updateReport ──────────────────────────────────────────────────────────────
describe('activityReportsService.updateReport', () => {
  it('throws NotFoundError when the row does not exist', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined); // guard read
    await expect(svc.updateReport({ id: 99, data: {}, userId: 7 }))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('rejects a non-author editor with 403', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.DRAFT });
    await expect(svc.updateReport({ id: 11, data: {}, userId: 8 }))
      .rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects edits on a SUBMITTED report with 400 (author, non-admin)', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.SUBMITTED });
    await expect(svc.updateReport({ id: 11, data: {}, userId: 7 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  it('lets an admin edit a SUBMITTED report authored by someone else', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.SUBMITTED }) // guard read
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.SUBMITTED }); // readback
    const row = await svc.updateReport({
      id: 11, data: { narrative: 'admin fix' }, userId: 99, isAdmin: true,
    });
    expect(row.id).toBe(11);
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
  });

  it('allows the author to edit a REJECTED report', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.REJECTED }) // guard read
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.REJECTED }); // readback
    const row = await svc.updateReport({ id: 11, data: { narrative: 'fixed' }, userId: 7 });
    expect(row.id).toBe(11);
    expect(db.__chain.update).toHaveBeenCalledTimes(1);
  });

  it('should rewrite the mission type from the activity on edit', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 11, user_id: 7, plan_node_id: 5, status: STATUSES.DRAFT }) // guard read
      .mockResolvedValueOnce({ activity_type: MISSION_TYPES.PROCUREMENT }) // activity
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.DRAFT }); // readback
    await svc.updateReport({ id: 11, data: { narrative: 'x', mission_type: MISSION_TYPES.OTHER }, userId: 7 });
    expect(db.__chain.update.mock.calls[0][0].mission_type).toBe(MISSION_TYPES.PROCUREMENT);
  });

  it('updates by PK and never writes status', async () => {
    db.__chain.first
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.DRAFT }) // guard read
      .mockResolvedValueOnce({ id: 11, user_id: 7, status: STATUSES.DRAFT }); // readback
    db.__chain.update.mockResolvedValueOnce(1);

    const row = await svc.updateReport({
      id: 11, data: { narrative: 'x', status: STATUSES.APPROVED }, userId: 7,
    });

    expect(row.id).toBe(11);
    const updated = db.__chain.update.mock.calls;
    expect(updated).toHaveLength(1);
    expect(updated[0][0]).not.toHaveProperty('status');
    expect(updated[0][0]).not.toHaveProperty('submitted_at');
    // Authorship and the parent activity are immutable on edit.
    expect(updated[0][0]).not.toHaveProperty('plan_node_id');
    expect(updated[0][0]).not.toHaveProperty('user_id');
    expect(db.__chain.where).toHaveBeenCalledWith('id', 11);
  });
});

// ── listByActivity ────────────────────────────────────────────────────────────
describe('activityReportsService.listByActivity', () => {
  it('filters by quarter/fy/mine and orders created_at desc', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([{ id: 2 }, { id: 1 }]).then(r));

    const rows = await svc.listByActivity({
      planNodeId: 5, quarter: 'Q3', fiscalYear: '2026', mine: true, userId: 7,
    });

    expect(rows.map((r) => r.id)).toEqual([2, 1]);
    const wheres = db.__chain.where.mock.calls.map((c) => c[0]);
    expect(wheres).toEqual(expect.arrayContaining([
      { plan_node_id: 5 }, { quarter: 'Q3' }, { fiscal_year: '2026' }, { user_id: 7 },
    ]));
    expect(db.__chain.orderBy).toHaveBeenCalledWith('created_at', 'desc');
  });

  it('omits the optional filters when they are not provided', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.listByActivity({ planNodeId: 5 });
    const wheres = db.__chain.where.mock.calls.map((c) => c[0]);
    expect(wheres).toEqual([{ plan_node_id: 5 }]);
  });

  it('ignores `mine` when no userId is supplied', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([]).then(r));
    await svc.listByActivity({ planNodeId: 5, mine: true, userId: null });
    const wheres = db.__chain.where.mock.calls.map((c) => c[0]);
    expect(wheres).toEqual([{ plan_node_id: 5 }]);
  });
});

// ── resolvePeriodFilters ──────────────────────────────────────────────────────
describe('activityReportsService.resolvePeriodFilters', () => {
  it('maps a period id to quarter + stringified fiscal_year', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 3, quarter: 'Q2', fiscal_year: 2026 });
    await expect(svc.resolvePeriodFilters(3))
      .resolves.toEqual({ quarter: 'Q2', fiscal_year: '2026' });
  });

  it('returns null for an unknown period', async () => {
    db.__chain.first.mockResolvedValueOnce(undefined);
    await expect(svc.resolvePeriodFilters(999)).resolves.toBeNull();
  });
});

// ── buildReportRow ────────────────────────────────────────────────────────────
describe('activityReportsService.buildReportRow', () => {
  it('never emits a status column (status belongs to /submit and review)', () => {
    const row = svc.buildReportRow({ plan_node_id: 5, status: STATUSES.APPROVED }, 7);
    expect(row).not.toHaveProperty('status');
  });

  it('accepts the legacy workplan_item_id alias for plan_node_id', () => {
    const row = svc.buildReportRow({ workplan_item_id: 42 }, 7);
    expect(row.plan_node_id).toBe(42);
  });

  it('derives duration_days from start_date and end_date, both days included', () => {
    const row = svc.buildReportRow(
      { plan_node_id: 5, start_date: '2026-03-01', end_date: '2026-03-05' }, 7,
    );
    expect(row.duration_days).toBe(5);
  });

  it('defaults actual_spend to 0 and leaves other numerics null', () => {
    const row = svc.buildReportRow({ plan_node_id: 5 }, 7);
    expect(row.actual_spend).toBe(0);
    expect(row.total_budget).toBeNull();
    expect(row.participants_count).toBeNull();
  });
});

// ── Activity Reporting Template fields (D-20261001-01) ───────────────────────
describe('activityReportsService.buildReportRow — template fields', () => {
  const build = (extra) => svc.buildReportRow({ plan_node_id: 5, ...extra }, 7);

  it('counts a one-day activity as one day', () => {
    expect(build({ start_date: '2026-03-01', end_date: '2026-03-01' }).duration_days).toBe(1);
  });

  it('yields no duration when the end date precedes the start date', () => {
    expect(build({ start_date: '2026-03-05', end_date: '2026-03-01' }).duration_days).toBeNull();
  });

  it('passes venue, objectives and strategic needs through', () => {
    const row = build({ venue: 'UNCC', objectives: 'Train 30 officers', strategic_needs: 'AHSS pillar 2' });
    expect(row).toMatchObject({ venue: 'UNCC', objectives: 'Train 30 officers', strategic_needs: 'AHSS pillar 2' });
  });

  it('stores a known mission type', () => {
    expect(build({ mission_type: MISSION_TYPES.EVENT }).mission_type).toBe('EVENT');
  });

  it('rejects an unknown mission type with a 400', () => {
    expect(() => build({ mission_type: 'PICNIC' })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('keeps only the fields of the chosen mission type', () => {
    const row = build({
      mission_type: MISSION_TYPES.TRAINING,
      type_details: { trainees_total: '30', trainees_female: 12, visited_entity: 'Kenya', injected: 'x' },
    });
    expect(JSON.parse(row.type_details)).toEqual({ trainees_total: 30, trainees_female: 12 });
  });

  it('rejects a negative or fractional trainee count', () => {
    for (const bad of [-1, 2.5, 'many']) {
      expect(() => build({ mission_type: MISSION_TYPES.TRAINING, type_details: { trainees_total: bad } }))
        .toThrow(expect.objectContaining({ statusCode: 400 }));
    }
  });

  it('rejects more women and men trained than people trained', () => {
    expect(() => build({
      mission_type: MISSION_TYPES.TRAINING,
      type_details: { trainees_total: 10, trainees_female: 6, trainees_male: 5 },
    })).toThrow(expect.objectContaining({ statusCode: 400 }));
  });

  it('accepts a partial gender split', () => {
    const row = build({ mission_type: MISSION_TYPES.TRAINING, type_details: { trainees_total: 10, trainees_female: 6 } });
    expect(JSON.parse(row.type_details)).toEqual({ trainees_total: 10, trainees_female: 6 });
  });

  it('drops the details of a type without a specific section', () => {
    expect(build({ mission_type: MISSION_TYPES.PROCUREMENT, type_details: { outcomes: 'x' } }).type_details).toBeNull();
  });

  it('drops the details when no mission type is chosen', () => {
    expect(build({ type_details: { outcomes: 'x' } }).type_details).toBeNull();
  });

  it('stores nothing when every detail is blank', () => {
    expect(build({ mission_type: MISSION_TYPES.EVENT, type_details: { outcomes: '  ' } }).type_details).toBeNull();
  });
});

describe('activityReportsService.withSignOffNames', () => {
  it('names the author and the approver in one query', async () => {
    db.__chain.then.mockImplementationOnce((r) => Promise.resolve([
      { id: 7, full_name: 'Jane Doe', email: 'jane@africacdc.org' },
      { id: 9, full_name: null, email: 'boss@africacdc.org' },
    ]).then(r));
    const out = await svc.withSignOffNames({ id: 1, user_id: 7, approved_by: 9 });
    expect(out.prepared_by_name).toBe('Jane Doe');
    expect(out.approved_by_name).toBe('boss@africacdc.org');
  });

  it('skips the query when nobody is attached', async () => {
    const out = await svc.withSignOffNames({ id: 1, user_id: null, approved_by: null });
    expect(out).toMatchObject({ prepared_by_name: null, approved_by_name: null });
    expect(db.__chain.then).not.toHaveBeenCalled();
  });
});

// ── deleteDraft (D-20261013-04) ──────────────────────────────────────────────
describe('activityReportsService.deleteDraft', () => {
  it('should delete the author\'s draft and its evidence rows', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, user_id: 7, plan_node_id: 5, quarter: 'Q3', fiscal_year: '2026', status: STATUSES.DRAFT });
    db.__chain.del.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
    // Author and period travel on for the removal notice (D-20261015-01).
    await expect(svc.deleteDraft({ id: 12, userId: 7 })).resolves.toEqual({
      id: 12, plan_node_id: 5, user_id: 7, quarter: 'Q3', fiscal_year: '2026', evidence: 2,
    });
    expect(db).toHaveBeenCalledWith('evidence_files');
    expect(db.__chain.del).toHaveBeenCalledTimes(2);
  });

  it('should let an administrator delete someone else\'s draft', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, user_id: 7, plan_node_id: 5, status: STATUSES.DRAFT });
    await expect(svc.deleteDraft({ id: 12, userId: 1, isAdmin: true })).resolves.toMatchObject({ id: 12 });
  });

  it('should return 403 for another user', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, user_id: 7, status: STATUSES.DRAFT });
    await expect(svc.deleteDraft({ id: 12, userId: 8 })).rejects.toMatchObject({ statusCode: 403 });
    expect(db.__chain.del).not.toHaveBeenCalled();
  });

  it('should return 400 for a submitted report, even for an administrator', async () => {
    db.__chain.first.mockResolvedValueOnce({ id: 12, user_id: 7, status: STATUSES.SUBMITTED });
    await expect(svc.deleteDraft({ id: 12, userId: 1, isAdmin: true })).rejects.toMatchObject({ statusCode: 400 });
    expect(db.__chain.del).not.toHaveBeenCalled();
  });

  it('should return 404 for an unknown report', async () => {
    await expect(svc.deleteDraft({ id: 404, userId: 7 })).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── not started yet (D-20261013-08) ──────────────────────────────────────────
describe('activityReportsService.buildReportRow — not started yet', () => {
  it('should keep the expected start when the activity has not started', () => {
    const row = svc.buildReportRow({ plan_node_id: 5, not_started: true, expected_start_quarter: 'Q4', expected_start_year: 2026 }, 7);
    expect(row).toMatchObject({ not_started: true, expected_start_quarter: 'Q4', expected_start_year: '2026' });
  });

  it('should clear the expected start once the activity has started', () => {
    const row = svc.buildReportRow({ plan_node_id: 5, not_started: false, expected_start_quarter: 'Q4', expected_start_year: '2026' }, 7);
    expect(row).toMatchObject({ not_started: false, expected_start_quarter: null, expected_start_year: null });
  });
});

// ── no negative counts or amounts (D-20261013-11) ────────────────────────────
describe('activityReportsService — negative values', () => {
  it('should refuse negative participants or spend with 400', () => {
    expect(() => svc.buildReportRow({ plan_node_id: 5, participants_count: '-100' }, 7)).toThrow(/participants cannot be negative/);
    expect(() => svc.buildReportRow({ plan_node_id: 5, actual_spend: -1 }, 7)).toThrow(/Total cost used cannot be negative/);
  });

  it('should accept zero and empty values', () => {
    expect(() => svc.buildReportRow({ plan_node_id: 5, participants_count: 0, actual_spend: '' }, 7)).not.toThrow();
  });
});
