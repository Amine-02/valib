import sidebarTemplate from '/src/components/sidebar.html?raw';
import headerTemplate from '/src/components/header.html?raw';
import { ROUTE_CONFIG } from '/src/configs/routes.js';

const BASE_PREFIX = 'app';
const INITIALIZED_VIEWS = new Set();

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
}

export async function handleRouting() {
  const { route } = getRouteInfo();
  const config = ROUTE_CONFIG[route];
  if (!config) return;

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

window.addEventListener('DOMContentLoaded', () => {
  void bootstrapApp();
});
