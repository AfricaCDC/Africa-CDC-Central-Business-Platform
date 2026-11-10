/**
 * @rbm/schemas/file — Zod schemas for the canonical evidence-upload path in
 * api-server (`POST /api/evidence/upload`). The file-service is being retired
 * (D-01) so these schemas describe the single surviving upload contract.
 *
 * The actual binary arrives as multipart form-data — multer parses it before
 * these schemas validate the metadata fields on `req.body`.
 */

const { z } = require('zod');
const { ALLOWED_MIME_TYPES, MAX_FILE_BYTES } = require('@rbm/lib/fileTypes');

const parentTypeEnum = z.enum([
  'activity_actual',
  'indicator_actual',
  'workplan_item',
  'report',
  'generic',
]);

/**
 * Metadata payload accompanying a multipart upload. The file itself is
 * validated via multer `fileFilter` using `@rbm/lib/fileTypes#isAllowed`.
 */
const fileRequestSchema = z.object({
  parent_type: parentTypeEnum,
  parent_id: z.coerce.number().int().positive(),
  description: z.string().max(500).optional(),
});

/**
 * Describes a stored file. Returned inside `{ success, data: { files: [...] } }`.
 */
const fileMetadataSchema = z.object({
  id: z.union([z.string(), z.number()]),
  filename: z.string().min(1),
  mime_type: z.enum(ALLOWED_MIME_TYPES),
  size_bytes: z.number().int().nonnegative().max(MAX_FILE_BYTES),
  url: z.string().url().optional(),
  uploaded_at: z.string().optional(),
});

const fileResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    files: z.array(fileMetadataSchema).min(1),
  }),
});

module.exports = {
  fileRequestSchema,
  fileResponseSchema,
  fileMetadataSchema,
  parentTypeEnum,
};
