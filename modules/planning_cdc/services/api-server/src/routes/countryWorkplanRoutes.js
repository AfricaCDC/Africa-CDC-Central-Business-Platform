// ── /api/country-workplan (D-20261028-01) ──
//
// What is planned in a country: specific activities located in it.
// Open to the members of that country's office and to workplan readers at
// scope « all ».

'use strict';

const router = require('express').Router();
const { z } = require('zod');
const asyncHandler = require('../middleware/asyncHandler');
const { authenticateToken } = require('../middleware/authMiddleware');
const { ForbiddenError, ValidationError } = require('@rbm/lib/errors');
const { countryByCode } = require('@rbm/lib/countries');
const { viewableCountries, countryActivities } = require('../services/countryWorkplan');

const querySchema = z.object({
  country: z.string().regex(/^[A-Za-z]{3}$/, 'country must be an ISO alpha-3 code'),
  fiscal_year: z.string().regex(/^\d{4}$/, 'fiscal_year must be a 4-digit year'),
});

router.use(authenticateToken);

/**
 * Countries whose workplan the caller may open. With `fiscal_year`, a scope
 * « all » reader only gets the countries that have activities that year.
 *
 * @name GET /api/country-workplan/countries
 * @param {express.Request} req - optional query `fiscal_year`
 * @param {express.Response} res - 200 `{ success, data: [{ code, name }] }` · 400
 * @returns {Promise<void>}
 * @throws {ValidationError} bad fiscal_year
 * @throws {Error} 500 on DB failure
 * @example GET /api/country-workplan/countries?fiscal_year=2026
 */
router.get('/countries', asyncHandler(async (req, res) => {
  const parsed = querySchema.pick({ fiscal_year: true }).partial().safeParse(req.query);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  res.json({ success: true, data: await viewableCountries(req.user.id, parsed.data.fiscal_year) });
}));

/**
 * Specific activities of a year planned in a country (approved, in execution,
 * closed or in review).
 *
 * @name GET /api/country-workplan
 * @param {express.Request} req - query `country` (ISO alpha-3), `fiscal_year`
 * @param {express.Response} res - 200 `{ success, data: { country, activities } }` · 400 · 403
 * @returns {Promise<void>}
 * @throws {ValidationError} bad query
 * @throws {ForbiddenError} country not viewable by the caller
 * @example GET /api/country-workplan?country=COD&fiscal_year=2027
 */
router.get('/', asyncHandler(async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);
  const code = parsed.data.country.toUpperCase();
  const country = countryByCode(code);
  if (!country) throw new ValidationError('Unknown country: pick an African Union member state');
  const allowed = await viewableCountries(req.user.id);
  if (!allowed.some((c) => c.code === code)) throw new ForbiddenError('You can only see the workplan of your country office');
  const activities = await countryActivities({ countryName: country.name, fiscalYear: parsed.data.fiscal_year });
  res.json({ success: true, data: { country: { code, name: country.name }, activities } });
}));

module.exports = router;
