import {
  createProfile,
  deleteAuthUserById,
  getAuthUserByAccessToken,
  getProfileById,
  updateProfile,
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

function normalizeRole(value, fallback = 'viewer') {
  const safe = String(value || '')
    .trim()
    .toLowerCase();

  if (safe === 'admin' || safe === 'staff' || safe === 'viewer') {
    return safe;
  }

  return fallback;
}

function getRoleFromAuthUser(authUser) {
  return normalizeRole(
    authUser?.app_metadata?.role || authUser?.user_metadata?.role,
    'viewer'
  );
}

function isDuplicateProfileError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();

  return (
    error?.code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint')
  );
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

export async function completeSignupHandler(req, res) {
  const authUser = await getAuthUserFromRequest(req, res);
  if (!authUser) return;

  const fullName = String(req.body?.full_name || '').trim();
  const phone = String(req.body?.phone || '').trim();

  if (!fullName || !phone) {
    return res.status(400).json({ error: 'full_name and phone are required' });
  }

  const payload = {
    id: authUser.id,
    email: authUser.email,
    full_name: fullName,
    phone,
    role: getRoleFromAuthUser(authUser),
  };

  try {
    const updated = await updateProfile(authUser.id, payload);
    return res.json(updated);
  } catch (updateError) {
    if (updateError?.code !== 'PGRST116') {
      return handleError(res, updateError);
    }
  }

  try {
    const created = await createProfile(payload);
    return res.status(201).json(created);
  } catch (createError) {
    if (!isDuplicateProfileError(createError)) {
      return handleError(res, createError);
    }

    try {
      const updated = await updateProfile(authUser.id, payload);
      return res.json(updated);
    } catch (retryError) {
      return handleError(res, retryError);
    }
  }
}
