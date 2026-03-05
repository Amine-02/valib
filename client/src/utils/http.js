import { getActiveUserRole, USER_ROLE_HEADER } from '/src/utils/role.js';

export function buildQuery(params = {}) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    searchParams.set(key, String(value));
  });

  const query = searchParams.toString();
  return query ? `?${query}` : '';
}

export async function requestJson(url, options = {}) {
  const role = getActiveUserRole();
  const headers = {
    'Content-Type': 'application/json',
    [USER_ROLE_HEADER]: role,
    ...(options.headers ?? {}),
  };

  const response = await fetch(url, {
    headers,
    ...options,
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed (${response.status})`);
  }

  return payload;
}
