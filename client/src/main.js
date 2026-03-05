import sidebarTemplate from '/src/components/sidebar.html?raw';
import headerTemplate from '/src/components/header.html?raw';
import { ROUTE_CONFIG } from '/src/configs/routes.js';
import { getSessionProfile } from '/src/services/authService.js';
import { getOverdueBooks } from '/src/services/transactionsService.js';
import { appState } from '/src/state.js';
import { clearActiveUserRole, setActiveUserRole } from '/src/utils/role.js';
import { isDropdownOpen, setDropdownOpen } from '/src/utils/dropdown.js';
import { getSupabaseBrowserClient } from '/src/utils/supabase.js';

const BASE_PREFIX = 'app';
const INITIALIZED_VIEWS = new Set();
const AUTH_ROUTES = new Set(['sign-in', 'sign-up']);
const AUTH_CALLBACK_PARAM_KEYS = [
  'token_hash',
  'type',
  'next',
  'code',
  'access_token',
  'refresh_token',
  'error',
  'error_code',
  'error_description',
];
const HEADER_DEFAULT_VALUE = 'N/A';
const ROLE_FALLBACK = 'viewer';
const OVERDUE_ACCESS_ROLES = new Set(['admin', 'staff']);
const ROUTE_ACCESS_BY_ROLE = {
  admin: new Set(['dashboard', 'books', 'activities', 'users']),
  staff: new Set(['dashboard', 'books', 'activities']),
  viewer: new Set(['books']),
};
const headerAuthState = {
  client: null,
  subscription: null,
};
const permissionObserverState = {
  bound: false,
};
const AUTH_RELOAD_MARKER_KEY = 'valib:auth-reload-marker';

function normalizeRole(role, fallback = ROLE_FALLBACK) {
  const safe = String(role ?? '')
    .trim()
    .toLowerCase();
  if (!safe) return fallback;
  if (safe === 'admin' || safe === 'staff' || safe === 'viewer') return safe;
  return fallback;
}

function resolveUserRole(user, fallback = ROLE_FALLBACK) {
  return normalizeRole(
    user?.app_metadata?.role || user?.user_metadata?.role || user?.role,
    fallback
  );
}

function getDefaultRouteForRole(role = ROLE_FALLBACK) {
  const normalized = normalizeRole(role, ROLE_FALLBACK);
  return normalized === 'viewer' ? 'books' : 'dashboard';
}

function getAllowedRoutesForRole(role = ROLE_FALLBACK) {
  const normalized = normalizeRole(role, ROLE_FALLBACK);
  return ROUTE_ACCESS_BY_ROLE[normalized] || ROUTE_ACCESS_BY_ROLE.viewer;
}

function getAuthorizedRoute(route) {
  const role = appState.isAuthenticated
    ? normalizeRole(appState.role, ROLE_FALLBACK)
    : ROLE_FALLBACK;
  const fallbackRoute = getDefaultRouteForRole(role);

  if (!appState.isAuthenticated) {
    if (AUTH_ROUTES.has(route)) return route;
    return getAllowedRoutesForRole(role).has(route) ? route : fallbackRoute;
  }

  if (appState.onboardingRequired) {
    return 'sign-up';
  }

  if (AUTH_ROUTES.has(route)) {
    return fallbackRoute;
  }

  return getAllowedRoutesForRole(role).has(route) ? route : fallbackRoute;
}

function setAccessState({
  isAuthenticated = false,
  role = ROLE_FALLBACK,
  onboardingRequired = false,
} = {}) {
  appState.isAuthenticated = !!isAuthenticated;
  appState.role = normalizeRole(role, ROLE_FALLBACK);
  appState.onboardingRequired = !!onboardingRequired;

  if (appState.isAuthenticated) {
    setActiveUserRole(appState.role);
    return;
  }

  clearActiveUserRole();
}

