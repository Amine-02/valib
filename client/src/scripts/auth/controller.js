import {
  completeSignup,
  getSessionProfile,
  purgeUnauthorizedSelf,
} from '/src/services/authService.js';
import { formatPhoneNumber } from '/src/utils/phone.js';
import { getSupabaseBrowserClient } from '/src/utils/supabase.js';

const ROLE_FALLBACK = 'viewer';
const REDIRECT_AFTER_SIGN_IN = '/app';
const REDIRECT_AFTER_SIGN_UP = '/app';
const OAUTH_REDIRECT_SIGN_IN = '/app/sign-in';
const OAUTH_REDIRECT_SIGN_UP = '/app/sign-up';
const GOOGLE_PROVIDER = 'google';
const INVITE_REQUIRED_MESSAGE =
  'This account is not invited yet. Ask an admin to send an invite.';

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

function getRedirectUrl(path) {
  return `${window.location.origin}${path}`;
}

function hasProviderIdentity(user, provider) {
  const safeProvider = String(provider || '')
    .trim()
    .toLowerCase();
  if (!safeProvider) return false;

  const identities = Array.isArray(user?.identities) ? user.identities : [];
  if (
    identities.some(
      (identity) =>
        String(identity?.provider || '')
          .trim()
          .toLowerCase() === safeProvider
    )
  ) {
    return true;
  }

  const metadataProviders = Array.isArray(user?.app_metadata?.providers)
    ? user.app_metadata.providers
    : [];
  if (
    metadataProviders.some(
      (currentProvider) =>
        String(currentProvider || '')
          .trim()
          .toLowerCase() === safeProvider
    )
  ) {
    return true;
  }

  return (
    String(user?.app_metadata?.provider || '')
      .trim()
      .toLowerCase() === safeProvider
  );
}

function normalizeRole(role) {
  const safe = String(role || '')
    .trim()
    .toLowerCase();
  return safe || ROLE_FALLBACK;
}

function getAuthTokenFromUrl() {
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

function getAuthErrorFromUrl() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));

  const errorDescription = String(
    query.get('error_description') || hash.get('error_description') || ''
  ).trim();
  if (errorDescription) return errorDescription;

  return String(query.get('error') || hash.get('error') || '').trim();
}

function stripAuthTokenQueryParams() {
  const url = new URL(window.location.href);
  let changed = false;

  [
    'token_hash',
    'type',
    'next',
    'code',
    'access_token',
    'refresh_token',
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

function isProfileMissingError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();
  return (
    message.includes('profile not found') ||
    message.includes('request failed (404)')
  );
}

function isProfileSetupComplete(profile) {
  const fullName = String(profile?.full_name || '').trim();
  const phone = String(profile?.phone || '').trim();
  return !!(fullName && phone);
}

function isTransientNetworkError(error) {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();

  if (!message) return false;

  return (
    message.includes('network error') ||
    message.includes('networkerror') ||
    message.includes('failed to fetch') ||
    message.includes('load failed') ||
    message.includes('request aborted') ||
    message.includes('aborterror') ||
    message.includes('signal is aborted')
  );
}

async function getSessionAccessToken(client) {
  if (!client) return '';

  try {
    const { data } = await client.auth.getSession();
    return String(data?.session?.access_token || '').trim();
  } catch {
    return '';
  }
}

async function tryRecoverSignedInRedirect(client, feedbackEl) {
  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return false;

    if (!(await enforceInvitedAccount(client, data.user, feedbackEl))) {
      return true;
    }

    setMessage(feedbackEl, 'Signed in successfully.', 'success');
    window.location.assign(REDIRECT_AFTER_SIGN_IN);
    return true;
  } catch {
    return false;
  }
}

async function tryRecoverSignUpRedirect(client, feedbackEl) {
  const accessToken = await getSessionAccessToken(client);
  if (!accessToken) return false;

  try {
    const profile = await getSessionProfile(accessToken);
    if (!isProfileSetupComplete(profile)) return false;

    setMessage(feedbackEl, 'Account setup complete. Redirecting...', 'success');
    window.location.assign(REDIRECT_AFTER_SIGN_UP);
    return true;
  } catch {
    return false;
  }
}

