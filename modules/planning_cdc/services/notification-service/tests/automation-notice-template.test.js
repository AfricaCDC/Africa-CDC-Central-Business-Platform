// ── automation-notice (automation roadmap, lot 0) ──

const { TEMPLATES_BY_KEY } = require('../src/templates');

const tpl = TEMPLATES_BY_KEY['automation-notice'];

describe('automation-notice template', () => {
  const data = {
    metadata: {
      subject: '2 activity reports overdue',
      heading: 'Activity reports overdue',
      intro: 'These activities ended without a report.',
      items: [{ code: '1.2.3.01', title: 'Workshop <Nairobi>', meta: ['ended 2026-10-01'] }],
      sections: [{ heading: 'High risk', items: [{ code: '2.1.1.02', title: 'Training' }] }],
      ctaLabel: 'Open Specific Activities',
      ctaUrl: '/my-specifics',
      footer: 'You receive this once a week.',
    },
  };

  it('should render the heading, intro, items, sections, button and footer', () => {
    const html = tpl.render(data);
    expect(html).toContain('Activity reports overdue');
    expect(html).toContain('These activities ended without a report.');
    expect(html).toContain('1.2.3.01');
    expect(html).toContain('High risk');
    expect(html).toContain('2.1.1.02');
    expect(html).toContain('Open Specific Activities');
    expect(html).toContain('my-specifics');
    expect(html).toContain('You receive this once a week.');
  });

  it('should escape values and use the subject of the metadata', () => {
    const html = tpl.render(data);
    expect(html).not.toContain('<Nairobi>');
    expect(html).toContain('&lt;Nairobi&gt;');
    expect(tpl.subject(data)).toBe('2 activity reports overdue');
  });

  it('should render without a button or list when they are absent', () => {
    const html = tpl.render({ metadata: { heading: 'Data health' } });
    expect(html).toContain('Data health');
    expect(html).not.toContain('Open the platform');
    expect(tpl.subject({ metadata: { heading: 'Data health' } })).toBe('Data health');
    expect(tpl.subject({})).toBe('RBM Platform notice');
  });
});

// ── Approve / Reject from the email (D-20261105-10) ──
describe('decide buttons in the approval emails', () => {
  const URL = 'https://pra.africacdc.org/decide/311';

  it('should show Approve and Reject on the step and report emails when a decide link is given', () => {
    for (const key of ['approval-step-created', 'report-submitted-details']) {
      const html = TEMPLATES_BY_KEY[key].render({ metadata: { decideUrl: URL, reportUrl: '/x' }, entity: {} });
      expect(html).toContain('decide&#47;311?d=approve');
      expect(html).toContain('decide&#47;311?d=reject');
    }
  });

  it('should show no button without a decide link', () => {
    const html = TEMPLATES_BY_KEY['approval-step-created'].render({ metadata: {}, entity: {} });
    expect(html).not.toContain('?d=approve');
  });

  it('should add an « Approve or reject » link under each pending review', () => {
    const html = TEMPLATES_BY_KEY['review-pending-reminder'].render({ metadata: { items: [{ code: 'A', title: 'T', decideUrl: URL }, { code: 'B', title: 'U' }] } });
    expect(html.match(/Approve or reject/g)).toHaveLength(1);
  });
});
