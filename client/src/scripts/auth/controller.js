import { createProfile, updateProfile } from '/src/services/profilesService.js';
import { getSupabaseBrowserClient } from '/src/utils/supabase.js';

const ROLE_FALLBACK = 'viewer';
const REDIRECT_AFTER_SIGN_IN = '/app';
const REDIRECT_AFTER_SIGN_UP = '/app/sign-in';

function getById(id) {
  return document.getElementById(id);
}

function setMessage(el, message, type = 'error') {
  if (!el) return;
  const text = String(message || '').trim();
  if (!text) {
    el.textContent = '';
    el.classList.add('hidden');
    el.classList.remove('text-danger-text', 'text-success-text');
    return;
  }

  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('text-danger-text', type !== 'success');
  el.classList.toggle('text-success-text', type === 'success');
}

function setDisabled(el, disabled) {
  if (!(el instanceof HTMLElement)) return;
  el.toggleAttribute('disabled', !!disabled);
  el.classList.toggle('opacity-60', !!disabled);
}

function normalizePhone(value) {
  return String(value || '').trim();
}

function normalizeRole(role) {
  const safe = String(role || '')
    .trim()
    .toLowerCase();
  return safe || ROLE_FALLBACK;
}

function getInviteTokenFromUrl() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const tokenHash = String(
    query.get('token_hash') || hash.get('token_hash') || ''
  ).trim();
  const type = String(query.get('type') || hash.get('type') || '')
    .trim()
    .toLowerCase();
  const code = String(query.get('code') || hash.get('code') || '').trim();
  const accessToken = String(
    query.get('access_token') || hash.get('access_token') || ''
  ).trim();
  const refreshToken = String(
    query.get('refresh_token') || hash.get('refresh_token') || ''
  ).trim();

  return { tokenHash, type, code, accessToken, refreshToken };
}

function stripAuthTokenQueryParams() {
  const url = new URL(window.location.href);
  let changed = false;

  [
    'token_hash',
    'type',
    'next',
    'error',
    'error_code',
    'error_description',
  ].forEach((key) => {
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
    changed = true;
  });

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  [
    'token_hash',
    'type',
    'next',
    'error',
    'error_code',
    'error_description',
    'access_token',
    'refresh_token',
    'code',
  ].forEach((key) => {
    if (!hashParams.has(key)) return;
    hashParams.delete(key);
    changed = true;
  });

  url.hash = hashParams.toString();

  if (!changed) return;
  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function isAuthSessionMissingError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();
  return message.includes('auth session missing');
}

async function getInviteSessionUser(client) {
  const { tokenHash, type, code, accessToken, refreshToken } =
    getInviteTokenFromUrl();

  const { data: existingSession } = await client.auth.getSession();
  if (existingSession?.session?.user) {
    return existingSession.session.user;
  }

  if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error && !isAuthSessionMissingError(error)) {
      throw error;
    }
  }

  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error && !isAuthSessionMissingError(error)) {
      throw error;
    }
  }

  if (tokenHash) {
    const otpType = ['invite', 'signup', 'email'].includes(type)
      ? type
      : 'invite';
    const { data, error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error && !isAuthSessionMissingError(error)) throw error;
    if (data?.user) {
      stripAuthTokenQueryParams();
      return data.user;
    }
  }

  const { data, error } = await client.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) throw error;
  if (data?.user) {
    stripAuthTokenQueryParams();
    return data.user;
  }
  return null;
}

async function upsertProfileFromSignup({
  userId,
  email,
  fullName,
  phone,
  role,
}) {
  const payload = {
    id: userId,
    email,
    full_name: fullName,
    phone,
    role,
  };

  try {
    await updateProfile(userId, payload);
    return;
  } catch {
    await createProfile(payload);
  }
}

