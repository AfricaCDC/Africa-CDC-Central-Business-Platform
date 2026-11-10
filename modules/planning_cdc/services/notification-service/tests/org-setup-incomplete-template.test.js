// ── org-setup-incomplete (D-20261015-07) ──

const { TEMPLATES_BY_KEY } = require('../src/templates');

const tpl = TEMPLATES_BY_KEY['org-setup-incomplete'];
const subjectOf = (entry, data) => (typeof entry.subject === 'function' ? entry.subject(data) : entry.subject);

describe('org-setup-incomplete template', () => {
  const data = {
    metadata: {
      fiscalYear: '2026', url: '/reference/org',
      units: [
        { code: 'EPR', name: 'Emergency Preparedness <EPR>', missing: ['M&E officer'] },
        { code: 'RRR', name: 'RRR', missing: ['Responsible person (head)', 'M&E officer', 'Focal person'] },
      ],
      counts: [{ label: 'Responsible person (head)', count: 1 }, { label: 'M&E officer', count: 2 }, { label: 'Focal person', count: 1 }],
    },
  };

  it('should list each unit with what it misses, and the link to the org structure', () => {
    const html = tpl.render(data);
    expect(html).toContain('Missing: Responsible person (head), M&amp;E officer, Focal person');
    expect(html).toContain('Without M&amp;E officer');
    expect(html).toContain('reference&#47;org');
    expect(html).toContain('every M&amp;E officer is reminded');
    expect(html).toContain('the responsible person of the level above approves');
    expect(html).not.toContain('director of the directorate');
    expect(subjectOf(tpl, data)).toBe('Org structure: 2 business units to complete');
  });

  it('should escape unit names', () => {
    const html = tpl.render(data);
    expect(html).not.toContain('<EPR>');
    expect(html).toContain('&lt;EPR&gt;');
  });
});
