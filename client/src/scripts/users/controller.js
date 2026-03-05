import {
  isDropdownOpen,
  setDropdownOpen,
  syncDropdownOptions,
} from '/src/utils/dropdown.js';
import { getById, queryAll } from '/src/utils/dom.js';
import { normalizeLowerTrim } from '/src/utils/filter.js';

const IDS = {
  tableBody: 'users-table-body',
  prevPage: 'users-prev-page',
  nextPage: 'users-next-page',
  pageInput: 'users-page-input',
  searchInput: 'users-search-input',
  searchClear: 'users-search-clear',
  roleFilterRoot: 'users-role-filter-root',
  roleFilter: 'users-role-filter',
  roleFilterTrigger: 'users-role-filter-trigger',
  roleFilterLabel: 'users-role-filter-label',
  roleFilterChevron: 'users-role-filter-chevron',
  roleFilterMenu: 'users-role-filter-menu',
  inviteButton: 'users-invite-button',
};

const SELECTORS = {
  roleOptions: '[data-role-option]',
};

function el(key) {
  return getById(IDS[key]);
}

function bindOnce(element, eventName, handler) {
  if (!element || element.dataset.bound) return;
  element.addEventListener(eventName, handler);
  element.dataset.bound = 'true';
}

export function setupUsersController({
  state,
  loadUsersPage,
  onInviteUser,
  onEditUser,
  onDeleteUser,
  searchDebounceMs = 220,
}) {
  let searchDebounceId = null;
  let roleFilterDismissBound = false;

  function clearSearchDebounce() {
    if (!searchDebounceId) return;
    window.clearTimeout(searchDebounceId);
    searchDebounceId = null;
  }

  function syncSearchUi() {
    const clearButton = el('searchClear');
    if (!clearButton) return;
    const hasQuery = String(state.searchQuery || '').trim().length > 0;
    clearButton.classList.toggle('hidden', !hasQuery);
  }

  function setSearchQuery(value, { syncInput = false } = {}) {
    const nextQuery = String(value ?? '');
    const changed = nextQuery !== state.searchQuery;
    state.searchQuery = nextQuery;

    if (syncInput) {
      const input = el('searchInput');
      if (input instanceof HTMLInputElement && input.value !== nextQuery) {
        input.value = nextQuery;
      }
    }

    syncSearchUi();
    return changed;
  }

  function getRoleFilterLabel(value) {
    if (value === 'admin') return 'Admin';
    if (value === 'staff') return 'Staff';
    if (value === 'viewer') return 'Viewer';
    return 'All roles';
  }

  function getRoleMenuElements() {
    return {
      root: el('roleFilterRoot'),
      trigger: el('roleFilterTrigger'),
      menu: el('roleFilterMenu'),
      chevron: el('roleFilterChevron'),
    };
  }

  function getRoleFilterOptions() {
    const { root } = getRoleMenuElements();
    if (!root) return [];
    return queryAll(SELECTORS.roleOptions, root);
  }

  function getRoleOptionValue(option) {
    return normalizeLowerTrim(option?.dataset?.roleOption);
  }

  function syncRoleFilterUi() {
    const roleFilter = el('roleFilter');
    if (roleFilter instanceof HTMLInputElement) {
      roleFilter.value = state.roleFilter;
    }

    const label = el('roleFilterLabel');
    if (label) {
      label.textContent = getRoleFilterLabel(state.roleFilter);
    }

    syncDropdownOptions(
      getRoleFilterOptions(),
      state.roleFilter,
      getRoleOptionValue
    );
  }

  function closeRoleFilterMenu() {
    const { trigger, menu, chevron } = getRoleMenuElements();
    setDropdownOpen(trigger, menu, chevron, false);
  }

  function toggleRoleFilterMenu() {
    const { trigger, menu, chevron } = getRoleMenuElements();
    setDropdownOpen(trigger, menu, chevron, !isDropdownOpen(menu));
  }

  function setRoleFilter(value, { syncInput = false } = {}) {
    const nextValue = normalizeLowerTrim(value);
    const changed = nextValue !== state.roleFilter;
    state.roleFilter = nextValue;

    if (syncInput) {
      const roleFilter = el('roleFilter');
      if (roleFilter instanceof HTMLInputElement) {
        roleFilter.value = nextValue;
      }
    }

    syncRoleFilterUi();
    return changed;
  }

  function bindPaginationControls() {
    bindOnce(el('prevPage'), 'click', () => {
      if (state.loading || state.page <= 1) return;
      void loadUsersPage(state.page - 1);
    });

    bindOnce(el('nextPage'), 'click', () => {
      if (state.loading || state.page >= state.totalPages) return;
      void loadUsersPage(state.page + 1);
    });

    bindOnce(el('pageInput'), 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      const pageInput = el('pageInput');
      if (!(pageInput instanceof HTMLInputElement)) return;

      if (state.loading || state.total <= 0) {
        pageInput.value = state.total <= 0 ? '0' : String(state.page);
        return;
      }

      const parsed = Number.parseInt(String(pageInput.value || '').trim(), 10);
      if (!Number.isFinite(parsed)) {
        pageInput.value = String(state.page);
        return;
      }

      const targetPage = Math.min(Math.max(parsed, 1), state.totalPages);
      pageInput.value = String(targetPage);
      pageInput.blur();

      if (targetPage === state.page) return;
      void loadUsersPage(targetPage);
    });
  }

  function bindSearchControls() {
    const input = el('searchInput');
    const clearButton = el('searchClear');

    bindOnce(input, 'input', () => {
      clearSearchDebounce();

      searchDebounceId = window.setTimeout(() => {
        const changed = setSearchQuery(input?.value || '');
        if (!changed) return;
        void loadUsersPage(1);
      }, searchDebounceMs);
    });

    bindOnce(input, 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      clearSearchDebounce();
      const changed = setSearchQuery(input?.value || '');
      if (!changed) return;
      void loadUsersPage(1);
    });

    bindOnce(clearButton, 'click', () => {
      clearSearchDebounce();
      const changed = setSearchQuery('', { syncInput: true });
      if (!changed) return;
      input?.focus();
      void loadUsersPage(1);
    });

    syncSearchUi();
  }

  function bindRoleFilterControl() {
    const { root } = getRoleMenuElements();
    bindOnce(el('roleFilterTrigger'), 'click', () => {
      toggleRoleFilterMenu();
    });

    getRoleFilterOptions().forEach((option) => {
      bindOnce(option, 'click', () => {
        closeRoleFilterMenu();
        const changed = setRoleFilter(getRoleOptionValue(option));
        if (!changed) return;
        void loadUsersPage(1);
      });
    });

    if (roleFilterDismissBound) return;

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (root?.contains(event.target)) return;
      closeRoleFilterMenu();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeRoleFilterMenu();
    });

    roleFilterDismissBound = true;
  }

  function bindActionControls() {
    bindOnce(el('inviteButton'), 'click', () => {
      if (typeof onInviteUser !== 'function') return;
      onInviteUser();
    });

    bindOnce(el('tableBody'), 'click', (event) => {
      if (!(event.target instanceof Element)) return;

      const button = event.target.closest('button[data-action][data-user-id]');
      if (!(button instanceof HTMLButtonElement)) return;

      const action = String(button.dataset.action || '')
        .trim()
        .toLowerCase();
      const userId = String(button.dataset.userId || '').trim();
      if (!userId) return;

      if (action === 'edit' && typeof onEditUser === 'function') {
        onEditUser(userId);
        return;
      }

      if (action === 'delete' && typeof onDeleteUser === 'function') {
        onDeleteUser(userId);
      }
    });
  }

  function bindAll() {
    bindPaginationControls();
    bindSearchControls();
    bindRoleFilterControl();
    bindActionControls();
  }

  function syncUi() {
    setSearchQuery(state.searchQuery, { syncInput: true });
    setRoleFilter(state.roleFilter, { syncInput: true });
    closeRoleFilterMenu();
  }

  return {
    bindAll,
    syncUi,
  };
}
