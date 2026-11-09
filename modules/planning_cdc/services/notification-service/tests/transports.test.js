// ── transports — driver selection, Graph mapping, composite fallback ──
//
// Pure unit tests: nodemailer mocked, Graph exercised through an injected
// fetchImpl (no network). Covers the EMAIL_DRIVER matrix and the
// graph message mapping ported from phahm-platform.

const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'smtp-1', accepted: [] });
const mockCreateTransport = jest.fn(() => ({ sendMail: mockSendMail, close: jest.fn() }));
jest.mock('nodemailer', () => ({ createTransport: (...a) => mockCreateTransport(...a) }));

const { buildEmailTransport, buildComposite } = require('../src/transports');
const { buildGraphMessage, stampFrom, buildGraphTransport } = require('../src/transports/graphTransport');

const log = { info: jest.fn(), warn: jest.fn() };

function cfg({ driver = 'smtp', smtp = true, graph = false } = {}) {
  return {
    email: { driver },
    smtp: smtp
      ? { host: 'smtp.x', port: 587, user: 'u', pass: 'p', from: '"RBM" <noreply@x.org>' }
      : { host: undefined, user: undefined, pass: undefined, port: 587, from: '"RBM" <noreply@x.org>' },
    graph: graph
      ? { tenantId: 't', clientId: 'c', clientSecret: 's', from: '"RBM" <noreply@x.org>' }
      : { tenantId: undefined, clientId: undefined, clientSecret: undefined, from: '"RBM" <noreply@x.org>' },
    outbox: { concurrency: 5 },
  };
}

beforeEach(() => jest.clearAllMocks());