async function getAuthSessionUser(
  client,
  { allowOtp = false, otpFallbackType = 'invite' } = {}
) {
  const { tokenHash, type, code, accessToken, refreshToken } =
    getAuthTokenFromUrl();
  const hasAuthParams = !!(tokenHash || code || accessToken || refreshToken);

  const { data: existingSession } = await client.auth.getSession();
  const hasExistingSessionUser = !!existingSession?.session?.user;

  if (!hasExistingSessionUser && code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error && !isAuthSessionMissingError(error)) {
      throw error;
    }
  }

  if (!hasExistingSessionUser && accessToken && refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error && !isAuthSessionMissingError(error)) {
      throw error;
    }
  }

  if (!hasExistingSessionUser && allowOtp && tokenHash) {
    const otpType = ['invite', 'signup', 'email'].includes(type)
      ? type
      : otpFallbackType;
    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });

    if (error && !isAuthSessionMissingError(error)) throw error;
  }

  const { data, error } = await client.auth.getUser();
  if (error && !isAuthSessionMissingError(error)) throw error;
  if (data?.user) {
    if (hasAuthParams) stripAuthTokenQueryParams();
    return data.user;
  }

  if (hasAuthParams) stripAuthTokenQueryParams();
  return hasExistingSessionUser ? existingSession.session.user : null;
}

async function enforceInvitedAccount(client, user, feedbackEl) {
  if (!user?.id) return false;

  const accessToken = await getSessionAccessToken(client);
  if (!accessToken) {
    await client.auth.signOut();
    setMessage(feedbackEl, INVITE_REQUIRED_MESSAGE);
    return false;
  }

  try {
    await getSessionProfile(accessToken);
    return true;
  } catch (error) {
    if (!isProfileMissingError(error)) {
      throw error;
    }
  }

  try {
    await purgeUnauthorizedSelf(accessToken);
  } catch {
    // Ignore cleanup failures; sign-out + message still enforce invite-only access.
  }

  await client.auth.signOut();
  setMessage(feedbackEl, INVITE_REQUIRED_MESSAGE);
  return false;
}

export async function bindSignInForm() {
  const form = getById('sign-in-form');
  if (!(form instanceof HTMLFormElement) || form.dataset.bound === 'true') {
    return;
  }

  const emailInput = getById('sign-in-email');
  const passwordInput = getById('sign-in-password');
  const submitButton = getById('sign-in-submit');
  const googleButton = getById('sign-in-google');
  const feedback = getById('sign-in-feedback');
  const client = getSupabaseBrowserClient();

  if (googleButton instanceof HTMLButtonElement) {
    googleButton.addEventListener('click', async () => {
      setMessage(feedback, '');
      setDisabled(submitButton, true);
      setDisabled(googleButton, true);

      try {
        const { error } = await client.auth.signInWithOAuth({
          provider: GOOGLE_PROVIDER,
          options: {
            redirectTo: getRedirectUrl(OAUTH_REDIRECT_SIGN_IN),
          },
        });
        if (error) throw error;
      } catch (error) {
        setMessage(
          feedback,
          error?.message || 'Failed to start Google sign-in. Please try again.'
        );
        setDisabled(submitButton, false);
        setDisabled(googleButton, false);
      }
    });
  }

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
    setDisabled(googleButton, true);

    try {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      const { data: authData, error: userError } = await client.auth.getUser();
      if (userError) throw userError;
      if (!(await enforceInvitedAccount(client, authData?.user, feedback))) {
        return;
      }

      setMessage(feedback, 'Signed in successfully.', 'success');
      window.location.assign(REDIRECT_AFTER_SIGN_IN);
    } catch (error) {
      if (
        isTransientNetworkError(error) &&
        (await tryRecoverSignedInRedirect(client, feedback))
      ) {
        return;
      }

      setMessage(
        feedback,
        error?.message || 'Failed to sign in. Please try again.'
      );
    } finally {
      setDisabled(submitButton, false);
      setDisabled(googleButton, false);
    }
  });

  form.dataset.bound = 'true';

  const authError = getAuthErrorFromUrl();
  if (authError) {
    setMessage(feedback, authError);
    stripAuthTokenQueryParams();
  }

  setDisabled(submitButton, true);
  setDisabled(googleButton, true);
  try {
    const user = await getAuthSessionUser(client);
    if (!user?.id) return;
    if (!(await enforceInvitedAccount(client, user, feedback))) {
      return;
    }

    setMessage(feedback, 'Signed in successfully.', 'success');
    window.location.assign(REDIRECT_AFTER_SIGN_IN);
  } catch (error) {
    if (
      isTransientNetworkError(error) &&
      (await tryRecoverSignedInRedirect(client, feedback))
    ) {
      return;
    }

    setMessage(
      feedback,
      error?.message || 'Failed to restore your sign-in session.'
    );
  } finally {
    setDisabled(submitButton, false);
    setDisabled(googleButton, false);
  }
}

