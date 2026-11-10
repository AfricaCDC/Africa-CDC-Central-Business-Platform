/**
 * Zod schemas for bigTicketRoutes (D-20261015-02). Kept local to api-server,
 * like _notificationAdminSchemas.js.
 */

'use strict';

const { z } = require('zod');
const { QUARTERS, BIG_TICKET_PROGRESS } = require('@rbm/lib/enums');

const year = z.string().regex(/^\d{4}$/, 'Year must be 4 digits');
const optionalText = z.string().trim().max(5000).nullable().optional();
const nonNegative = z.number().min(0, 'Values cannot be negative').nullable().optional();

const targetSchema = z.object({
  annual_target: optionalText,
  annual_target_numeric: nonNegative,
  q1_milestone: optionalText,
  q1_milestone_numeric: nonNegative,
  q2_milestone: optionalText,
  q2_milestone_numeric: nonNegative,
  q3_milestone: optionalText,
  q3_milestone_numeric: nonNegative,
  q4_milestone: optionalText,
  q4_milestone_numeric: nonNegative,
}).partial();

const lineSchema = z.object({
  id: z.number().int().positive().optional(),
  label: z.string().trim().max(200).nullable().optional(),
  indicator_code: z.string().trim().max(50).nullable().optional(),
  tier: z.string().trim().max(10).nullable().optional(),
  target: targetSchema.optional(),
});

const ticketSchema = z.object({
  code: z.string().trim().min(2).max(10).regex(/^[A-Za-z0-9_-]+$/, 'Code: letters, digits, - and _ only'),
  title: z.string().trim().min(3).max(2000),
  pillar_id: z.number().int().positive().nullable().optional(),
  lead_division_code: z.string().trim().min(1).max(20),
  contributors: z.array(z.string().trim().min(1).max(20)).max(60).default([]),
  contributors_note: z.string().trim().max(500).nullable().optional(),
  expected_result: optionalText,
  delivery_model: optionalText,
  success_factors: optionalText,
  start_year: year,
  end_year: year.nullable().optional(),
  is_active: z.boolean().optional(),
  fiscal_year: year,
  lines: z.array(lineSchema).min(1, 'Add at least one indicator line').max(30),
}).refine((t) => !t.end_year || t.end_year >= t.start_year, {
  message: 'End year cannot be before start year', path: ['end_year'],
}).refine((t) => t.fiscal_year >= t.start_year && (!t.end_year || t.fiscal_year <= t.end_year), {
  message: 'Targets year must fall within the ticket years', path: ['fiscal_year'],
});

const listQuerySchema = z.object({
  fiscal_year: year.optional(),
  quarter: z.enum(Object.keys(QUARTERS)).optional(),
  pillar_id: z.coerce.number().int().positive().optional(),
  lead: z.string().trim().max(20).optional(),
  progress: z.string().trim().max(20).optional(),
  q: z.string().trim().max(100).optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

const indicatorQuerySchema = z.object({
  fiscal_year: year,
  q: z.string().trim().max(100).default(''),
});

const reportParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  quarter: z.enum(Object.keys(QUARTERS)),
});

const reportValueSchema = z.object({
  line_id: z.number().int().positive(),
  achieved: z.string().trim().max(2000).nullable().optional(),
  achieved_numeric: nonNegative,
  comment: optionalText,
});

/** Draft: everything optional. Submit (`submit: true`): progress status and narration required. */
const reportSchema = z.object({
  fiscal_year: year,
  submit: z.boolean().default(false),
  progress_status: z.enum(Object.values(BIG_TICKET_PROGRESS)).nullable().optional(),
  narrative: optionalText,
  challenges: optionalText,
  next_steps: optionalText,
  values: z.array(reportValueSchema).max(30).default([]),
}).refine((r) => !r.submit || r.progress_status, {
  message: 'Choose the progress status before submitting', path: ['progress_status'],
}).refine((r) => !r.submit || (r.narrative && r.narrative.trim()), {
  message: 'Describe the progress before submitting', path: ['narrative'],
});

const decisionSchema = z.object({
  fiscal_year: year,
  reason: z.string().trim().max(2000).optional(),
});

const reportQuerySchema = z.object({ fiscal_year: year });

const exportQuerySchema = z.object({
  fiscal_year: year.optional(),
  quarter: z.enum(Object.keys(QUARTERS)).optional(),
  format: z.enum(['xlsx', 'csv']).default('xlsx'),
});

module.exports = {
  ticketSchema, listQuerySchema, idParamSchema, indicatorQuerySchema,
  reportParamsSchema, reportSchema, decisionSchema, reportQuerySchema, exportQuerySchema,
};
