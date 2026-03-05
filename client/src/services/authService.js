import { requestJson } from '/src/utils/http.js';

const AUTH_API = '/api/auth';

function withBearerToken(accessToken) {
  const safeAccessToken = String(accessToken || '').trim();
  const headers = {};

  if (safeAccessToken) {
    headers.Authorization = `Bearer ${safeAccessToken}`;
  }

  return headers;
}

export function getSessionProfile(accessToken) {
  return requestJson(`${AUTH_API}/me`, {
    headers: withBearerToken(accessToken),
  });
}

export function purgeUnauthorizedSelf(accessToken) {
  return requestJson(`${AUTH_API}/purge-unauthorized-self`, {
    method: 'POST',
    headers: withBearerToken(accessToken),
  });
}

export function completeSignup(accessToken, payload = {}) {
  return requestJson(`${AUTH_API}/complete-signup`, {
    method: 'POST',
    headers: withBearerToken(accessToken),
    body: JSON.stringify(payload),
  });
}
