import {
  deleteProfile,
  getProfileById,
  getProfiles,
  getProfilesCount,
  inviteProfile,
  updateProfile,
} from '/src/services/profilesService.js';
import { setupUsersController } from './controller.js';
import { confirmDelete } from '/src/utils/confirm-modal.js';
import {
  isDropdownOpen,
  setDropdownOpen,
  syncDropdownOptions,
} from '/src/utils/dropdown.js';
import { getById, queryAll } from '/src/utils/dom.js';
import { normalizeLowerTrim } from '/src/utils/filter.js';
import { spinnerMarkup } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { formatPhoneNumber } from '/src/utils/phone.js';
import { escapeHtml, toTitleCase } from '/src/utils/string.js';

const IDS = {
  tableBody: 'users-table-body',
  resultsMeta: 'users-results-meta',
  feedback: 'users-feedback',
  paginationMeta: 'users-pagination-meta',
  prevPage: 'users-prev-page',
  nextPage: 'users-next-page',
  pageInput: 'users-page-input',
  pageTotal: 'users-page-total',
  inviteOverlay: 'users-invite-modal-overlay',
  inviteForm: 'users-invite-form',
  inviteClose: 'users-invite-close',
  inviteCancel: 'users-invite-cancel',
  inviteSubmit: 'users-invite-submit',
  inviteEmail: 'users-invite-email',
  inviteRoleRoot: 'users-invite-role-root',
  inviteRole: 'users-invite-role',
  inviteRoleTrigger: 'users-invite-role-trigger',
  inviteRoleLabel: 'users-invite-role-label',
  inviteRoleChevron: 'users-invite-role-chevron',
  inviteRoleMenu: 'users-invite-role-menu',
  inviteFeedback: 'users-invite-feedback',
  editOverlay: 'users-edit-modal-overlay',
  editForm: 'users-edit-form',
  editClose: 'users-edit-close',
  editCancel: 'users-edit-cancel',
  editSubmit: 'users-edit-submit',
  editId: 'users-edit-id',
  editFullName: 'users-edit-full-name',
  editPhone: 'users-edit-phone',
  editRoleRoot: 'users-edit-role-root',
  editRole: 'users-edit-role',
  editRoleTrigger: 'users-edit-role-trigger',
  editRoleLabel: 'users-edit-role-label',
  editRoleChevron: 'users-edit-role-chevron',
  editRoleMenu: 'users-edit-role-menu',
  editFeedback: 'users-edit-feedback',
};

const SELECTORS = {
  inviteRoleOptions: '[data-invite-role-option]',
  editRoleOptions: '[data-edit-role-option]',
};

const CONFIG = {
  pageSize: 12,
  searchDebounceMs: 220,
  sortField: 'created_at',
  sortDirection: 'desc',
};
const INVITE_API_KEY = String(import.meta.env.VITE_INVITE_API_KEY || '').trim();

const state = {
  page: 1,
  total: 0,
  totalPages: 1,
  loading: false,
  searchQuery: '',
  roleFilter: '',
  usersById: new Map(),
};

let usersController = null;
let modalControlsBound = false;
let roleDropdownDismissBound = false;

function el(key) {
  return getById(IDS[key]);
}

function normalizeRole(value, fallback = '') {
  const safe = String(value || '')
    .trim()
    .toLowerCase();
  if (!safe) return fallback;
  if (['admin', 'staff', 'viewer'].includes(safe)) return safe;
  return fallback || 'viewer';
}

function getRoleLabel(value, { allowAll = false } = {}) {
  const normalized = normalizeRole(value, '');
  if (normalized === 'admin') return 'Admin';
  if (normalized === 'staff') return 'Staff';
  if (normalized === 'viewer') return 'Viewer';
  return allowAll ? 'All roles' : 'Viewer';
}

function getRoleDropdownElements(kind) {
  if (kind === 'invite') {
    return {
      root: el('inviteRoleRoot'),
      input: el('inviteRole'),
      trigger: el('inviteRoleTrigger'),
      label: el('inviteRoleLabel'),
      menu: el('inviteRoleMenu'),
      chevron: el('inviteRoleChevron'),
    };
  }

  if (kind === 'edit') {
    return {
      root: el('editRoleRoot'),
      input: el('editRole'),
      trigger: el('editRoleTrigger'),
      label: el('editRoleLabel'),
      menu: el('editRoleMenu'),
      chevron: el('editRoleChevron'),
    };
  }

  return null;
}