function setOverdueBookIds(bookIds = []) {
  if (!Array.isArray(bookIds)) {
    appState.overdueBookIds = [];
    return;
  }

  const uniqueIds = [
    ...new Set(
      bookIds.map((bookId) => String(bookId || '').trim()).filter(Boolean)
    ),
  ];
  appState.overdueBookIds = uniqueIds;
}

function hasOverdueBooksAccess(role = ROLE_FALLBACK) {
  const normalized = normalizeRole(role, ROLE_FALLBACK);
  return OVERDUE_ACCESS_ROLES.has(normalized);
}

async function refreshOverdueBookIds(role = ROLE_FALLBACK) {
  if (!hasOverdueBooksAccess(role)) {
    setOverdueBookIds([]);
    return;
  }

  try {
    const overdueBooks = await getOverdueBooks();
    const overdueBookIds = Array.isArray(overdueBooks)
      ? overdueBooks.map((book) => book?.id)
      : [];
    setOverdueBookIds(overdueBookIds);
  } catch (error) {
    console.error('Failed to preload overdue books', error);
    setOverdueBookIds([]);
  }
}

function applyRuleToElement(element, hide) {
  if (!hide) return;
  if (!(element instanceof Element)) return;
  element.remove();
}

function applyPermissions(container = document) {
  const role = normalizeRole(appState.role, ROLE_FALLBACK);
  const removeSidebarUi = role === 'viewer';
  const canAccessUsers = role === 'admin';
  const canAccessDashboard = role === 'admin' || role === 'staff';
  const canAccessActivities = role === 'admin' || role === 'staff';
  const canManageBooks = role === 'admin' || role === 'staff';

  const rules = [
    {
      hide: removeSidebarUi,
      selector: '#sidebar-toggle, #sidebar',
    },
    {
      hide: !canAccessDashboard,
      selector: '[data-route="dashboard"]',
    },
    {
      hide: !canAccessActivities,
      selector: '[data-route="activities"]',
    },
    {
      hide: !canAccessUsers,
      selector:
        '[data-route="users"], #users-invite-button, #view-users button[data-action][data-user-id], #view-users thead tr > th:nth-child(5), #view-users #users-table-body tr > td:nth-child(5)',
    },
    {
      hide: !canManageBooks,
      selector:
        '#books-add-button, #book-detail-borrower-root, #view-books button[data-action][data-book-id], #view-books thead tr > th:nth-child(6), #view-books #books-table-body tr > td:nth-child(6), #books-filter-status-menu [data-status-option="overdue"]',
    },
  ];

  if (container instanceof Element) {
    for (const rule of rules) {
      if (!container.matches(rule.selector)) continue;
      applyRuleToElement(container, rule.hide);
    }
  }

  for (const rule of rules) {
    container.querySelectorAll(rule.selector).forEach((el) => {
      applyRuleToElement(el, rule.hide);
    });
  }
}

function ensurePermissionObserver() {
  if (permissionObserverState.bound) return;

  const booksView = document.getElementById('view-books');
  if (!(booksView instanceof HTMLElement)) return;

  const observer = new MutationObserver(() => {
    applyPermissions(booksView);
  });
  observer.observe(booksView, { childList: true, subtree: true });

  permissionObserverState.bound = true;
}

function isAppPathname(pathname = window.location.pathname) {
  return (
    pathname === `/${BASE_PREFIX}` || pathname.startsWith(`/${BASE_PREFIX}/`)
  );
}

function isKnownRoute(route) {
  return Object.prototype.hasOwnProperty.call(ROUTE_CONFIG, route);
}

export function getRouteInfo() {
  const segments = window.location.pathname.split('/').filter(Boolean);

  if (segments[0] === BASE_PREFIX) segments.shift();

  const route = segments[0] || 'dashboard';
  return { route: isKnownRoute(route) ? route : '404' };
}

