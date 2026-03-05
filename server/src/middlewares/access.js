function normalizeRole(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function requireRoles(...allowed) {
  const allowedRoles = new Set(allowed.map((role) => normalizeRole(role)));

  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const role = normalizeRole(req.userRole);
    if (!role) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!allowedRoles.has(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return next();
  };
}

export function requireAccess(...allowed) {
  return requireRoles(...allowed);
}
