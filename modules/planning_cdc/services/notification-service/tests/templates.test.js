/**
 * Unit tests for the template registry (notification wizard / task #24).
 *
 * Covers:
 *   - getTemplate / getTemplateByKey resolve known keys.
 *   - resolveTemplate prefers payload.template_key over event_key.
 *   - resolveTemplate falls back to legacy event_key registry.
 *   - resolveTemplate throws on rows that match neither path.
 *   - render() output is a non-empty HTML string for every registered key
 *     (smoke test — guards against accidental template removal).
 */

jest.mock('@rbm/lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const {
  TEMPLATES,
  TEMPLATES_BY_KEY,
  getTemplate,
  getTemplateByKey,
  resolveTemplate,
} = require('../src/templates');

describe('templates registry', () => {
  it('exposes a non-empty TEMPLATES_BY_KEY map', () => {
    expect(Object.keys(TEMPLATES_BY_KEY).length).toBeGreaterThan(0);
  });

  it('every TEMPLATES_BY_KEY entry has render + (optional) subject', () => {
    for (const [key, entry] of Object.entries(TEMPLATES_BY_KEY)) {
      expect(typeof entry.render).toBe('function');
      const html = entry.render({});
      expect(typeof html).toBe('string');
      expect(html.length).toBeGreaterThan(50);
      // subject is optional; a string, or a function of the payload returning one
      if (typeof entry.subject === 'function') expect(typeof entry.subject({})).toBe('string');
      else if (entry.subject) expect(typeof entry.subject).toBe('string');
      // sanity: key is non-empty
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it('legacy TEMPLATES has the 4 documented entries (password-reset removed, D-20261107-03)', () => {
    expect(Object.keys(TEMPLATES).length).toBeGreaterThanOrEqual(4);
  });
});

describe('getTemplate (legacy event_key path)', () => {
  it('resolves known NOTIFICATION_TYPES values', () => {
    const t = getTemplate('REPORT_SUBMITTED');
    expect(typeof t.render).toBe('function');
  });

  it('throws on unknown event_key', () => {
    expect(() => getTemplate('does-not-exist')).toThrow(/No template registered/);
  });
});

describe('getTemplateByKey (wizard template_key path)', () => {
  it('resolves all subscription template_keys from the seed', () => {
    const seedKeys = [
      'activity-updated', 'report-submitted', 'report-reviewed',
      'report-contrib-submitted', 'report-contrib-step1-decided',
      'report-contrib-step2-decided', 'report-contrib-step3-decided',
      'report-contrib-admin-bypass', 'report-contrib-blocked',
      'approval-step-created', 'approval-step-decided',
    ];
    for (const k of seedKeys) {
      expect(() => getTemplateByKey(k)).not.toThrow();
    }
  });

  it('throws on unknown template_key', () => {
    expect(() => getTemplateByKey('not-a-key')).toThrow(/No template registered/);
  });
});

describe('resolveTemplate (worker dispatch)', () => {
  it('prefers payload.template_key over event_key', () => {
    const row = {
      id: 1,
      event_key: 'REPORT_SUBMITTED', // legacy key
      payload: JSON.stringify({ template_key: 'approval-step-created' }),
    };
    const { entry, lookup } = resolveTemplate(row);
    expect(lookup).toBe('template_key');
    expect(entry.render).toBe(TEMPLATES_BY_KEY['approval-step-created'].render);
  });

  // Regression: the draft-reminder cron emits event_key='report-draft-reminder'
  // with no payload.template_key, and 1 284 reminders failed with "No template".
  it.each(['report-draft-reminder', 'report-deadline-reminder'])(
    'resolves %s by event_key when it is registered only as a template key',
    (key) => {
      const { entry } = resolveTemplate({ id: 9, event_key: key, payload: '{"user":{"id":1}}' });
      expect(entry.render).toBe(TEMPLATES_BY_KEY[key].render);
    },
  );

  it('falls back to event_key when payload.template_key is missing', () => {
    const row = {
      id: 2,
      event_key: 'REPORT_SUBMITTED',
      payload: JSON.stringify({}),
    };
    const { entry, lookup } = resolveTemplate(row);
    expect(lookup).toBe('event_key');
    expect(entry.render).toBe(TEMPLATES.REPORT_SUBMITTED.render);
  });

  it('accepts already-parsed payload object', () => {
    const row = {
      id: 3,
      event_key: 'unknown',
      payload: { template_key: 'report-contrib-blocked' },
    };
    const { entry } = resolveTemplate(row);
    expect(entry.render).toBe(TEMPLATES_BY_KEY['report-contrib-blocked'].render);
  });

  it('throws when neither template_key nor event_key resolve', () => {
    const row = { id: 4, event_key: 'unknown', payload: '{}' };
    expect(() => resolveTemplate(row)).toThrow(/No template for outbox row/);
  });

  it('treats malformed JSON payload as empty (does not throw)', () => {
    const row = { id: 5, event_key: 'REPORT_REVIEWED', payload: 'not-json' };
    const { entry } = resolveTemplate(row);
    expect(entry.render).toBe(TEMPLATES.REPORT_REVIEWED.render);
  });
});

describe('reminder emails on phones', () => {
  // A 4-column table overflowed the card on mobile mail clients (Outlook iOS).
  it('should render draft reminders as stacked blocks, not a table', () => {
    const html = TEMPLATES_BY_KEY['report-draft-reminder'].render({
      count: 1,
      drafts: [{ indicator_code: 'RefLab.5.4-3', indicator_title: 'Clusters', quarter: 'Q3', fiscal_year: 2026, division_name: 'Ref Labs' }],
    });
    expect(html).not.toMatch(/<table/);
    expect(html).toContain('2026 · Q3 · Ref Labs');
  });

  it('should render deadline reminders as stacked blocks, not a table', () => {
    const html = TEMPLATES_BY_KEY['report-deadline-reminder'].render({
      count: 1, items: [{ indicator_code: 'X.1', indicator_title: 'T', division_name: 'Div', step_label: 'Head' }],
    });
    expect(html).not.toMatch(/<table/);
    expect(html).toContain('Div · Head');
  });

  it('should escape values inside a block', () => {
    const html = TEMPLATES_BY_KEY['report-draft-reminder'].render({ count: 1, drafts: [{ indicator_title: '<b>x</b>' }] });
    expect(html).toContain('&lt;b&gt;x');
    expect(html).not.toContain('<b>x');
  });
});

describe('system-server-error', () => {
  const data = {
    error: {
      at: '2026-10-09T16:05:12Z', method: 'POST', path: '/api/reporting/indicator-division-reports', status: 500,
      duration_ms: 36, message: "Incorrect decimal value: '' for column 'actual_value'",
      body: { plan_node_id: 6130, actual_value: '', narrative: '<script>x</script>', password: '***REDACTED***' },
      repeated: 3, window_min: 30,
    },
    actor: { id: 221, name: 'Kofi Abaya', email: 'abayak@africacdc.org' },
    client: { ip: '196.189.24.93', user_agent: 'iPhone Safari' },
  };

  it('should show who, the exact error and what they entered', () => {
    const html = TEMPLATES_BY_KEY['system-server-error'].render(data);
    expect(html).toContain('Kofi Abaya');
    expect(html).toContain('abayak@africacdc.org');
    expect(html).toContain('Incorrect decimal value');
    expect(html).toContain('plan_node_id');
    expect(html).toContain('(empty)');
    expect(html).toContain('***REDACTED***');
    expect(html).toContain('3 more times since the previous alert');
    expect(html).not.toContain('<script>x');
    expect(html).not.toMatch(/<table/);
  });

  it('should say when the input was too large to show', () => {
    const html = TEMPLATES_BY_KEY['system-server-error'].render({ error: { body: { _truncated: true, keys: ['file_base64', 'file_name'] } } });
    expect(html).toContain('Too large to show');
    expect(html).toContain('file_base64, file_name');
  });

  it('should render with an empty payload', () => {
    expect(TEMPLATES_BY_KEY['system-server-error'].render({})).toContain('Not signed in');
  });
});
