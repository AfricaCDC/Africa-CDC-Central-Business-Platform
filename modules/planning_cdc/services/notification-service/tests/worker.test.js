// ── notification-service worker tests (transporter mocked) ──
//
// Verifies the outbox → render → SMTP send path end-to-end with nodemailer
// mocked (no network): a configured relay sends via the transporter; an
// unconfigured / `CHANGE_ME`-placeholder relay falls back to the dev logger
// (never failing auth against a real host); and `tick()` routes each row to
// markSent / markFailed. This is the H-6 "transporter mocké" integration test.

// Stable mock fns referenced from the jest.mock factories (must be `mock`-prefixed).
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail, close: jest.fn() }));
const mockClaimBatch = jest.fn();
const mockMarkSent = jest.fn();
const mockMarkFailed = jest.fn();

jest.mock('nodemailer', () => ({ createTransport: (...a) => mockCreateTransport(...a) }));
jest.mock('../src/outbox', () => ({
  claimBatch: (...a) => mockClaimBatch(...a),
  markSent: (...a) => mockMarkSent(...a),
  markFailed: (...a) => mockMarkFailed(...a),
  buildMessageId: (id) => `<msg-${id}@africacdc.org>`,
}));
jest.mock('../src/templates', () => ({
  resolveTemplate: () => ({ entry: { render: () => '<p>body</p>', subject: 'Tmpl Subject' } }),
}));
jest.mock('@rbm/lib/logger', () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), child() { return this; } }),
}));

const mockConfig = {
  smtp: { host: 'smtp.test', port: 587, user: 'u', pass: 'p', from: '"RBM" <no@africacdc.org>', domain: 'africacdc.org' },
  outbox: { batchSize: 10, maxAttempts: 3, concurrency: 2, pollIntervalMs: 60000 },
  unsubscribe: { mailto: 'unsub@africacdc.org', url: '' },
};
jest.mock('../src/config', () => mockConfig);

// Fresh worker module each time → resets its lazy transporter singleton.
const loadWorker = () => { jest.resetModules(); return require('../src/worker'); };

beforeEach(() => {
  jest.clearAllMocks();
  mockConfig.smtp.host = 'smtp.test';
  mockConfig.smtp.user = 'u';
  mockConfig.smtp.pass = 'p';
});

describe('worker.sendRow', () => {
  it('renders the template and sends via the configured transporter', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<real@id>', accepted: ['hod@africacdc.org'] });
    const worker = loadWorker();

    const res = await worker.sendRow({
      id: 7,
      recipient: 'hod@africacdc.org',
      event_key: 'division_report.submitted',
      payload: JSON.stringify({ subject: 'Report submitted: MIS Q1' }),
      correlation_id: 'corr-1',
    });

    expect(mockCreateTransport).toHaveBeenCalledTimes(1);
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: mockConfig.smtp.from,
      to: 'hod@africacdc.org',
      subject: 'Report submitted: MIS Q1',
      html: '<p>body</p>',
    }));
    expect(res.messageId).toBe('<real@id>');
  });

  it('should copy the cc list of the payload, and send no cc otherwise', async () => {
    mockSendMail.mockResolvedValue({ messageId: '<id>' });
    const worker = loadWorker();
    await worker.sendRow({ id: 8, recipient: 'pra@africacdc.org', event_key: 'org_setup.incomplete',
      payload: JSON.stringify({ subject: 'Org', cc: ['justinm@africacdc.org'] }) });
    expect(mockSendMail.mock.calls[0][0]).toMatchObject({ to: 'pra@africacdc.org', cc: ['justinm@africacdc.org'] });
    await worker.sendRow({ id: 9, recipient: 'a@africacdc.org', event_key: 'x', payload: JSON.stringify({ subject: 'X' }) });
    expect(mockSendMail.mock.calls[1][0].cc).toBeUndefined();
  });

  it('falls back to the dev logger (no network) when SMTP is unconfigured / placeholder', async () => {
    // Simulates SMTP_USER/PASS=CHANGE_ME (config normalises those to undefined).
    mockConfig.smtp.user = undefined;
    mockConfig.smtp.pass = undefined;
    const worker = loadWorker();

    const res = await worker.sendRow({ id: 8, recipient: 'x@africacdc.org', event_key: 'e', payload: '{}' });

    expect(mockCreateTransport).not.toHaveBeenCalled();
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(res.messageId).toMatch(/^dev-/);
  });
});

describe('worker.tick', () => {
  it('marks each row sent or failed per the send result', async () => {
    mockClaimBatch.mockResolvedValue([
      { id: 1, recipient: 'a@africacdc.org', event_key: 'division_report.submitted', payload: '{}' },
      { id: 2, recipient: 'b@africacdc.org', event_key: 'division_report.submitted', payload: '{}' },
    ]);
    mockSendMail
      .mockResolvedValueOnce({ messageId: '<m1>' })
      .mockRejectedValueOnce(new Error('SMTP 550 rejected'));
    const worker = loadWorker();

    const result = await worker.tick();

    expect(result).toEqual({ processed: 2, sent: 1, failed: 1 });
    expect(mockMarkSent).toHaveBeenCalledWith(1);
    expect(mockMarkFailed).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), expect.any(Error));
  });

  it('is a no-op when the outbox is empty', async () => {
    mockClaimBatch.mockResolvedValue([]);
    const worker = loadWorker();

    const result = await worker.tick();

    expect(result).toEqual({ processed: 0, sent: 0, failed: 0 });
    expect(mockSendMail).not.toHaveBeenCalled();
    expect(mockMarkSent).not.toHaveBeenCalled();
  });
});