export function bindSignInForm() {
  const form = getById('sign-in-form');
  if (!(form instanceof HTMLFormElement) || form.dataset.bound === 'true') {
    return;
  }

  const emailInput = getById('sign-in-email');
  const passwordInput = getById('sign-in-password');
  const submitButton = getById('sign-in-submit');
  const feedback = getById('sign-in-feedback');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(feedback, '');

    const email = String(emailInput?.value || '')
      .trim()
      .toLowerCase();
    const password = String(passwordInput?.value || '');

    if (!email || !password) {
      setMessage(feedback, 'Email and password are required.');
      return;
    }

    setDisabled(submitButton, true);

    try {
      const client = getSupabaseBrowserClient();
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      setMessage(feedback, 'Signed in successfully.', 'success');
      window.location.assign(REDIRECT_AFTER_SIGN_IN);
    } catch (error) {
      setMessage(
        feedback,
        error?.message || 'Failed to sign in. Please try again.'
      );
    } finally {
      setDisabled(submitButton, false);
    }
  });

  form.dataset.bound = 'true';
}

export async function bindSignUpForm() {
  const form = getById('sign-up-form');
  if (!(form instanceof HTMLFormElement) || form.dataset.bound === 'true') {
    return;
  }

  const emailInput = getById('sign-up-email');
  const passwordInput = getById('sign-up-password');
  const confirmInput = getById('sign-up-password-confirm');
  const fullNameInput = getById('sign-up-full-name');
  const phoneInput = getById('sign-up-phone');
  const submitButton = getById('sign-up-submit');
  const feedback = getById('sign-up-feedback');

  let inviteUser = null;
  let invitedRole = ROLE_FALLBACK;

  try {
    const client = getSupabaseBrowserClient();
    inviteUser = await getInviteSessionUser(client);

    if (!inviteUser?.id || !inviteUser?.email) {
      setMessage(
        feedback,
        'Invalid invite link. Ask an admin to resend your invite.'
      );
      setDisabled(submitButton, true);
    } else {
      invitedRole = normalizeRole(inviteUser.user_metadata?.role);
      if (emailInput instanceof HTMLInputElement) {
        emailInput.value = inviteUser.email;
        emailInput.readOnly = true;
        emailInput.classList.add('bg-surface-muted');
      }
    }
  } catch (error) {
    const message = isAuthSessionMissingError(error)
      ? 'Invite session missing. Open the latest invite email link again.'
      : error?.message || 'Unable to validate invite link. Try again.';
    setMessage(feedback, message);
    setDisabled(submitButton, true);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(feedback, '');

    if (!inviteUser?.id || !inviteUser?.email) {
      setMessage(feedback, 'Invite link is missing or invalid.');
      return;
    }

    const email = String(emailInput?.value || '')
      .trim()
      .toLowerCase();
    const password = String(passwordInput?.value || '');
    const passwordConfirm = String(confirmInput?.value || '');
    const fullName = String(fullNameInput?.value || '').trim();
    const phone = normalizePhone(phoneInput?.value);

    if (!email || !password || !passwordConfirm || !fullName || !phone) {
      setMessage(feedback, 'All fields are required.');
      return;
    }

    if (email !== String(inviteUser.email || '').toLowerCase()) {
      setMessage(feedback, 'Email must match the invited email address.');
      return;
    }

    if (password !== passwordConfirm) {
      setMessage(feedback, 'Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setMessage(feedback, 'Password must be at least 6 characters.');
      return;
    }

    setDisabled(submitButton, true);

    try {
      const client = getSupabaseBrowserClient();

      const { error: updateAuthError } = await client.auth.updateUser({
        password,
        data: {
          full_name: fullName,
          phone,
          role: invitedRole,
        },
      });
      if (updateAuthError) throw updateAuthError;

      await upsertProfileFromSignup({
        userId: inviteUser.id,
        email,
        fullName,
        phone,
        role: invitedRole,
      });

      await client.auth.signOut();

      setMessage(
        feedback,
        'Account setup complete. Redirecting to sign in...',
        'success'
      );
      window.setTimeout(() => {
        window.location.assign(REDIRECT_AFTER_SIGN_UP);
      }, 700);
    } catch (error) {
      setMessage(
        feedback,
        error?.message || 'Failed to complete signup. Please try again.'
      );
      setDisabled(submitButton, false);
    }
  });

  form.dataset.bound = 'true';
}
