const { refreshSchema } = require('./auth');
const { indicatorSchema, indicatorUpdateSchema } = require('./indicator');
const { workplanItemSchema, workplanItemUpdateSchema } = require('./workplan');
const { resultSchema, resultUpdateSchema } = require('./result');
const { notificationRequestSchema, notificationResponseSchema } = require('./notification');
const { pdfRequestSchema, pdfResponseSchema } = require('./pdf');
const { syncRequestSchema, syncResponseSchema, staffRecordSchema } = require('./sync');
const { fileRequestSchema, fileResponseSchema, fileMetadataSchema, parentTypeEnum } = require('./file');
const {
  approveStepBodySchema,
  rejectStepBodySchema,
  adminBypassBodySchema,
} = require('./approval');
const {
  generateRequestSchema,
  memberSchema: fileGeneratorMemberSchema,
  baseOptions: fileGeneratorBaseOptions,
  pdfOptions: fileGeneratorPdfOptions,
  zipOptions: fileGeneratorZipOptions,
  SAFE_SLUG: FILE_GENERATOR_TEMPLATE_SLUG,
  FORMATS: FILE_GENERATOR_FORMATS,
} = require('./fileGenerator');

module.exports = {
  refreshSchema,
  indicatorSchema,
  indicatorUpdateSchema,
  workplanItemSchema,
  workplanItemUpdateSchema,
  resultSchema,
  resultUpdateSchema,
  notificationRequestSchema,
  notificationResponseSchema,
  pdfRequestSchema,
  pdfResponseSchema,
  syncRequestSchema,
  syncResponseSchema,
  staffRecordSchema,
  fileRequestSchema,
  fileResponseSchema,
  fileMetadataSchema,
  parentTypeEnum,
  approveStepBodySchema,
  rejectStepBodySchema,
  adminBypassBodySchema,
  generateRequestSchema,
  fileGeneratorMemberSchema,
  fileGeneratorBaseOptions,
  fileGeneratorPdfOptions,
  fileGeneratorZipOptions,
  FILE_GENERATOR_TEMPLATE_SLUG,
  FILE_GENERATOR_FORMATS,
};