export function setRoute(route, { replace = false } = {}) {
  const safeRoute = isKnownRoute(route) ? route : '404';
  const url = new URL(window.location.href);
  const parts = [BASE_PREFIX];

  if (safeRoute !== 'dashboard') parts.push(safeRoute);

  url.pathname = `/${parts.join('/')}`;
  url.search = '';

  history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

function closeSidebar() {
  document.getElementById('sidebar')?.classList.add('hidden');
}

function stripAuthCallbackUrlParams() {
  const url = new URL(window.location.href);
  let changed = false;

  AUTH_CALLBACK_PARAM_KEYS.forEach((key) => {
    if (!url.searchParams.has(key)) return;
    url.searchParams.delete(key);
    changed = true;
  });

  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
  AUTH_CALLBACK_PARAM_KEYS.forEach((key) => {
    if (!hashParams.has(key)) return;
    hashParams.delete(key);
    changed = true;
  });

  url.hash = hashParams.toString();
  if (!changed) return;

  history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

function getHeaderField(id) {
  return document.getElementById(id);
}

function setHeaderFieldText(id, value, fallback = HEADER_DEFAULT_VALUE) {
  const element = getHeaderField(id);
  if (!element) return;
  const safe = String(value ?? '').trim() || fallback;
  element.textContent = safe;
}

function toTitleCaseWord(value) {
  const safe = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!safe) return HEADER_DEFAULT_VALUE;
  return safe.charAt(0).toUpperCase() + safe.slice(1);
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

function getHeaderAuthClient() {
  if (headerAuthState.client) return headerAuthState.client;

  try {
    headerAuthState.client = getSupabaseBrowserClient();
  } catch {
    headerAuthState.client = null;
  }

  return headerAuthState.client;
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

function setHeaderUserDropdownOpen(open) {
  const trigger = document.getElementById('header-user-trigger');
  const menu = document.getElementById('header-user-dropdown');
  if (!trigger || !menu) return;
  setDropdownOpen(trigger, menu, null, open);
}

function closeHeaderUserDropdown() {
  setHeaderUserDropdownOpen(false);
}

function resetHeaderUserFields() {
  setHeaderFieldText('header-user-full-name', '');
  setHeaderFieldText('header-user-email', '');
  setHeaderFieldText('header-user-phone', '');
  setHeaderFieldText('header-user-role', '');
}

function setHeaderAuthUi(isAuthenticated) {
  const authLink = document.getElementById('auth-link');
  const userRoot = document.getElementById('header-user-root');

  if (authLink instanceof HTMLElement) {
    authLink.hidden = isAuthenticated;
    authLink.classList.toggle('hidden', isAuthenticated);
  }

  if (userRoot instanceof HTMLElement) {
    userRoot.hidden = !isAuthenticated;
    userRoot.classList.toggle('hidden', !isAuthenticated);
  }

  if (!isAuthenticated) {
    resetHeaderUserFields();
    closeHeaderUserDropdown();
  }
}

function isProfileSetupComplete(profile) {
  const fullName = String(profile?.full_name || '').trim();
  const phone = String(profile?.phone || '').trim();
  return !!(fullName && phone);
}

async function getHeaderProfile(user) {
  const client = getHeaderAuthClient();
  if (!client || !user?.id) return null;

  const accessToken = await getSessionAccessToken(client);
  if (!accessToken) return null;

  try {
    return await getSessionProfile(accessToken);
  } catch (error) {
    if (isProfileMissingError(error)) return null;
    throw error;
  }
}

function fillHeaderUserFields(user, profile) {
  const email = String(user?.email || profile?.email || '').trim();
  const fallbackName = email ? email.split('@')[0] : '';
  const fullName =
    profile?.full_name || user?.user_metadata?.full_name || fallbackName;
  const phone = profile?.phone || user?.user_metadata?.phone || '';
  const role = normalizeRole(profile?.role || resolveUserRole(user));

  setHeaderFieldText('header-user-full-name', fullName);
  setHeaderFieldText('header-user-email', email);
  setHeaderFieldText('header-user-phone', phone);
  setHeaderFieldText('header-user-role', toTitleCaseWord(role));
}

async function refreshHeaderAuthUi() {
  const client = getHeaderAuthClient();
  if (!client) {
    setAccessState({
      isAuthenticated: false,
      role: ROLE_FALLBACK,
      onboardingRequired: false,
    });
    setOverdueBookIds([]);
    setHeaderAuthUi(false);
    applyPermissions(document);
    return;
  }

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) {
      setAccessState({
        isAuthenticated: false,
        role: ROLE_FALLBACK,
        onboardingRequired: false,
      });
      setOverdueBookIds([]);
      setHeaderAuthUi(false);
      applyPermissions(document);
      return;
    }

    setHeaderAuthUi(true);
    setAccessState({
      isAuthenticated: true,
      role: resolveUserRole(data.user),
      onboardingRequired: true,
    });

    let profile = null;
    try {
      profile = await getHeaderProfile(data.user);
    } catch (profileError) {
      console.error('Failed to load header profile', profileError);
    }
    setAccessState({
      isAuthenticated: true,
      role: normalizeRole(profile?.role || resolveUserRole(data.user)),
      onboardingRequired: !isProfileSetupComplete(profile),
    });
    await refreshOverdueBookIds(appState.role);
    fillHeaderUserFields(data.user, profile);
    applyPermissions(document);
  } catch {
    setAccessState({
      isAuthenticated: false,
      role: ROLE_FALLBACK,
      onboardingRequired: false,
    });
    setOverdueBookIds([]);
    setHeaderAuthUi(false);
    applyPermissions(document);
  }
}

function shouldReloadForAuthEvent(event, session) {
  if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return false;

  const userId = String(session?.user?.id || '').trim();
  const marker = `${event}:${userId}`;
  const lastMarker = sessionStorage.getItem(AUTH_RELOAD_MARKER_KEY);
  if (lastMarker === marker) return false;

  sessionStorage.setItem(AUTH_RELOAD_MARKER_KEY, marker);
  return true;
}

function subscribeToHeaderAuthState() {
  const client = getHeaderAuthClient();
  if (!client) return;

  headerAuthState.subscription?.unsubscribe?.();

  const { data } = client.auth.onAuthStateChange((event, session) => {
    if (shouldReloadForAuthEvent(event, session)) {
      window.location.reload();
      return;
    }

    void refreshHeaderAuthUi().then(() => {
      if (!isAppPathname()) return;
      void handleRouting();
    });
  });
  headerAuthState.subscription = data?.subscription ?? null;
}

function bindHeaderAuthControls() {
  const userRoot = document.getElementById('header-user-root');
  const trigger = document.getElementById('header-user-trigger');
  const menu = document.getElementById('header-user-dropdown');
  const logoutButton = document.getElementById('header-user-logout');
  const client = getHeaderAuthClient();

  if (trigger instanceof HTMLButtonElement && menu instanceof HTMLElement) {
    if (trigger.dataset.bound !== 'true') {
      trigger.addEventListener('click', () => {
        setHeaderUserDropdownOpen(!isDropdownOpen(menu));
      });
      trigger.dataset.bound = 'true';
    }
  }

  if (logoutButton instanceof HTMLButtonElement && client) {
    if (logoutButton.dataset.bound !== 'true') {
      logoutButton.addEventListener('click', async () => {
        logoutButton.disabled = true;
        try {
          await client.auth.signOut();
          closeHeaderUserDropdown();
          setRoute('dashboard', { replace: true });
          await handleRouting();
        } finally {
          logoutButton.disabled = false;
        }
      });
      logoutButton.dataset.bound = 'true';
    }
  }

  if (
    userRoot instanceof HTMLElement &&
    userRoot.dataset.dismissBound !== 'true'
  ) {
    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (userRoot.contains(event.target)) return;
      closeHeaderUserDropdown();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeHeaderUserDropdown();
    });

    userRoot.dataset.dismissBound = 'true';
  }
}

