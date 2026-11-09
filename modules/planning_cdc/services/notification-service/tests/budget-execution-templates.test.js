// ── budget-execution-summary / budget-import-status (D-20261015-04) ──

const { TEMPLATES_BY_KEY } = require('../src/templates');

const summary = TEMPLATES_BY_KEY['budget-execution-summary'];
const status = TEMPLATES_BY_KEY['budget-import-status'];

const subjectOf = (entry, data) => (typeof entry.subject === 'function' ? entry.subject(data) : entry.subject);

describe('budget-execution-summary template', () => {
  const data = {
    metadata: {
      division: 'Emergency Preparedness', asOf: '2026-10-13', fiscalYear: '2026',
      released: 394550, committed: 90404, spent: 227045.16, balance: 77100.84, executionPct: 80.5, spendPct: 57.5,
      activities: [{ code: '1.1.2.02', title: 'Support the continental coordination <mechanism>', balance: 77100.84, executionPct: 80.5 }],
      moreActivities: 2, url: 'https://pra.africacdc.org/budget-execution?fy=2026&bu=EPR',
    },
  };

  it('should lead with the available balance and show the figures and both rates', () => {
    const html = summary.render(data);
    expect(html).toContain('Available balance');
    expect(html).toContain('$77,101');
    expect(html).toContain('$394,550');
    expect(html).toContain('80.5%');
    expect(html).toContain('57.5%');
    expect(html).toContain('And 2 more activities');
  });

  it('should escape activity titles', () => {
    expect(summary.render(data)).toContain('&lt;mechanism&gt;');
  });

  it('should name the unit and the date in the subject', () => {
    expect(subjectOf(summary, data)).toBe('Budget execution of Emergency Preparedness as at 2026-10-13');
  });

  it('should render without activities or figures', () => {
    const html = summary.render({ metadata: {} });
    expect(html).toContain('Available balance');
    expect(html).not.toContain('more activities');
  });
});

describe('budget-import-status template', () => {
  it('should ask for the import when it is due, with the last import', () => {
    const data = { metadata: { status: 'due', url: '/budget-execution/imports', weekStart: '2026-10-19', weekLabel: 'Week 43 (19 Oct – 25 Oct 2026)', lastAsOf: '2026-10-13', lastImportedBy: 'Finance Officer' } };
    const html = status.render(data);
    expect(html).toContain('has not been imported yet this week');
    expect(html).toContain('2026-10-13');
    expect(html).toContain('Import the budget execution');
    expect(html).toContain('budget-execution&#47;imports'); // URL is HTML-escaped
    expect(html).toContain('every working day until');
    expect(html).toContain('Week 43 (19 Oct – 25 Oct 2026)');
    expect(subjectOf(status, data)).toBe('Budget execution import due: Week 43 (19 Oct – 25 Oct 2026)');
  });

  it('should say when nothing was ever imported', () => {
    expect(status.render({ metadata: { status: 'due', weekStart: '2026-10-19' } })).toContain('No budget execution export has been imported yet');
  });

  it('should confirm the import when done', () => {
    const data = { metadata: { status: 'done', weekStart: '2026-10-12', asOf: '2026-10-13', fiscalYear: '2026', importedBy: 'Finance Officer', fundCenters: 253, notifiedDivisions: 40 } };
    const html = status.render(data);
    expect(html).toContain('has been imported');
    expect(html).toContain('253');
    expect(html).toContain('Finance Officer');
    expect(html).not.toContain('has not been imported');
    expect(subjectOf(status, data)).toBe('Budget execution imported: figures as at 2026-10-13');
  });
});