function getRoleDropdownOptionSelector(kind) {
  if (kind === 'invite') return SELECTORS.inviteRoleOptions;
  if (kind === 'edit') return SELECTORS.editRoleOptions;
  return '';
}

function getRoleDropdownOptions(kind) {
  const elements = getRoleDropdownElements(kind);
  if (!elements?.root) return [];

  const selector = getRoleDropdownOptionSelector(kind);
  if (!selector) return [];

  return queryAll(selector, elements.root);
}

function getRoleDropdownOptionValue(kind, option) {
  if (kind === 'invite') {
    return normalizeLowerTrim(option?.dataset?.inviteRoleOption);
  }

  if (kind === 'edit') {
    return normalizeLowerTrim(option?.dataset?.editRoleOption);
  }

  return '';
}

function syncRoleDropdownUi(kind, value) {
  const elements = getRoleDropdownElements(kind);
  if (!elements) return;

  if (elements.input instanceof HTMLInputElement) {
    elements.input.value = value;
  }

  if (elements.label instanceof HTMLElement) {
    elements.label.textContent = getRoleLabel(value);
  }

  syncDropdownOptions(getRoleDropdownOptions(kind), value, (option) =>
    getRoleDropdownOptionValue(kind, option)
  );
}

function setRoleDropdownValue(kind, value, { syncInput = false } = {}) {
  const normalized = normalizeRole(value, 'viewer');
  const elements = getRoleDropdownElements(kind);
  if (!elements) return;

  if (syncInput && elements.input instanceof HTMLInputElement) {
    elements.input.value = normalized;
  }

  syncRoleDropdownUi(kind, normalized);
}

function setRoleDropdownOpen(kind, open) {
  const elements = getRoleDropdownElements(kind);
  if (!elements) return;
  setDropdownOpen(elements.trigger, elements.menu, elements.chevron, open);
}

function closeRoleDropdown(kind) {
  setRoleDropdownOpen(kind, false);
}

function closeAllRoleDropdowns() {
  closeRoleDropdown('invite');
  closeRoleDropdown('edit');
}

function toggleRoleDropdown(kind) {
  const elements = getRoleDropdownElements(kind);
  if (!elements) return;
  setRoleDropdownOpen(kind, !isDropdownOpen(elements.menu));
}

function setTextFeedback(element, message, type = 'error') {
  if (!(element instanceof HTMLElement)) return;

  const text = String(message || '').trim();
  if (!text) {
    element.textContent = '';
    element.classList.add('hidden');
    element.classList.remove('text-danger-text', 'text-success-text');
    return;
  }

  element.textContent = text;
  element.classList.remove('hidden');
  element.classList.toggle('text-success-text', type === 'success');
  element.classList.toggle('text-danger-text', type !== 'success');
}

function setPageFeedback(message, type = 'error') {
  setTextFeedback(el('feedback'), message, type);
}

function setInviteFeedback(message, type = 'error') {
  setTextFeedback(el('inviteFeedback'), message, type);
}

function setEditFeedback(message, type = 'error') {
  setTextFeedback(el('editFeedback'), message, type);
}

function setMeta(text) {
  const meta = el('resultsMeta');
  if (!meta) return;
  meta.textContent = text;
}

function setTableContent(html) {
  const tableBody = el('tableBody');
  if (!tableBody) return;
  tableBody.innerHTML = html;
}

function setLoadingState() {
  setTableContent(`
    <tr>
      <td colspan="5" class="h-40 px-5 py-4">
        <div class="flex h-full items-center justify-center">
          ${spinnerMarkup('h-8 w-8')}
        </div>
      </td>
    </tr>
  `);
}

function setEmptyState(message = 'No users found.') {
  setTableContent(`
    <tr>
      <td colspan="5" class="px-5 py-8 text-center text-sm font-medium text-text-muted">
        ${escapeHtml(message)}
      </td>
    </tr>
  `);
}

function setErrorState() {
  setTableContent(`
    <tr>
      <td colspan="5" class="px-5 py-8 text-center text-sm font-medium text-danger-text">
        Failed to load users.
      </td>
    </tr>
  `);
}

