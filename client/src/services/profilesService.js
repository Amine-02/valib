import { buildQuery, requestJson } from '/src/utils/http.js';

const PROFILES_API = '/api/profiles';

export function getProfiles(filters = {}) {
  return requestJson(`${PROFILES_API}${buildQuery(filters)}`);
}

export function getProfilesCount(filters = {}) {
  return requestJson(`${PROFILES_API}/count${buildQuery(filters)}`);
}

export function getProfileById(profileId) {
  return requestJson(`${PROFILES_API}/${profileId}`);
}

export function createProfile(profile) {
  return requestJson(PROFILES_API, {
    method: 'POST',
    body: JSON.stringify(profile),
  });
}

export function updateProfile(profileId, updates) {
  return requestJson(`${PROFILES_API}/${profileId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteProfile(profileId) {
  return requestJson(`${PROFILES_API}/${profileId}`, {
    method: 'DELETE',
  });
}

export function inviteProfile(
  { email, role = 'viewer', redirect_to = '' } = {},
  { inviteKey = '' } = {}
) {
  const headers = {};
  const safeInviteKey = String(inviteKey || '').trim();
  if (safeInviteKey) {
    headers['x-invite-key'] = safeInviteKey;
  }

  return requestJson(`${PROFILES_API}/invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, role, redirect_to }),
  });
}
