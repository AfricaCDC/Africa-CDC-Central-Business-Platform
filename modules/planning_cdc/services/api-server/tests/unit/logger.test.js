// ── @rbm/lib/logger argument order ──
// Call sites mix our order (msg, ctx) and pino's (ctx, msg); both must log the
// message as `msg` and spread the context.

describe('@rbm/lib/logger', () => {
  let lines;
  let spy;
  let createLogger;

  beforeEach(() => {
    jest.resetModules();
    jest.doMock('pino', () => { throw new Error('not installed'); }, { virtual: true });
    ({ createLogger } = require('@rbm/lib/logger'));
    lines = [];
    spy = jest.spyOn(process.stdout, 'write').mockImplementation((s) => { lines.push(JSON.parse(s)); return true; });
  });

  afterEach(() => spy.mockRestore());

  it('should log (msg, ctx) with the context spread', () => {
    createLogger('t').info('import.done', { n: 2 });
    expect(lines[0]).toMatchObject({ msg: 'import.done', n: 2 });
  });

  it('should log pino-order (ctx, msg) the same way', () => {
    createLogger('t').warn({ n: 1 }, 'import.done');
    expect(lines[0]).toMatchObject({ level: 'warn', msg: 'import.done', n: 1 });
  });

  it('should log a bare message', () => {
    createLogger('t').error('boom');
    expect(lines[0]).toMatchObject({ level: 'error', msg: 'boom' });
  });
});
