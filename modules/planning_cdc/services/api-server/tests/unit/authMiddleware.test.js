// ── authMiddleware unit tests ──
//
// The middleware is a thin wrapper around `createAuthMiddleware` from
// `@rbm/lib/auth`. We test the real factory (not mocked) with real JWTs
// signed against the test secret set in setup.js.

const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../../src/middleware/authMiddleware');

const SECRET = process.env.JWT_ACCESS_SECRET;

function makeReqRes(headers = {}) {
  return global.__makeReqRes({ req: { headers } });
}

describe('authMiddleware.authenticateToken', () => {
  it('should call next() and attach req.user for a valid token', () => {
    const payload = { id: 7, email: 'user@x.com', roles: ['FOCAL_PERSON'], bu_id: 1 };
    const token = jwt.sign(payload, SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error argument
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({
      id: 7,
      email: 'user@x.com',
      roles: ['FOCAL_PERSON'],
      bu_id: 1,
    });
  });

  it('should respond 401 TOKEN_MISSING when Authorization header is absent', () => {
    const { req, res, next } = makeReqRes({});
    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body).toMatchObject({
      success: false,
      code: 'TOKEN_MISSING',
    });
  });

  it('should respond 401 TOKEN_MISSING when header does not start with "Bearer "', () => {
    const { req, res, next } = makeReqRes({ authorization: 'Basic abc' });
    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.code).toBe('TOKEN_MISSING');
  });

  it('should respond 401 TOKEN_EXPIRED when token is expired', () => {
    // Sign a token that was already expired a second ago.
    const token = jwt.sign({ id: 1 }, SECRET, { expiresIn: '-1s' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.code).toBe('TOKEN_EXPIRED');
  });

  it('should respond 401 TOKEN_INVALID when token is malformed', () => {
    const { req, res, next } = makeReqRes({ authorization: 'Bearer not-a-jwt' });
    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  it('should respond 401 TOKEN_INVALID when token signature is wrong', () => {
    const token = jwt.sign({ id: 1 }, 'a_completely_different_secret_32_chars___', {
      expiresIn: '1h',
    });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
  });

  // Regression: a refresh token (carrying `type: 'refresh'`) must NEVER be
  // accepted where an access token is expected — otherwise the 7-day refresh
  // token would work as a 7-day access token. Access tokens carry no `type`.
  it('should respond 401 TOKEN_INVALID when a refresh token is used as an access token', () => {
    const refreshToken = jwt.sign({ id: 7, type: 'refresh' }, SECRET, { expiresIn: '7d' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${refreshToken}` });

    authenticateToken(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.code).toBe('TOKEN_INVALID');
    expect(req.user).toBeFalsy(); // never populated from a refresh token
  });

  it('should accept an access token that carries an explicit type: "access" claim', () => {
    const token = jwt.sign({ id: 7, email: 'u@x.com', type: 'access' }, SECRET, { expiresIn: '1h' });
    const { req, res, next } = makeReqRes({ authorization: `Bearer ${token}` });

    authenticateToken(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({ id: 7, email: 'u@x.com' });
  });
});
