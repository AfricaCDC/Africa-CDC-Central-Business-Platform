import api from './api';

const unwrap = (p) => p.then((r) => r.data);

/**
 * API client for governance workflow templates and workflow execution.
 *
 * @example
 * const templates = await workflowApi.listTemplates();
 */
export const workflowApi = {
  // Templates
  listTemplates: (params) => unwrap(api.get('/governance/workflow-templates', { params })),
  getTemplate: (id) => unwrap(api.get(`/governance/workflow-templates/${id}`)),
  createTemplate: (data) => unwrap(api.post('/governance/workflow-templates', data)),
  updateTemplate: (id, data) => unwrap(api.put(`/governance/workflow-templates/${id}`, data)),
  deleteTemplate: (id) => unwrap(api.delete(`/governance/workflow-templates/${id}`)),
  replaceSteps: (id, steps) => unwrap(api.put(`/governance/workflow-templates/${id}/steps`, { steps })),
};
