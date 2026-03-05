import {
  deleteAuthUserById,
  getAuthUserByAccessToken,
  getProfileById,
} from '../db/profilesQueries.js';

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || '').trim();
  if (!authHeader.toLowerCase().startsWith('bearer ')) return '';
  return authHeader.slice(7).trim();
}

function handleError(res, error) {
  if (error?.code === 'PGRST116') {
    return res.status(404).json({ error: 'Profile not found' });
  }

  return res.status(500).json({ error: error?.message || 'Server error' });
}

async function getAuthUserFromRequest(req, res) {
  const accessToken = getBearerToken(req);
  if (!accessToken) {
    res.status(401).json({ error: 'Missing bearer token' });
    return null;
  }

  let authUser;
  try {
    authUser = await getAuthUserByAccessToken(accessToken);
  } catch {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  if (!authUser?.id) {
    res.status(401).json({ error: 'Invalid or expired session' });
    return null;
  }

  return authUser;
}

export async function getCurrentSessionProfileHandler(req, res) {
  const authUser = await getAuthUserFromRequest(req, res);
  if (!authUser) return;

  try {
    const profile = await getProfileById(authUser.id);
    return res.json(profile);
  } catch (error) {
    return handleError(res, error);
  }
}

export async function purgeUnauthorizedSelfHandler(req, res) {
  const authUser = await getAuthUserFromRequest(req, res);
  if (!authUser) return;

  try {
    const profile = await getProfileById(authUser.id);
    return res.json({
      valid: true,
      deleted: false,
      role: profile?.role || null,
    });
  } catch (error) {
    if (error?.code !== 'PGRST116') {
      return handleError(res, error);
    }
  }

  try {
    await deleteAuthUserById(authUser.id);
    return res.json({ valid: false, deleted: true });
  } catch (error) {
    return handleError(res, error);
  }
}
