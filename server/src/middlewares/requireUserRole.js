const ROLE_HEADER = 'x-user-role';
const DEFAULT_ROLE = 'viewer';
const ALLOWED_ROLES = new Set(['admin', 'staff', 'viewer']);

function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function requireUserRole(req, res, next) {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const role = normalizeRole(req.get(ROLE_HEADER)) || DEFAULT_ROLE;
  if (!ALLOWED_ROLES.has(role)) {
    return res.status(403).json({
      error: `${ROLE_HEADER} must be one of admin, staff, viewer`,
    });
  }

  req.userRole = role;
  return next();
}
