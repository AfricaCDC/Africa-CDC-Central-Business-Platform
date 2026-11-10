const { z } = require('zod');

const resultSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  level: z.enum(['IMPACT', 'OUTCOME', 'OUTPUT']),
  parent_result_id: z.number().int().optional(),
  outcome_indicator_id: z.number().int().optional(),
  status: z.string().optional(),
  budget_main: z.number().optional(),
  budget_pass_through: z.number().optional(),
  budget_technical_assistance: z.number().optional(),
  budget_special_projects: z.number().optional(),
  budget_total: z.number().optional(),
});

const resultUpdateSchema = resultSchema.partial();

module.exports = { resultSchema, resultUpdateSchema };