function applyLayout(layout = 'app') {
  const header = document.getElementById('header');
  const sidebar = document.getElementById('sidebar');
  const content = document.getElementById('content');
  const isAuthLayout = layout === 'auth';

  header?.classList.toggle('hidden', isAuthLayout);
  if (sidebar) {
    if (isAuthLayout) {
      sidebar.classList.add('hidden');
    }
  }
  content?.classList.toggle('auth-layout', isAuthLayout);
}

function highlightActiveTabLink(currentRoute) {
  document.querySelectorAll('.tab-link, [data-route]').forEach((link) => {
    if (!(link instanceof HTMLElement)) return;

    if (link.dataset.route === currentRoute) {
      link.setAttribute('aria-current', 'page');
      return;
    }

    link.removeAttribute('aria-current');
  });
}

async function loadSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  if (sidebarTemplate.trim()) {
    sidebar.innerHTML = sidebarTemplate;
  }
  applyPermissions(sidebar);

  sidebar.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const routeTrigger = event.target.closest('.tab-link, [data-route]');
    const route = routeTrigger?.dataset?.route;

    if (!route) return;

    event.preventDefault();
    closeSidebar();
    setRoute(route);
    void handleRouting();
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const toggleBtn = document.getElementById('sidebar-toggle');
    if (!sidebar.contains(event.target) && !toggleBtn?.contains(event.target)) {
      closeSidebar();
    }
  });
}

