const { z } = require('zod');

const workplanItemSchema = z.object({
  title: z.string().min(1),
  item_type: z.enum(['ACTIVITY', 'TASK']),
  result_id: z.number().int().optional(),
  parent_id: z.number().int().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  responsible_division: z.string().optional(),
  q1_active: z.boolean().optional(),
  q2_active: z.boolean().optional(),
  q3_active: z.boolean().optional(),
  q4_active: z.boolean().optional(),
  budget_main: z.number().optional(),
  budget_pass_through: z.number().optional(),
  budget_technical_assistance: z.number().optional(),
  budget_special_projects: z.number().optional(),
  budget_total: z.number().optional(),
});

const workplanItemUpdateSchema = workplanItemSchema.partial();

module.exports = { workplanItemSchema, workplanItemUpdateSchema };
