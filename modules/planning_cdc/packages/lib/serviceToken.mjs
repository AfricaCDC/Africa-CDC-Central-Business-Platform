/**
 * @rbm/lib/serviceToken — ESM mirror of ./serviceToken.js. Keep both files in
 * lockstep. See serviceToken.js for full docs.
 */

import jwt from 'jsonwebtoken';
import { UnauthorizedError, ForbiddenError } from './errors.mjs';

export const ALLOWED_SERVICES = Object.freeze([
  'api-server',
  'sync-service',
  'notification-service',
]);

function extractBearer(headers) {
  if (!headers) return null;
  const raw = headers.authorization || headers.Authorization;
  if (!raw || typeof raw !== 'string') return null;
  const [scheme, token] = raw.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/**
 * @param {string} serviceName
 * @param {string} secret
 * @param {{expiresIn?: string|number}} [options]
 * @returns {string}
 */
export function signServiceToken(serviceName, secret, options) {
  if (!ALLOWED_SERVICES.includes(serviceName)) {
    throw new Error(`signServiceToken: unknown service '${serviceName}'`);
  }
  if (!secret) {
    throw new Error('signServiceToken: missing SERVICE_TOKEN_SECRET');
  }
  const opts = options || {};
  const expiresIn = opts.expiresIn || '5m';
  return jwt.sign({ svc: serviceName }, secret, { expiresIn });
}

/**
 * @param {string} token
 * @param {string} secret
 * @returns {{ svc: string, iat: number, exp: number }}
 */
export function verifyServiceToken(token, secret) {
  if (!secret) throw new Error('verifyServiceToken: missing SERVICE_TOKEN_SECRET');
  const payload = jwt.verify(token, secret);
  if (!payload || typeof payload !== 'object' || !payload.svc) {
    throw new Error('Service token missing `svc` claim');
  }
  if (!ALLOWED_SERVICES.includes(payload.svc)) {
    throw new Error(`Service token from unknown service '${payload.svc}'`);
  }
  return payload;
}

/**
 * @param {{ secret: string, allowedServices?: string[] }} config
 */
export function createServiceTokenAuth(config) {
  const cfg = config || {};
  if (!cfg.secret) {
    throw new Error('createServiceTokenAuth: secret is required');
  }
  const allow = Array.isArray(cfg.allowedServices) && cfg.allowedServices.length > 0
    ? cfg.allowedServices.filter((s) => ALLOWED_SERVICES.includes(s))
    : ALLOWED_SERVICES;
  return function serviceTokenAuth(req, _res, next) {
    try {
      const token = extractBearer(req.headers);
      if (!token) return next(new UnauthorizedError('Service token required'));
      const payload = verifyServiceToken(token, cfg.secret);
      if (!allow.includes(payload.svc)) {
        return next(new ForbiddenError(`Service '${payload.svc}' is not authorized for this route`));
      }
      req.service = { name: payload.svc };
      return next();
    } catch (err) {
      return next(new UnauthorizedError(err.message || 'Invalid service token'));
    }
  };
}

export default {
  ALLOWED_SERVICES,
  signServiceToken,
  verifyServiceToken,
  createServiceTokenAuth,
};
