import {
  createProfile,
  deleteProfile,
  getAllProfiles,
  getProfileById,
  getProfilesCount,
  inviteProfileByEmail,
  updateProfile,
} from '../db/profilesQueries.js';

const ALLOWED_ROLES = new Set(['admin', 'staff', 'viewer']);

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

function hasValidRole(role) {
  return ALLOWED_ROLES.has(normalizeRole(role));
}

function handleError(res, error) {
  if (error?.code === 'PGRST116') {
    return res.status(404).json({ error: 'Profile not found' });
  }

  return res.status(500).json({ error: error?.message || 'Server error' });
}

function validateRoleForFilter(req, res) {
  if (req.query?.role === undefined) return true;
  if (hasValidRole(req.query.role)) return true;

  res.status(400).json({ error: 'role must be one of admin, staff, viewer' });
  return false;
}

function validateRoleForBody(req, res) {
  if (req.body?.role === undefined) return true;
  if (hasValidRole(req.body.role)) return true;

  res.status(400).json({ error: 'role must be one of admin, staff, viewer' });
  return false;
}

function buildInviteRedirectTo() {
  const appUrl = String(process.env.APP_URL || '')
    .trim()
    .replace(/\/+$/, '');
  if (!appUrl) return '';
  return `${appUrl}/app/sign-up`;
}

function isInviteAuthorized(req) {
  const expected = String(process.env.INVITE_API_KEY || '').trim();
  if (!expected) return true;

  const incoming = String(req.headers['x-invite-key'] || '').trim();
  return incoming === expected;
}

export async function getProfilesHandler(req, res) {
  if (!validateRoleForFilter(req, res)) return;

  try {
    const profiles = await getAllProfiles(req.query);
    res.json(profiles);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getProfilesCountHandler(req, res) {
  if (!validateRoleForFilter(req, res)) return;

  try {
    const count = await getProfilesCount(req.query);
    res.json({ count });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getProfileByIdHandler(req, res) {
  try {
    const profile = await getProfileById(req.params.id);
    res.json(profile);
  } catch (error) {
    handleError(res, error);
  }
}

export async function createProfileHandler(req, res) {
  const { full_name: fullName, email } = req.body ?? {};
  if (!fullName || !email) {
    return res.status(400).json({ error: 'full_name and email are required' });
  }

  if (!validateRoleForBody(req, res)) return;

  try {
    const payload = {
      ...req.body,
      role:
        req.body?.role === undefined ? 'viewer' : normalizeRole(req.body.role),
    };
    const profile = await createProfile(payload);
    res.status(201).json(profile);
  } catch (error) {
    handleError(res, error);
  }
}

export async function updateProfileHandler(req, res) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Update payload is required' });
  }

  if (req.body?.email !== undefined) {
    return res.status(400).json({ error: 'email cannot be updated' });
  }

  if (!validateRoleForBody(req, res)) return;

  try {
    const payload = { ...req.body };
    if (payload.role !== undefined) {
      payload.role = normalizeRole(payload.role);
    }
    const profile = await updateProfile(req.params.id, payload);
    res.json(profile);
  } catch (error) {
    handleError(res, error);
  }
}

export async function deleteProfileHandler(req, res) {
  try {
    const profile = await deleteProfile(req.params.id);
    res.json(profile);
  } catch (error) {
    handleError(res, error);
  }
}

export async function inviteProfileHandler(req, res) {
  if (!isInviteAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized invite request' });
  }

  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase();
  const role = normalizeRole(req.body?.role || 'viewer');

  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  if (!hasValidRole(role)) {
    return res
      .status(400)
      .json({ error: 'role must be one of admin, staff, viewer' });
  }

  try {
    const { user, profile } = await inviteProfileByEmail({
      email,
      role,
      redirectTo: buildInviteRedirectTo(),
    });

    res.status(201).json({
      message: 'Invite sent',
      user: user ? { id: user.id, email: user.email } : null,
      profile,
    });
  } catch (error) {
    handleError(res, error);
  }
}
