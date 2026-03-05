import sidebarTemplate from '/src/components/sidebar.html?raw';
import headerTemplate from '/src/components/header.html?raw';
import { ROUTE_CONFIG } from '/src/configs/routes.js';
import { getProfileById } from '/src/services/profilesService.js';
import { isDropdownOpen, setDropdownOpen } from '/src/utils/dropdown.js';
import { getSupabaseBrowserClient } from '/src/utils/supabase.js';

const BASE_PREFIX = 'app';
const INITIALIZED_VIEWS = new Set();
const HEADER_DEFAULT_VALUE = 'N/A';
const ROLE_FALLBACK = 'viewer';
const headerAuthState = {
  client: null,
  subscription: null,
};

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
  if (window.matchMedia('(min-width: 1024px)').matches) return;
  document.getElementById('sidebar')?.classList.add('hidden');
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
  authLink?.classList.toggle('hidden', isAuthenticated);
  userRoot?.classList.toggle('hidden', !isAuthenticated);

  if (!isAuthenticated) {
    resetHeaderUserFields();
    closeHeaderUserDropdown();
  }
}

async function getHeaderProfile(user) {
  if (!user?.id) return null;
  try {
    return await getProfileById(user.id);
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
  const role = profile?.role || user?.user_metadata?.role || ROLE_FALLBACK;

  setHeaderFieldText('header-user-full-name', fullName);
  setHeaderFieldText('header-user-email', email);
  setHeaderFieldText('header-user-phone', phone);
  setHeaderFieldText('header-user-role', toTitleCaseWord(role));
}

async function refreshHeaderAuthUi() {
  const client = getHeaderAuthClient();
  if (!client) {
    setHeaderAuthUi(false);
    return;
  }

  try {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) {
      setHeaderAuthUi(false);
      return;
    }

    setHeaderAuthUi(true);
    let profile = null;
    try {
      profile = await getHeaderProfile(data.user);
    } catch (profileError) {
      console.error('Failed to load header profile', profileError);
    }
    fillHeaderUserFields(data.user, profile);
  } catch {
    setHeaderAuthUi(false);
  }
}

function subscribeToHeaderAuthState() {
  const client = getHeaderAuthClient();
  if (!client) return;

  headerAuthState.subscription?.unsubscribe?.();

  const { data } = client.auth.onAuthStateChange(() => {
    void refreshHeaderAuthUi();
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
          setRoute('sign-in');
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
  const isDesktop = window.matchMedia('(min-width: 1024px)').matches;

  header?.classList.toggle('hidden', isAuthLayout);
  if (sidebar) {
    if (isAuthLayout) {
      sidebar.classList.add('hidden');
    } else if (isDesktop) {
      sidebar.classList.remove('hidden');
    } else {
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
    if (window.matchMedia('(min-width: 1024px)').matches) return;

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
  const { route } = getRouteInfo();
  const config = ROUTE_CONFIG[route];
  if (!config) return;
  applyLayout(config.layout || 'app');

  document.querySelectorAll('.page-view').forEach((view) => {
    view.classList.add('hidden');
  });

  const targetView = document.getElementById(config.viewId);
  if (!targetView) return;

  targetView.classList.remove('hidden');
  highlightActiveTabLink(route);

  if (INITIALIZED_VIEWS.has(route)) return;

  if (typeof config.template === 'string' && !targetView.innerHTML.trim()) {
    targetView.innerHTML = config.template;
  }

  if (typeof config.loader === 'function') {
    await config.loader();
  }

  INITIALIZED_VIEWS.add(route);
}

async function bootstrapApp() {
  await Promise.all([loadHeader(), loadSidebar()]);
  setupRouteLinkDelegation();

  if (!isAppPathname()) {
    setRoute('dashboard', { replace: true });
  }

  await handleRouting();
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
