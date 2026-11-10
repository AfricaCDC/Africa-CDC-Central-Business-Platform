/**
 * @rbm/lib — Shared constants & helpers for Africa CDC RBM Platform.
 *
 * This file is the umbrella entry point. Subpath imports
 * (`@rbm/lib/formatters`, `@rbm/lib/theme`, ...) are also supported and
 * preferred when you only need a slice of the package.
 */

const roles = require('./roles');
const colorsModule = require('./colors');
const enums = require('./enums');
const theme = require('./theme');
const errors = require('./errors');
const auth = require('./auth');
const formatters = require('./formatters');
const cache = require('./cache');
const userDivisions = require('./user-divisions');

module.exports = {
  // Roles & RBAC primitives
  ROLES: roles.ROLES,
  ROLE_LABELS: roles.ROLE_LABELS,
  ROLE_GROUPS: roles.ROLE_GROUPS,
  ADMIN_ROLES: roles.ADMIN_ROLES,
  NAV_ADMIN_ROLES: roles.NAV_ADMIN_ROLES,
  REPORTER_ROLES: roles.REPORTER_ROLES,
  ROLE_PRIORITY: roles.ROLE_PRIORITY,
  hasRole: roles.hasRole,
  hasAnyRole: roles.hasAnyRole,

  // Legacy color object (back-compat)
  COLORS: colorsModule.COLORS,

  // Theme / brand palette
  BRAND: theme.BRAND,
  CHART_COLORS: theme.CHART_COLORS,
  CATEGORY_COLORS: theme.CATEGORY_COLORS,
  INPUT_CLASSES: theme.INPUT_CLASSES,
  TIER_CONFIG: theme.TIER_CONFIG,
  TIER_BY_NUMBER: theme.TIER_BY_NUMBER,
  getTierByNumber: theme.getTierByNumber,
  getTierByCode: theme.getTierByCode,

  // Enums (statuses, entity types, indicator types, etc.)
  ...enums,

  // Errors — canonical
  HTTP_STATUS: errors.HTTP_STATUS,
  ERROR_CODES: errors.ERROR_CODES,
  ERROR_MESSAGES: errors.ERROR_MESSAGES,
  buildError: errors.buildError,
  buildSuccess: errors.buildSuccess,
  errorHandler: errors.errorHandler,
  asyncHandler: errors.asyncHandler,
  ApiError: errors.ApiError,
  BadRequestError: errors.BadRequestError,
  UnauthorizedError: errors.UnauthorizedError,
  ForbiddenError: errors.ForbiddenError,
  NotFoundError: errors.NotFoundError,
  ConflictError: errors.ConflictError,
  ValidationError: errors.ValidationError,
  RateLimitError: errors.RateLimitError,
  ServiceUnavailableError: errors.ServiceUnavailableError,
  // Errors — legacy (deprecated, kept for Sprint-1 migration)
  httpError: errors.httpError,
  httpSuccess: errors.httpSuccess,
  toErrorResponse: errors.toErrorResponse,
  AppError: errors.AppError,

  // Auth helpers
  extractBearerToken: auth.extractBearerToken,
  verifyToken: auth.verifyToken,
  signToken: auth.signToken,
  signAccessToken: auth.signAccessToken,
  signRefreshToken: auth.signRefreshToken,
  createAuthMiddleware: auth.createAuthMiddleware,

  // Formatters
  fmtBudget: formatters.fmtBudget,
  fmtBudgetCompact: formatters.fmtBudgetCompact,
  fmtDate: formatters.fmtDate,
  fmtDateRange: formatters.fmtDateRange,
  fmtMonth: formatters.fmtMonth,
  fmtValue: formatters.fmtValue,
  fmtPercent: formatters.fmtPercent,
  fmtNumber: formatters.fmtNumber,
  timeAgo: formatters.timeAgo,

  // Cache (Redis-backed, optional — falls back to no-op if REDIS_URL unset)
  createCache: cache.createCache,

  // User ↔ Division resolution with automatic alias propagation
  getUserDivisions: userDivisions.getUserDivisions,
  getUserDivisionCodes: userDivisions.getUserDivisionCodes,
  getDirectCanonicalCodes: userDivisions.getDirectCanonicalCodes,
  DIVISION_ROLE_FOCAL: userDivisions.ROLE_FOCAL,
  DIVISION_ROLE_RESPONSIBLE: userDivisions.ROLE_RESPONSIBLE,
  DIVISION_ROLE_M_AND_E: userDivisions.ROLE_M_AND_E,
  DIVISION_ROLES: userDivisions.ALL_ROLES,
  DIVISION_ASSIGNMENT_ROLES: userDivisions.DIVISION_ASSIGNMENT_ROLES,
  DIVISION_ASSIGNMENT_ROLE_LIST: userDivisions.DIVISION_ASSIGNMENT_ROLE_LIST,
  DIVISION_ASSIGNMENT_ROLE_LABELS: userDivisions.DIVISION_ASSIGNMENT_ROLE_LABELS,
};
