import { supabaseAdmin } from './supabaseClient.js';
import { applyPagination } from '../utils/query.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_DIRECTION = 'desc';
const ALLOWED_ROLES = new Set(['admin', 'staff', 'viewer']);
const SORTABLE_PROFILE_FIELDS = new Set([
  'id',
  'full_name',
  'email',
  'phone',
  'role',
  'created_at',
]);

function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toLowerCase();
}

function buildProfilePayload(input = {}) {
  const payload = {};

  if (input.id !== undefined) payload.id = input.id;
  if (input.full_name !== undefined) {
    payload.full_name = String(input.full_name || '').trim();
  }
  if (input.email !== undefined) {
    payload.email = String(input.email || '').trim();
  }
  if (input.phone !== undefined) {
    payload.phone = String(input.phone || '').trim() || null;
  }
  if (input.role !== undefined) {
    payload.role = normalizeRole(input.role) || 'viewer';
  }

  return payload;
}

function applyProfileSorting(query, filters = {}) {
  const rawSort = String(filters.sort || DEFAULT_SORT_FIELD)
    .trim()
    .toLowerCase();
  const sort = SORTABLE_PROFILE_FIELDS.has(rawSort)
    ? rawSort
    : DEFAULT_SORT_FIELD;

  const rawDirection = String(
    filters.direction || filters.order || DEFAULT_SORT_DIRECTION
  )
    .trim()
    .toLowerCase();
  const ascending = rawDirection === 'asc';

  return query.order(sort, { ascending });
}

function applyProfileFilters(query, filters = {}) {
  let next = query;

  const role = normalizeRole(filters.role);
  if (role && ALLOWED_ROLES.has(role)) {
    next = next.eq('role', role);
  }

  if (filters.search) {
    const safe = String(filters.search).trim();
    if (safe) {
      next = next.or(
        `full_name.ilike.%${safe}%,email.ilike.%${safe}%,phone.ilike.%${safe}%,role.ilike.%${safe}%`
      );
    }
  }

  return next;
}

export async function getAllProfiles(filters = {}) {
  const query = applyPagination(
    applyProfileSorting(
      applyProfileFilters(supabaseAdmin.from('profiles').select('*'), filters),
      filters
    ),
    filters,
    { defaultPageSize: DEFAULT_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE }
  );

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

export async function getProfilesCount(filters = {}) {
  const query = applyProfileFilters(
    supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }),
    filters
  );

  const { count, error } = await query;
  if (error) throw error;

  return count ?? 0;
}

export async function getProfileById(profileId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .single();

  if (error) throw error;
  return data;
}

export async function createProfile(profile) {
  const payload = buildProfilePayload(profile);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .insert([payload])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateProfile(profileId, updates) {
  const payload = buildProfilePayload(updates);

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update(payload)
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteProfile(profileId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .delete()
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function inviteProfileByEmail({
  email,
  role = 'viewer',
  redirectTo = '',
} = {}) {
  const safeEmail = String(email || '')
    .trim()
    .toLowerCase();
  const safeRole = normalizeRole(role) || 'viewer';

  const options = {
    data: { role: safeRole },
  };
  if (String(redirectTo || '').trim()) {
    options.redirectTo = String(redirectTo).trim();
  }

  const { data: inviteData, error: inviteError } =
    await supabaseAdmin.auth.admin.inviteUserByEmail(safeEmail, options);
  if (inviteError) throw inviteError;

  const invitedUser = inviteData?.user ?? null;
  if (!invitedUser?.id) {
    return { user: null, profile: null };
  }

  const fallbackFullName =
    String(invitedUser.email || safeEmail)
      .split('@')[0]
      ?.trim() || 'Invited user';

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .upsert(
      [
        {
          id: invitedUser.id,
          full_name: fallbackFullName,
          email: invitedUser.email || safeEmail,
          phone: null,
          role: safeRole,
        },
      ],
      { onConflict: 'id' }
    )
    .select()
    .single();

  if (profileError) throw profileError;

  return { user: invitedUser, profile };
}
