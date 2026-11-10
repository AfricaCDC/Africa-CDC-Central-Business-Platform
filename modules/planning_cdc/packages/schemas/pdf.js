/**
 * @rbm/schemas/pdf — Zod schemas for PDF render payloads.
 * Preserved for future reintroduction; see D-20260415-08 (PDF rendering retired).
 */

const { z } = require('zod');

const pdfTemplateEnum = z.enum([
  'quarterly-report',
  'workplan-export',
  'indicator-dashboard',
]);

/**
 * Request body for `POST /pdf/render`.
 */
const pdfRequestSchema = z.object({
  template: pdfTemplateEnum,
  data: z.record(z.string(), z.any()),
  fileName: z.string().min(1).max(255).optional(),
  correlationId: z.string().min(1).max(64).optional(),
});

/**
 * Response body (JSON mode; the binary download route returns a stream
 * instead). `url` is the signed URL to the generated PDF.
 */
const pdfResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    url: z.string().url(),
    bytes: z.number().int().nonnegative(),
    renderedAt: z.string(),
  }),
});

module.exports = { pdfRequestSchema, pdfResponseSchema };
