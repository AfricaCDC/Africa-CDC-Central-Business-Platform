const { z } = require('zod');

const indicatorSchema = z.object({
  indicator_code: z.string().min(1),
  indicator_name: z.string().min(1),
  indicator_type: z.enum(['QUANTITATIVE', 'QUALITATIVE', 'COMPOSITE']).optional(),
  standard_custom: z.enum(['Standard', 'Custom']).optional(),
  tier_id: z.number().int().min(1).max(4).optional(),
  category: z.string().optional(),
  rationale: z.string().optional(),
  definition: z.string().optional(),
  baseline_value: z.string().optional(),
  baseline_source: z.string().optional(),
  target_fy1: z.string().optional(),
  target_fy2: z.string().optional(),
  target_fy3: z.string().optional(),
  target_fy4: z.string().optional(),
  target_fy5: z.string().optional(),
  overall_target: z.string().optional(),
  data_source: z.string().optional(),
  data_collection_method: z.string().optional(),
  reporting_frequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']).optional(),
  reporting_level: z.string().optional(),
});

const indicatorUpdateSchema = indicatorSchema.partial();

module.exports = { indicatorSchema, indicatorUpdateSchema };
