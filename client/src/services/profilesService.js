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

export function purgeUnauthorizedSelf(accessToken) {
  const safeAccessToken = String(accessToken || '').trim();
  const headers = {};
  if (safeAccessToken) {
    headers.Authorization = `Bearer ${safeAccessToken}`;
  }

  return requestJson(`${PROFILES_API}/purge-unauthorized-self`, {
    method: 'POST',
    headers,
  });
}

export function inviteProfile(
  { email, role = 'viewer' } = {},
  { inviteKey = '' } = {}
) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const safeInviteKey = String(inviteKey || '').trim();
  if (safeInviteKey) {
    headers['x-invite-key'] = safeInviteKey;
  }

  return requestJson(`${PROFILES_API}/invite`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ email, role }),
  });
}
