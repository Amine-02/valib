import { appState } from '/src/state.js';

export const USER_ROLE_HEADER = 'x-user-role';

const ROLE_FALLBACK = 'viewer';
const ALLOWED_ROLES = new Set(['admin', 'staff', 'viewer']);

export function normalizeRole(role, fallback = ROLE_FALLBACK) {
  const safeRole = String(role || '')
    .trim()
    .toLowerCase();

  if (!safeRole) return fallback;
  if (ALLOWED_ROLES.has(safeRole)) return safeRole;
  return fallback;
}

export function getActiveUserRole() {
  return normalizeRole(appState.userRole, ROLE_FALLBACK);
}

export function setActiveUserRole(role) {
  const normalized = normalizeRole(role, ROLE_FALLBACK);
  appState.userRole = normalized;
  return normalized;
}

export function clearActiveUserRole() {
  appState.userRole = ROLE_FALLBACK;
}