describe('buildEmailTransport — driver matrix', () => {
  it('should default to smtp when configured', () => {
    const { mode } = buildEmailTransport(cfg(), log);
    expect(mode).toBe('smtp');
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.x', pool: true }));
  });

  it('should fall back to the dev logger when nothing is configured', async () => {
    const { transport, mode } = buildEmailTransport(cfg({ smtp: false }), log);
    expect(mode).toBe('dev-logger');
    const info = await transport.sendMail({ to: 'a@x.org', subject: 's' });
    expect(info.messageId).toMatch(/^dev-/);
    expect(log.warn).toHaveBeenCalledWith('smtp.not_configured', { mode: 'dev-logger' });
  });

  it('should build graph when driver=graph and creds are present', () => {
    const { mode } = buildEmailTransport(cfg({ driver: 'graph', graph: true }), log);
    expect(mode).toBe('graph');
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it('should degrade loudly to smtp when driver=graph but creds are missing', () => {
    const { mode } = buildEmailTransport(cfg({ driver: 'graph' }), log);
    expect(mode).toBe('smtp');
    expect(log.warn).toHaveBeenCalledWith('email.graph_not_configured',
      { requested: 'graph', fallback: 'smtp' });
  });

  it('should build the composite when driver=composite and both are configured', () => {
    const { mode } = buildEmailTransport(cfg({ driver: 'composite', graph: true }), log);
    expect(mode).toBe('composite');
  });
});

describe('buildComposite — fallback behaviour', () => {
  it('should use the primary when it succeeds', async () => {
    const primary = { sendMail: jest.fn().mockResolvedValue({ messageId: 'g-1' }) };
    const secondary = { sendMail: jest.fn() };
    const info = await buildComposite(primary, secondary, log).sendMail({ to: 'a@x.org' });
    expect(info.messageId).toBe('g-1');
    expect(secondary.sendMail).not.toHaveBeenCalled();
  });

  it('should warn and fall back to the secondary when the primary throws', async () => {
    const primary = { sendMail: jest.fn().mockRejectedValue(new Error('graph_send_failed 429')) };
    const secondary = { sendMail: jest.fn().mockResolvedValue({ messageId: 'smtp-2' }) };
    const info = await buildComposite(primary, secondary, log).sendMail({ to: 'a@x.org' });
    expect(info.messageId).toBe('smtp-2');
    expect(log.warn).toHaveBeenCalledWith('email.primary_transport_failed',
      { error: expect.stringContaining('graph_send_failed') });
  });
});

describe('buildGraphMessage — mapping', () => {
  it('should map to/from/subject/html into the Graph shape', () => {
    const { message, saveToSentItems } = buildGraphMessage({
      from: '"RBM" <noreply@x.org>',
      to: 'dest@x.org',
      subject: 'Hello',
      html: '<b>hi</b>',
    });
    expect(saveToSentItems).toBe(false);
    expect(message.subject).toBe('Hello');
    expect(message.body).toEqual({ contentType: 'HTML', content: '<b>hi</b>' });
    expect(message.toRecipients).toEqual([{ emailAddress: { address: 'dest@x.org' } }]);
    expect(message.from).toEqual({ emailAddress: { address: 'noreply@x.org', name: 'RBM' } });
    expect(message.ccRecipients).toBeUndefined();
  });

  it('should fall back to a Text body and map cc lists', () => {
    const { message } = buildGraphMessage({ to: ['a@x.org', 'b@x.org'], cc: 'c@x.org', text: 'plain' });
    expect(message.body).toEqual({ contentType: 'Text', content: 'plain' });
    expect(message.toRecipients).toHaveLength(2);
    expect(message.ccRecipients).toEqual([{ emailAddress: { address: 'c@x.org' } }]);
  });
});

describe('stampFrom', () => {
  it('should keep the caller display name on the own mailbox address', () => {
    expect(stampFrom('"RBM" <noreply@x.org>', 'Alerts <other@y.org>'))
      .toEqual({ name: 'Alerts', address: 'noreply@x.org' });
  });

  it('should use the own display name when the caller has none', () => {
    expect(stampFrom('"RBM" <noreply@x.org>', 'plain@y.org'))
      .toEqual({ name: 'RBM', address: 'noreply@x.org' });
  });
});

describe('buildGraphTransport — send flow (mocked fetch)', () => {
  function makeFetch(sendStatus) {
    return jest.fn(async (url) => {
      if (url.includes('login.microsoftonline.com')) {
        return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
      }
      return {
        status: sendStatus,
        headers: { get: () => 'req-123' },
        text: async () => 'boom',
      };
    });
  }

  it('should POST /users/{mailbox}/sendMail and return a nodemailer-ish info', async () => {
    const fetchImpl = makeFetch(202);
    const t = buildGraphTransport({
      tenantId: 't', clientId: 'c', clientSecret: 's',
      fromAddress: '"RBM" <noreply@x.org>', fetchImpl,
    });
    const info = await t.sendMail({ to: 'dest@x.org', subject: 'Hi', html: '<b>x</b>' });
    expect(info.messageId).toBe('req-123');
    expect(info.accepted).toEqual(['dest@x.org']);
    const sendCall = fetchImpl.mock.calls.find(([u]) => u.includes('/sendMail'));
    expect(sendCall[0]).toContain('/users/noreply%40x.org/sendMail');
    expect(JSON.parse(sendCall[1].body).message.subject).toBe('Hi');
  });

  it('should throw graph_send_failed on a non-202 response', async () => {
    const t = buildGraphTransport({
      tenantId: 't', clientId: 'c', clientSecret: 's',
      fromAddress: 'noreply@x.org', fetchImpl: makeFetch(429),
    });
    await expect(t.sendMail({ to: 'dest@x.org' })).rejects.toThrow(/graph_send_failed 429/);
  });
});

describe('graph recipients', () => {
  const { buildGraphMessage } = require('../src/transports/graphTransport');
  it('should split a comma-separated recipient string into one Graph recipient each', () => {
    const msg = buildGraphMessage({ to: 'a@africacdc.org, b@africacdc.org,c@africacdc.org', subject: 's', html: '<b>x</b>' });
    expect(msg.message.toRecipients.map((r) => r.emailAddress.address)).toEqual(['a@africacdc.org', 'b@africacdc.org', 'c@africacdc.org']);
  });
});
