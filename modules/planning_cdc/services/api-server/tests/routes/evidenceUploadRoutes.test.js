// ── POST /api/reporting/upload-verification — who may attach what (D-20261108-02) ──

process.env.POWER_AUTOMATE_URL = 'https://flow.example.test/upload';

jest.mock('../../src/middleware/authMiddleware', () => ({
  authenticateToken: (req, res, next) => {
    if (!req.headers.authorization) return res.status(401).json({ success: false, message: 'Sign in', code: 'UNAUTHORIZED' });
    req.user = { id: 5 };
    return next();
  },
}));
jest.mock('../../src/services/reporting/reportAccess', () => ({
  ...jest.requireActual('../../src/services/reporting/reportAccess'),
  canWriteEvidence: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/config/db');
const { canWriteEvidence } = require('../../src/services/reporting/reportAccess');

const AUTH = { authorization: 'Bearer t' };
const URL = '/api/reporting/upload-verification';
const BODY = { file_base64: 'JVBERi0x', file_name: 'mission-report.pdf', mime_type: 'text/html', file_size: 8, parent_type: 'activity_report', parent_id: 12 };

const realFetch = global.fetch;
afterAll(() => { global.fetch = realFetch; });

beforeEach(() => {
  jest.clearAllMocks();
  canWriteEvidence.mockResolvedValue(true);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('https://sharepoint.example/file') });
});

describe('POST upload-verification', () => {
  it('should answer 401 without a session', async () => {
    expect((await request(app).post(URL).send(BODY)).status).toBe(401);
  });

  it('should refuse a file type outside the allowed list before sending anything', async () => {
    const res = await request(app).post(URL).set(AUTH).send({ ...BODY, file_name: 'page.html' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/File type not allowed/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should refuse a user who may not write the report', async () => {
    canWriteEvidence.mockResolvedValue(false);
    const res = await request(app).post(URL).set(AUTH).send(BODY);
    expect(res.status).toBe(403);
    expect(canWriteEvidence).toHaveBeenCalledWith(5, 'activity_report', 12);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('should store the type derived from the extension, never the client MIME', async () => {
    const res = await request(app).post(URL).set(AUTH).send(BODY);
    expect(res.status).toBe(200);
    expect(db.__chain.insert).toHaveBeenCalledWith(expect.objectContaining({
      mime_type: 'application/pdf', parent_type: 'activity_report', parent_id: 12,
    }));
  });
});
