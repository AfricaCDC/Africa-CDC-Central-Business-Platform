/**
 * @rbm/schemas/fileGenerator — Zod schemas for the new `file-generator-service`
 * (port 3007, gateway `/documents/`). Spec: `docs/specs/file-generator-service.md`
 * §2.1, §3.1, §3.4, §6.
 *
 * The service accepts `POST /generate` with a `{ format, template_key, data,
 * options }` body. `options` shape depends on `format`:
 *   - PDF  → {@link pdfOptions}  (paper, landscape, margin_mm)
 *   - ZIP  → {@link zipOptions}  (members[] of per-format generators)
 *   - other formats → {@link baseOptions} only
 *
 * All validation happens here via Zod — the service itself MUST use these
 * exports rather than redefining them. Per-template payload shapes (`data`)
 * are validated by sub-schemas inside the service template registry, not here.
 */

const { z } = require('zod');

/**
 * Template-key slug: lowercase start, then lowercase/digits/hyphens, 3–64 chars.
 * Matches `^[a-z][a-z0-9-]{2,63}$` — enforced on every `template_key` + every
 * ZIP member's `template_key`.
 */
const SAFE_SLUG = /^[a-z][a-z0-9-]{2,63}$/;

/**
 * Output formats the service advertises on `POST /generate`.
 */
const FORMATS = ['pdf', 'pptx', 'xlsx', 'docx', 'csv', 'zip'];

const FILENAME_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Fields common to every `options` shape. `.strict()` forbids extra keys so a
 * typo like `file_name_slug` fails loud at the boundary.
 */
const baseOptions = z.object({
  filename_slug: z.string().regex(FILENAME_SLUG).optional(),
  correlation_id: z.string().min(1).max(64).optional(),
  inline: z.boolean().optional(),
}).strict();

/**
 * PDF-only options. `margin_mm` is partial so callers can pass only the
 * sides they care about.
 */
const pdfOptions = baseOptions.extend({
  paper: z.enum(['A4', 'LETTER']).optional(),
  landscape: z.boolean().optional(),
  margin_mm: z.object({
    top: z.number(),
    right: z.number(),
    bottom: z.number(),
    left: z.number(),
  }).partial().optional(),
}).strict();

/**
 * Single ZIP member. The ZIP dispatcher composes other generators and
 * archives their output — so `format` here excludes `'zip'` (no nested
 * archives).
 */
const memberSchema = z.object({
  format: z.enum(['pdf', 'pptx', 'xlsx', 'docx', 'csv']),
  template_key: z.string().regex(SAFE_SLUG),
  data: z.record(z.string(), z.unknown()),
  filename_slug: z.string().regex(FILENAME_SLUG).optional(),
}).strict();

/**
 * ZIP-only options — carries the list of members (1–50).
 */
const zipOptions = baseOptions.extend({
  members: z.array(memberSchema).min(1).max(50),
}).strict();

/**
 * Request body for `POST /generate`. `options` is a union: pass `pdfOptions`
 * for PDF, `zipOptions` for ZIP, `baseOptions` otherwise. `.strict()` rejects
 * unknown top-level keys.
 *
 * @example
 *   generateRequestSchema.parse({
 *     format: 'pdf',
 *     template_key: 'quarterly-report',
 *     data: { quarter: 'Q1', year: 2026 },
 *     options: { paper: 'A4', landscape: false, filename_slug: 'q1-2026' },
 *   });
 */
const generateRequestSchema = z.object({
  format: z.enum(FORMATS),
  template_key: z.string().regex(SAFE_SLUG),
  data: z.record(z.string(), z.unknown()),
  options: z.union([pdfOptions, zipOptions, baseOptions]).optional(),
}).strict();

module.exports = {
  generateRequestSchema,
  memberSchema,
  baseOptions,
  pdfOptions,
  zipOptions,
  SAFE_SLUG,
  FORMATS,
};
