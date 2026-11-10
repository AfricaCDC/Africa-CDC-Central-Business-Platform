// ── POST /send is for services only (D-20261108-02) ──
// A signed-in user's token must not choose recipients, subject and links of
// a mail sent from the official mailbox.

jest.mock('../src/outbox', () => ({ enqueue: jest.fn().mockResolvedValue([1]) }));

const express = require('express');
const request = require('supertest');
const { errorHandler } = require('@rbm/lib/errors');
const notificationRoutes = require('../src/routes/notifications');

function appAs(identity) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { Object.assign(req, identity); next(); });
  app.use('/', notificationRoutes);
  app.use(errorHandler);
  return app;
}

const BODY = { type: 'REPORT_SUBMITTED', to: 'someone@africacdc.org', data: { code: 'SA-1', title: 'x', quarter: 'Q1' } };

describe('POST /send authorisation', () => {
  it('should refuse a user token with 403', async () => {
    const res = await request(appAs({ user: { id: 7 } })).post('/send').send(BODY);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'FORBIDDEN' });
  });

  it('should let a service token through to validation and enqueue', async () => {
    const res = await request(appAs({ service: { name: 'api-server' } })).post('/send').send(BODY);
    expect(res.status).not.toBe(403);
  });
});
