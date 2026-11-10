/**
 * Zod schemas for budgetExecutionRoutes (D-20261015-04). Kept local to
 * api-server, like _bigTicketSchemas.js.
 */

'use strict';

const { z } = require('zod');

const year = z.string().regex(/^\d{4}$/);
const readQuery = z.object({
  fiscal_year: year.optional(),
  import_id: z.coerce.number().int().positive().optional(),
  division: z.string().trim().max(20).optional(),
});
const uploadBody = z.object({
  fiscal_year: year,
  as_of_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'As-of date must be YYYY-MM-DD'),
  notify: z.enum(['0', '1']).default('1'),
});
const linkBody = z.object({
  fund_center: z.string().trim().min(3).max(30),
  plan_node_id: z.number().int().positive(),
  fiscal_year: year,
  import_id: z.number().int().positive().optional(),
});
const idParam = z.object({ id: z.coerce.number().int().positive() });

module.exports = { readQuery, uploadBody, linkBody, idParam };