function setupRouteLinkDelegation() {
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented) return;
    if (!(event.target instanceof Element)) return;

    const routeTrigger = event.target.closest('[data-route]');
    const route = routeTrigger?.dataset?.route;

    if (!route) return;

    event.preventDefault();
    closeSidebar();
    setRoute(route);
    void handleRouting();
  });
}

async function loadHeader() {
  const header = document.getElementById('header');
  if (!header) return;

  header.innerHTML = headerTemplate;
  document.getElementById('sidebar-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar')?.classList.toggle('hidden');
  });

  bindHeaderAuthControls();
  subscribeToHeaderAuthState();
  await refreshHeaderAuthUi();
}

export async function handleRouting() {
  const { route: requestedRoute } = getRouteInfo();
  const route = getAuthorizedRoute(requestedRoute);
  if (route !== requestedRoute) {
    setRoute(route, { replace: true });
    return handleRouting();
  }

  const config = ROUTE_CONFIG[route];
  if (!config) return;

  if (!AUTH_ROUTES.has(route)) {
    stripAuthCallbackUrlParams();
  }

  applyLayout(config.layout || 'app');
  closeSidebar();

  document.querySelectorAll('.page-view').forEach((view) => {
    view.classList.add('hidden');
  });

  const targetView = document.getElementById(config.viewId);
  if (!targetView) return;

  targetView.classList.remove('hidden');
  highlightActiveTabLink(route);
  applyPermissions(document);

  if (INITIALIZED_VIEWS.has(route)) return;

  if (typeof config.template === 'string' && !targetView.innerHTML.trim()) {
    targetView.innerHTML = config.template;
  }

  if (typeof config.loader === 'function') {
    await config.loader();
  }

  applyPermissions(targetView);
  INITIALIZED_VIEWS.add(route);
}

async function bootstrapApp() {
  await loadHeader();
  await loadSidebar();
  ensurePermissionObserver();
  setupRouteLinkDelegation();

  if (!isAppPathname()) {
    setRoute('dashboard', { replace: true });
  }

  await handleRouting();
  applyPermissions(document);
}

window.addEventListener('popstate', () => {
  void handleRouting();
});

window.addEventListener('resize', () => {
  const { route } = getRouteInfo();
  const config = ROUTE_CONFIG[route];
  if (!config) return;
  applyLayout(config.layout || 'app');
});

window.addEventListener('DOMContentLoaded', () => {
  void bootstrapApp();
});