export async function bindSignUpForm() {
  const form = getById('sign-up-form');
  if (!(form instanceof HTMLFormElement) || form.dataset.bound === 'true') {
    return;
  }

  const emailInput = getById('sign-up-email');
  const passwordInput = getById('sign-up-password');
  const confirmInput = getById('sign-up-password-confirm');
  const passwordField = getById('sign-up-password-field');
  const passwordConfirmField = getById('sign-up-password-confirm-field');
  const fullNameInput = getById('sign-up-full-name');
  const phoneInput = getById('sign-up-phone');
  const submitButton = getById('sign-up-submit');
  const googleLinkButton = getById('sign-up-google-link');
  const subtitle = getById('sign-up-subtitle');
  const feedback = getById('sign-up-feedback');
  const defaultSubtitle = String(subtitle?.textContent || '').trim();
  const client = getSupabaseBrowserClient();

  if (phoneInput instanceof HTMLInputElement) {
    phoneInput.addEventListener('input', () => {
      phoneInput.value = formatPhoneNumber(phoneInput.value);
    });
  }

  let inviteUser = null;
  let invitedRole = ROLE_FALLBACK;

  function syncGoogleSignupState() {
    const inviteReady = !!inviteUser?.id && !!inviteUser?.email;
    const googleLinked = hasProviderIdentity(inviteUser, GOOGLE_PROVIDER);
    const hidePasswordInputs = googleLinked;

    if (subtitle instanceof HTMLElement) {
      subtitle.textContent = googleLinked
        ? 'Google is linked for this invite. You can finish profile with or without password.'
        : defaultSubtitle;
    }

    if (passwordField instanceof HTMLElement) {
      passwordField.classList.toggle('hidden', hidePasswordInputs);
      passwordField.setAttribute(
        'aria-hidden',
        hidePasswordInputs ? 'true' : 'false'
      );
    }

    if (passwordConfirmField instanceof HTMLElement) {
      passwordConfirmField.classList.toggle('hidden', hidePasswordInputs);
      passwordConfirmField.setAttribute(
        'aria-hidden',
        hidePasswordInputs ? 'true' : 'false'
      );
    }

    if (passwordInput instanceof HTMLInputElement) {
      if (hidePasswordInputs) passwordInput.value = '';
      setDisabled(passwordInput, hidePasswordInputs);
    }

    if (confirmInput instanceof HTMLInputElement) {
      if (hidePasswordInputs) confirmInput.value = '';
      setDisabled(confirmInput, hidePasswordInputs);
    }

    if (googleLinkButton instanceof HTMLButtonElement) {
      googleLinkButton.textContent = googleLinked
        ? 'Google account linked'
        : 'Link Google account';
      setDisabled(googleLinkButton, !inviteReady || googleLinked);
    }

    return { inviteReady, googleLinked };
  }

  if (googleLinkButton instanceof HTMLButtonElement) {
    googleLinkButton.addEventListener('click', async () => {
      setMessage(feedback, '');

      const { inviteReady, googleLinked } = syncGoogleSignupState();
      if (!inviteReady) {
        setMessage(feedback, 'Invite link is missing or invalid.');
        return;
      }
      if (googleLinked) {
        setMessage(feedback, 'Google account is already linked.', 'success');
        return;
      }

      setDisabled(submitButton, true);
      setDisabled(googleLinkButton, true);

      try {
        const { error } = await client.auth.linkIdentity({
          provider: GOOGLE_PROVIDER,
          options: {
            redirectTo: getRedirectUrl(OAUTH_REDIRECT_SIGN_UP),
          },
        });
        if (error) throw error;
      } catch (error) {
        setMessage(
          feedback,
          error?.message || 'Failed to start Google account linking.'
        );
        setDisabled(submitButton, false);
        syncGoogleSignupState();
      }
    });
  }

  const authError = getAuthErrorFromUrl();
  if (authError) {
    setMessage(feedback, authError);
    stripAuthTokenQueryParams();
  }

  try {
    inviteUser = await getAuthSessionUser(client, {
      allowOtp: true,
      otpFallbackType: 'invite',
    });

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
      setDisabled(submitButton, false);
    }
  } catch (error) {
    const message = isAuthSessionMissingError(error)
      ? 'Invite session missing. Open the latest invite email link again.'
      : error?.message || 'Unable to validate invite link. Try again.';
    setMessage(feedback, message);
    setDisabled(submitButton, true);
  } finally {
    syncGoogleSignupState();
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(feedback, '');

    const { inviteReady, googleLinked } = syncGoogleSignupState();
    if (!inviteReady) {
      setMessage(feedback, 'Invite link is missing or invalid.');
      return;
    }

    const email = String(emailInput?.value || '')
      .trim()
      .toLowerCase();
    const password = String(passwordInput?.value || '');
    const passwordConfirm = String(confirmInput?.value || '');
    const hasPasswordInput = !!(password || passwordConfirm);
    const fullName = String(fullNameInput?.value || '').trim();
    const phone = formatPhoneNumber(phoneInput?.value);
    if (phoneInput instanceof HTMLInputElement && phoneInput.value !== phone) {
      phoneInput.value = phone;
    }

    if (!email || !fullName || !phone) {
      setMessage(feedback, 'All fields are required.');
      return;
    }

    if (email !== String(inviteUser.email || '').toLowerCase()) {
      setMessage(feedback, 'Email must match the invited email address.');
      return;
    }

    if (!googleLinked && !hasPasswordInput) {
      setMessage(
        feedback,
        'Set a password or link your Google account before continuing.'
      );
      return;
    }

    if (hasPasswordInput && password !== passwordConfirm) {
      setMessage(feedback, 'Passwords do not match.');
      return;
    }

    if (hasPasswordInput && password.length < 6) {
      setMessage(feedback, 'Password must be at least 6 characters.');
      return;
    }

    setDisabled(submitButton, true);
    setDisabled(googleLinkButton, true);

    try {
      const updateUserPayload = {
        data: {
          full_name: fullName,
          phone,
          role: invitedRole,
        },
      };
      if (hasPasswordInput) {
        updateUserPayload.password = password;
      }

      const { error: updateAuthError } =
        await client.auth.updateUser(updateUserPayload);
      if (updateAuthError) throw updateAuthError;

      const sessionAccessToken = await getSessionAccessToken(client);
      if (!sessionAccessToken) {
        throw new Error('Missing session access token');
      }

      await completeSignup(sessionAccessToken, {
        full_name: fullName,
        phone,
      });

      setMessage(feedback, 'Account setup complete. Redirecting...', 'success');
      window.setTimeout(() => {
        window.location.assign(REDIRECT_AFTER_SIGN_UP);
      }, 700);
    } catch (error) {
      if (
        isTransientNetworkError(error) &&
        (await tryRecoverSignUpRedirect(client, feedback))
      ) {
        return;
      }

      setMessage(
        feedback,
        error?.message || 'Failed to complete signup. Please try again.'
      );
      setDisabled(submitButton, false);
      syncGoogleSignupState();
    }
  });

  form.dataset.bound = 'true';
}
