import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { workflowApi } from '../../../services/workflowApi';

const WF_LIST_KEY = ['workflow-templates'];
const WF_DETAIL_KEY = (id) => ['workflow-template', String(id)];

const STALE_LIST = 60_000;

/** List all workflow templates. */
export function useWorkflowTemplates() {
  return useQuery({
    queryKey: WF_LIST_KEY,
    queryFn: async () => {
      const res = await workflowApi.listTemplates();
      return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    },
    staleTime: STALE_LIST,
  });
}

/** Single workflow template by id (with steps). */
export function useWorkflowTemplate(id) {
  const numId = parseInt(id, 10);
  return useQuery({
    queryKey: WF_DETAIL_KEY(numId),
    queryFn: async () => {
      const res = await workflowApi.getTemplate(numId);
      return res?.data || res;
    },
    enabled: Boolean(id) && id !== 'new',
    staleTime: STALE_LIST,
  });
}

/** Create or update a workflow template (+ replace steps on edit). */
export function useSaveWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isNew, form, steps }) => {
      if (isNew) {
        return workflowApi.createTemplate({ ...form, steps });
      }
      const numId = parseInt(id, 10);
      await workflowApi.updateTemplate(numId, form);
      await workflowApi.replaceSteps(numId, steps);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WF_LIST_KEY });
      qc.invalidateQueries({ queryKey: ['workflow-template'] });
    },
  });
}

/** Toggle template active/inactive (deactivate = delete, activate = update). */
export function useToggleWorkflowTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }) => {
      if (isActive) {
        return workflowApi.deleteTemplate(id);
      }
      return workflowApi.updateTemplate(id, { is_active: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: WF_LIST_KEY });
    },
  });
}