function setButtonDisabled(button, disabled) {
  if (!(button instanceof HTMLElement)) return;
  button.toggleAttribute('disabled', !!disabled);
  button.classList.toggle('opacity-50', !!disabled);
  button.classList.toggle('cursor-not-allowed', !!disabled);
}

function roleBadgeMarkup(role) {
  const normalized = normalizeRole(role, 'viewer');
  const label = escapeHtml(toTitleCase(normalized));

  if (normalized === 'admin') {
    return `<span class="inline-flex items-center rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-800">${label}</span>`;
  }

  if (normalized === 'staff') {
    return `<span class="inline-flex items-center rounded-full bg-warning-bg px-3 py-1 text-xs font-semibold text-warning-text">${label}</span>`;
  }

  return `<span class="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-muted">${label}</span>`;
}

function userRowMarkup(user) {
  const id = String(user?.id || '').trim();
  const fullName = String(user?.full_name || '').trim() || 'N/A';
  const email = String(user?.email || '').trim() || 'N/A';
  const phone = formatPhoneNumber(user?.phone || '') || 'N/A';
  const role = normalizeRole(user?.role, 'viewer');

  const safeId = escapeHtml(id);
  const safeName = escapeHtml(fullName);
  const safeEmail = escapeHtml(email);
  const safePhone = escapeHtml(phone);

  return `
    <tr class="transition hover:bg-primary-50/40">
      <td class="px-5 py-4 text-sm font-semibold text-text">${safeName}</td>
      <td class="px-5 py-4 text-sm text-text-muted">${safeEmail}</td>
      <td class="px-5 py-4 text-sm text-text-muted">${safePhone}</td>
      <td class="px-5 py-4">${roleBadgeMarkup(role)}</td>
      <td class="px-5 py-4">
        <div class="flex justify-end gap-2">
          <button
            type="button"
            data-action="edit"
            data-user-id="${safeId}"
            aria-label="Edit user ${safeName}"
            title="Edit user"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-primary-700 transition hover:bg-primary-100">
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true">
              <path d="M12 20h9" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="m16.5 3.5 4 4L8 20l-4 1 1-4L16.5 3.5Z" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </button>
          <button
            type="button"
            data-action="delete"
            data-user-id="${safeId}"
            aria-label="Delete user ${safeName}"
            title="Delete user"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-400 text-white transition hover:bg-red-600">
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true">
              <path d="M3 6h18" stroke-linecap="round" stroke-linejoin="round"></path>
              <path d="M8 6V4h8v2m-7 0v13m6-13v13M5 6l1 14h12l1-14" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function setRows(users = []) {
  setTableContent(users.map(userRowMarkup).join(''));
}

function updatePaginationUi(rowCount = 0) {
  const meta = el('paginationMeta');
  const prevButton = el('prevPage');
  const nextButton = el('nextPage');
  const pageInput = el('pageInput');
  const pageTotal = el('pageTotal');

  const hasRows = state.total > 0 && rowCount > 0;
  const start = hasRows ? (state.page - 1) * CONFIG.pageSize + 1 : 0;
  const end = hasRows ? start + rowCount - 1 : 0;

  if (meta) {
    meta.textContent = `Showing ${formatNumber(start)}-${formatNumber(end)} of ${formatNumber(state.total)} users`;
  }

  const safeCurrentPage = state.total === 0 ? 0 : state.page;
  const safeTotalPages = state.total === 0 ? 0 : state.totalPages;

  if (pageInput instanceof HTMLInputElement) {
    pageInput.value = String(safeCurrentPage);
    pageInput.disabled = state.loading || safeTotalPages === 0;
    pageInput.min = safeTotalPages === 0 ? '0' : '1';
    pageInput.max = String(safeTotalPages);
  }

  if (pageTotal) {
    pageTotal.textContent = formatNumber(safeTotalPages);
  }

  setButtonDisabled(
    prevButton,
    state.loading || state.total === 0 || state.page <= 1
  );
  setButtonDisabled(
    nextButton,
    state.loading || state.total === 0 || state.page >= state.totalPages
  );
}

function buildUsersQuery(page) {
  const query = {
    page,
    limit: CONFIG.pageSize,
    sort: CONFIG.sortField,
    direction: CONFIG.sortDirection,
  };

  const searchQuery = String(state.searchQuery || '').trim();
  if (searchQuery) {
    query.search = searchQuery;
  }

  if (state.roleFilter) {
    query.role = state.roleFilter;
  }

  return query;
}

function buildCountQuery() {
  const query = {};

  const searchQuery = String(state.searchQuery || '').trim();
  if (searchQuery) {
    query.search = searchQuery;
  }

  if (state.roleFilter) {
    query.role = state.roleFilter;
  }

  return query;
}

function describeActiveFilters() {
  const activeSearch = String(state.searchQuery || '').trim();
  const activeRole = normalizeRole(state.roleFilter, '');

  if (activeSearch && activeRole) {
    return `Showing role "${toTitleCase(activeRole)}" results for "${activeSearch}".`;
  }

  if (activeSearch) {
    return `Showing results for "${activeSearch}".`;
  }

  if (activeRole) {
    return `Showing role "${toTitleCase(activeRole)}".`;
  }

  return 'Manage invited users and profile information.';
}

function getUserById(userId) {
  return state.usersById.get(String(userId || '').trim()) || null;
}

function setModalOpen(overlayEl, open) {
  if (!(overlayEl instanceof HTMLElement)) return;

  overlayEl.classList.toggle('hidden', !open);
  overlayEl.classList.toggle('flex', !!open);
  overlayEl.setAttribute('aria-hidden', open ? 'false' : 'true');

  const inviteOpen =
    el('inviteOverlay') instanceof HTMLElement &&
    !el('inviteOverlay').classList.contains('hidden');
  const editOpen =
    el('editOverlay') instanceof HTMLElement &&
    !el('editOverlay').classList.contains('hidden');
  document.body.style.overflow = inviteOpen || editOpen ? 'hidden' : '';
}

function openInviteModal() {
  const form = el('inviteForm');
  if (form instanceof HTMLFormElement) {
    form.reset();
  }

  setRoleDropdownValue('invite', 'viewer', { syncInput: true });
  closeRoleDropdown('invite');

  setInviteFeedback('');
  setModalOpen(el('inviteOverlay'), true);
  el('inviteEmail')?.focus();
}

function closeInviteModal() {
  closeRoleDropdown('invite');
  setInviteFeedback('');
  setModalOpen(el('inviteOverlay'), false);
}

function setEditFormValues(profile = {}) {
  const idInput = el('editId');
  const fullNameInput = el('editFullName');
  const phoneInput = el('editPhone');

  if (idInput instanceof HTMLInputElement) {
    idInput.value = String(profile?.id || '').trim();
  }
  if (fullNameInput instanceof HTMLInputElement) {
    fullNameInput.value = String(profile?.full_name || '').trim();
  }
  if (phoneInput instanceof HTMLInputElement) {
    phoneInput.value = formatPhoneNumber(profile?.phone || '');
  }
  setRoleDropdownValue('edit', normalizeRole(profile?.role, 'viewer'), {
    syncInput: true,
  });
}

async function openEditModal(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return;

  setEditFeedback('');
  setModalOpen(el('editOverlay'), true);

  const cachedUser = getUserById(safeUserId);
  if (cachedUser) {
    setEditFormValues(cachedUser);
  } else {
    setEditFormValues({ id: safeUserId });
  }

  setButtonDisabled(el('editSubmit'), true);
  try {
    const profile = await getProfileById(safeUserId);
    setEditFormValues(profile);
  } catch (error) {
    setEditFeedback(error?.message || 'Failed to load user details.');
  } finally {
    setButtonDisabled(el('editSubmit'), false);
    el('editFullName')?.focus();
  }
}

function closeEditModal() {
  closeRoleDropdown('edit');
  setEditFeedback('');
  setModalOpen(el('editOverlay'), false);
}

async function handleDeleteUser(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return;

  const user = getUserById(safeUserId);
  const userLabel = String(
    user?.full_name || user?.email || 'this user'
  ).trim();

  const confirmed = await confirmDelete({
    title: 'Delete user',
    message: `Delete ${userLabel}?\nThis action cannot be undone.`,
    confirmText: 'Delete',
    cancelText: 'Cancel',
  });
  if (!confirmed) return;

  setPageFeedback('');
  try {
    await deleteProfile(safeUserId);
    setPageFeedback('User deleted.', 'success');
    await loadUsersPage(state.page);
  } catch (error) {
    setPageFeedback(error?.message || 'Failed to delete user.');
  }
}

async function loadUsersPage(pageNumber) {
  const previousPage = state.page;
  const parsedPage = Number.parseInt(String(pageNumber), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  state.loading = true;
  setMeta('Loading users...');
  setLoadingState();
  updatePaginationUi(0);

  let rowCount = 0;

  try {
    const [countResult, usersResult] = await Promise.all([
      getProfilesCount(buildCountQuery()),
      getProfiles(buildUsersQuery(requestedPage)),
    ]);

    const total = Number(countResult?.count) || 0;
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));

    state.total = total;
    state.totalPages = totalPages;
    state.page = Math.min(requestedPage, totalPages);

    let users = Array.isArray(usersResult) ? usersResult : [];
    if (state.page !== requestedPage) {
      const clampedResult = await getProfiles(buildUsersQuery(state.page));
      users = Array.isArray(clampedResult) ? clampedResult : [];
    }

    rowCount = users.length;
    state.usersById = new Map(
      users.map((user) => [String(user?.id || '').trim(), user])
    );

    if (!users.length) {
      const searchQuery = String(state.searchQuery || '').trim();
      const roleLabel = normalizeRole(state.roleFilter, '');
      let message = 'No users found.';

      if (searchQuery && roleLabel) {
        message = `No ${toTitleCase(roleLabel)} users found for "${searchQuery}".`;
      } else if (searchQuery) {
        message = `No users found for "${searchQuery}".`;
      } else if (roleLabel) {
        message = `No ${toTitleCase(roleLabel)} users found.`;
      }

      setMeta(message);
      setEmptyState(message);
      return;
    }

    setRows(users);
    setMeta(describeActiveFilters());
  } catch (error) {
    console.error('Failed to load users', error);
    state.total = 0;
    state.totalPages = 1;
    state.page = 1;
    state.usersById = new Map();
    setMeta('Failed to load users.');
    setErrorState();
  } finally {
    state.loading = false;
    updatePaginationUi(rowCount);

    if (requestedPage !== previousPage) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }
  }
}

function bindModalCloseControls({
  overlayKey,
  closeKey,
  cancelKey,
  closeHandler,
}) {
  const overlay = el(overlayKey);
  const closeButton = el(closeKey);
  const cancelButton = el(cancelKey);

  if (
    closeButton instanceof HTMLButtonElement &&
    closeButton.dataset.bound !== 'true'
  ) {
    closeButton.addEventListener('click', closeHandler);
    closeButton.dataset.bound = 'true';
  }

  if (
    cancelButton instanceof HTMLButtonElement &&
    cancelButton.dataset.bound !== 'true'
  ) {
    cancelButton.addEventListener('click', closeHandler);
    cancelButton.dataset.bound = 'true';
  }

  if (overlay instanceof HTMLElement && overlay.dataset.bound !== 'true') {
    overlay.addEventListener('click', (event) => {
      if (event.target !== overlay) return;
      closeHandler();
    });
    overlay.dataset.bound = 'true';
  }
}

function bindRoleDropdown(kind) {
  const elements = getRoleDropdownElements(kind);
  if (!elements) return;

  const trigger = elements.trigger;
  const menu = elements.menu;
  if (
    trigger instanceof HTMLButtonElement &&
    menu instanceof HTMLElement &&
    trigger.dataset.bound !== 'true'
  ) {
    trigger.addEventListener('click', () => {
      if (kind === 'invite') closeRoleDropdown('edit');
      if (kind === 'edit') closeRoleDropdown('invite');
      toggleRoleDropdown(kind);
    });
    trigger.dataset.bound = 'true';
  }

  getRoleDropdownOptions(kind).forEach((option) => {
    if (
      !(option instanceof HTMLButtonElement) ||
      option.dataset.bound === 'true'
    ) {
      return;
    }

    option.addEventListener('click', () => {
      setRoleDropdownValue(kind, getRoleDropdownOptionValue(kind, option), {
        syncInput: true,
      });
      closeRoleDropdown(kind);
    });
    option.dataset.bound = 'true';
  });
}

function bindRoleDropdownDismiss() {
  if (roleDropdownDismissBound) return;

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const inviteRoot = getRoleDropdownElements('invite')?.root;
    const editRoot = getRoleDropdownElements('edit')?.root;
    if (
      inviteRoot?.contains(event.target) ||
      editRoot?.contains(event.target)
    ) {
      return;
    }

    closeAllRoleDropdowns();
  });

  roleDropdownDismissBound = true;
}

function bindModalControls() {
  if (modalControlsBound) return;

  bindRoleDropdown('invite');
  bindRoleDropdown('edit');
  bindRoleDropdownDismiss();

  bindModalCloseControls({
    overlayKey: 'inviteOverlay',
    closeKey: 'inviteClose',
    cancelKey: 'inviteCancel',
    closeHandler: closeInviteModal,
  });

  bindModalCloseControls({
    overlayKey: 'editOverlay',
    closeKey: 'editClose',
    cancelKey: 'editCancel',
    closeHandler: closeEditModal,
  });

  const inviteForm = el('inviteForm');
  if (
    inviteForm instanceof HTMLFormElement &&
    inviteForm.dataset.bound !== 'true'
  ) {
    inviteForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setInviteFeedback('');

      const emailInput = el('inviteEmail');
      const roleInput = el('inviteRole');
      const submitButton = el('inviteSubmit');

      const email = String(emailInput?.value || '')
        .trim()
        .toLowerCase();
      const role = normalizeRole(roleInput?.value, 'viewer');

      if (!email) {
        setInviteFeedback('Email is required.');
        return;
      }

      setButtonDisabled(submitButton, true);
      try {
        await inviteProfile({ email, role }, { inviteKey: INVITE_API_KEY });
        setPageFeedback('Invite sent successfully.', 'success');
        closeInviteModal();
        await loadUsersPage(1);
      } catch (error) {
        setInviteFeedback(error?.message || 'Failed to send invite.');
      } finally {
        setButtonDisabled(submitButton, false);
      }
    });
    inviteForm.dataset.bound = 'true';
  }

  const editPhoneInput = el('editPhone');
  if (
    editPhoneInput instanceof HTMLInputElement &&
    editPhoneInput.dataset.bound !== 'true'
  ) {
    editPhoneInput.addEventListener('input', () => {
      editPhoneInput.value = formatPhoneNumber(editPhoneInput.value);
    });
    editPhoneInput.dataset.bound = 'true';
  }

  const editForm = el('editForm');
  if (
    editForm instanceof HTMLFormElement &&
    editForm.dataset.bound !== 'true'
  ) {
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      setEditFeedback('');

      const idInput = el('editId');
      const fullNameInput = el('editFullName');
      const phoneInput = el('editPhone');
      const roleInput = el('editRole');
      const submitButton = el('editSubmit');

      const userId = String(idInput?.value || '').trim();
      const fullName = String(fullNameInput?.value || '').trim();
      const phone = formatPhoneNumber(phoneInput?.value);
      const role = normalizeRole(roleInput?.value, 'viewer');

      if (
        phoneInput instanceof HTMLInputElement &&
        phoneInput.value !== phone
      ) {
        phoneInput.value = phone;
      }

      if (!userId) {
        setEditFeedback('Missing user identifier.');
        return;
      }
      if (!fullName) {
        setEditFeedback('Full name is required.');
        return;
      }

      setButtonDisabled(submitButton, true);
      try {
        await updateProfile(userId, {
          full_name: fullName,
          phone,
          role,
        });
        setPageFeedback('User updated successfully.', 'success');
        closeEditModal();
        await loadUsersPage(state.page);
      } catch (error) {
        setEditFeedback(error?.message || 'Failed to update user.');
      } finally {
        setButtonDisabled(submitButton, false);
      }
    });
    editForm.dataset.bound = 'true';
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeAllRoleDropdowns();
    closeInviteModal();
    closeEditModal();
  });

  modalControlsBound = true;
}

function getUsersController() {
  if (usersController) return usersController;

  usersController = setupUsersController({
    state,
    loadUsersPage,
    onInviteUser: openInviteModal,
    onEditUser: (userId) => {
      void openEditModal(userId);
    },
    onDeleteUser: (userId) => {
      void handleDeleteUser(userId);
    },
    searchDebounceMs: CONFIG.searchDebounceMs,
  });

  return usersController;
}

export async function renderUsers() {
  setPageFeedback('');
  bindModalControls();

  const controller = getUsersController();
  controller.bindAll();
  controller.syncUi();

  await loadUsersPage(1);
}
