import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { STATUSES } from '@rbm/lib/enums';
import { adminService } from '../../../services/adminService';

const NS = 'adm';
const MATRIX_KEY = [NS, 'rbac-matrix'];
const SETTINGS_KEY = [NS, 'settings-data'];
const PERIODS_KEY = [NS, 'reporting-periods'];

const STALE_REF = 300_000;

/**
 * RBAC Permission Matrix — matrix + roles in a single query.
 */
export function useRbacMatrix() {
  return useQuery({
    queryKey: MATRIX_KEY,
    queryFn: async () => {
      const [matrixRes, rolesRes] = await Promise.all([
        adminService.getRbacMatrix(),
        adminService.getRoles(),
      ]);
      const matrix = matrixRes?.data || matrixRes;
      const roles = Array.isArray(rolesRes?.data) ? rolesRes.data : (Array.isArray(rolesRes) ? rolesRes : []);
      return { matrix, roles };
    },
    staleTime: STALE_REF,
  });
}

/**
 * Toggle a single RBAC permission cell (cycle scope or delete).
 */
export function useUpdateRbacPermission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nextScope, role_id, module_code, action_code }) => {
      if (nextScope === null) {
        return adminService.deleteRbacPermission({ role_id, module_code, action_code });
      }
      return adminService.updateRbacPermission({ role_id, module_code, action_code, scope: nextScope });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: MATRIX_KEY });
    },
  });
}

/**
 * Admin Settings page — roles + tiers + business units.
 */
export function useAdminSettingsData() {
  return useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: async () => {
      const [rolesRes, tiersRes, busRes] = await Promise.all([
        adminService.getRoles().catch(() => []),
        adminService.getTiers().catch(() => []),
        adminService.getBusinessUnits().catch(() => []),
      ]);
      const unwrapArr = (r) => (Array.isArray(r?.data) ? r.data : (Array.isArray(r) ? r : []));
      return {
        roles: unwrapArr(rolesRes),
        tiers: unwrapArr(tiersRes),
        bus: unwrapArr(busRes),
      };
    },
    staleTime: STALE_REF,
  });
}

/** Reporting periods list. */
export function useReportingPeriods() {
  return useQuery({
    queryKey: PERIODS_KEY,
    queryFn: async () => {
      const res = await adminService.getReportingPeriods();
      return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    },
    staleTime: 60_000,
  });
}

/** Create a new reporting period (always starts as DRAFT). */
export function useCreatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => adminService.createReportingPeriod({ ...data, status: STATUSES.DRAFT }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
    },
  });
}

/** Update a reporting period (status toggle, field edits). */
export function useUpdatePeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => adminService.updateReportingPeriod(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PERIODS_KEY });
    },
  });
}

/** Bulk-replace role permissions array. */
export function useUpdateRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, permissions }) => adminService.updateRolePermissions(roleId, permissions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SETTINGS_KEY });
    },
  });
}

const APP_SETTINGS_KEY = (prefix) => [NS, 'app-settings', prefix || 'all'];

/**
 * App settings rows (D-20260707-01), optionally filtered by key prefix.
 *
 * @param {string} [prefix] — e.g. 'reminders.'
 */
export function useAppSettings(prefix) {
  return useQuery({
    queryKey: APP_SETTINGS_KEY(prefix),
    queryFn: async () => {
      const res = await adminService.getAppSettings(prefix);
      return Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    },
    staleTime: 60_000,
  });
}

/** Bulk-update existing app settings ({ key: value, ... }). */
export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings) => adminService.updateAppSettings(settings),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [NS, 'app-settings'] });
    },
  });
}
