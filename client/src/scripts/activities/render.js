import {
  getTransactions,
  getTransactionsCount,
} from '/src/services/transactionsService.js';
import { getBookById } from '/src/services/booksService.js';
import {
  isDropdownOpen,
  setDropdownOpen,
  syncDropdownOptions,
} from '/src/utils/dropdown.js';
import { getById, queryAll } from '/src/utils/dom.js';
import { normalizeLowerTrim } from '/src/utils/filter.js';
import { spinnerMarkup } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { search } from '/src/utils/search.js';
import { escapeHtml } from '/src/utils/string.js';

const IDS = {
  tableBody: 'activities-table-body',
  resultsMeta: 'activities-results-meta',
  paginationMeta: 'activities-pagination-meta',
  prevPage: 'activities-prev-page',
  nextPage: 'activities-next-page',
  pageInput: 'activities-page-input',
  pageTotal: 'activities-page-total',
  searchInput: 'activities-search-input',
  searchClear: 'activities-search-clear',
  actionInput: 'activities-filter-action',
  actionRoot: 'activities-filter-action-root',
  actionTrigger: 'activities-filter-action-trigger',
  actionLabel: 'activities-filter-action-label',
  actionChevron: 'activities-filter-action-chevron',
  actionMenu: 'activities-filter-action-menu',
};

const CONFIG = {
  pageSize: 20,
  searchDebounceMs: 220,
  searchBatchSize: 250,
};

const state = {
  page: 1,
  total: 0,
  totalPages: 1,
  loading: false,
  searchQuery: '',
  action: '',
  bookCache: new Map(),
};

let bound = false;
let searchDebounceId = null;

function el(key) {
  return getById(IDS[key]);
}

function bindOnce(element, eventName, handler) {
  if (!element || element.dataset.bound) return;
  element.addEventListener(eventName, handler);
  element.dataset.bound = 'true';
}

function clearSearchDebounce() {
  if (!searchDebounceId) return;
  window.clearTimeout(searchDebounceId);
  searchDebounceId = null;
}

function setTableContent(html) {
  const tbody = el('tableBody');
  if (!tbody) return;
  tbody.innerHTML = html;
}

function setMeta(text) {
  const meta = el('resultsMeta');
  if (!meta) return;
  meta.textContent = text;
}

function setLoadingState() {
  setTableContent(`
    <tr>
      <td colspan="6" class="h-40 px-5 py-4">
        <div class="flex h-full items-center justify-center">
          ${spinnerMarkup('h-8 w-8')}
        </div>
      </td>
    </tr>
  `);
}

function setEmptyState(message = 'No activities found.') {
  setTableContent(`
    <tr>
      <td colspan="6" class="px-5 py-8 text-center text-sm font-medium text-text-muted">
        ${escapeHtml(message)}
      </td>
    </tr>
  `);
}

function setErrorState() {
  setTableContent(`
    <tr>
      <td colspan="6" class="px-5 py-8 text-center text-sm font-medium text-danger-text">
        Failed to load activities.
      </td>
    </tr>
  `);
}

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = disabled;
  button.classList.toggle('opacity-50', disabled);
  button.classList.toggle('cursor-not-allowed', disabled);
}

function getSearchQuery() {
  return String(state.searchQuery ?? '').trim();
}

function setSearchQuery(value, { syncInput = false } = {}) {
  const nextValue = String(value ?? '');
  const changed = nextValue !== state.searchQuery;
  state.searchQuery = nextValue;

  if (syncInput) {
    const input = el('searchInput');
    if (input && input.value !== nextValue) {
      input.value = nextValue;
    }
  }

  const clear = el('searchClear');
  if (clear) {
    clear.classList.toggle('hidden', getSearchQuery().length === 0);
  }

  return changed;
}

function getActionFilterValue() {
  return normalizeLowerTrim(el('actionInput')?.value);
}

function setActionFilterValue(value) {
  const input = el('actionInput');
  const next = normalizeLowerTrim(value);
  const changed = next !== state.action;

  if (input) {
    input.value = next;
  }
  state.action = next;
  syncActionFilterUi();

  return changed;
}

function getActionFilterLabel(value = state.action) {
  if (value === 'checkout') return 'Checkout';
  if (value === 'checkin') return 'Checkin';
  return 'All action';
}

function getActionFilterOptions() {
  const root = el('actionRoot');
  if (!root) return [];
  return queryAll('[data-action-option]', root);
}

function getActionOptionValue(option) {
  return normalizeLowerTrim(option?.dataset?.actionOption);
}

function syncActionFilterUi() {
  const label = el('actionLabel');
  if (label) {
    label.textContent = getActionFilterLabel(state.action);
  }

  syncDropdownOptions(getActionFilterOptions(), state.action, (option) =>
    getActionOptionValue(option)
  );
}

function closeActionMenu() {
  setDropdownOpen(
    el('actionTrigger'),
    el('actionMenu'),
    el('actionChevron'),
    false
  );
}

function toggleActionMenu() {
  const menu = el('actionMenu');
  const open = !isDropdownOpen(menu);
  setDropdownOpen(el('actionTrigger'), menu, el('actionChevron'), open);
}

function formatPhone(value) {
  const digits = String(value ?? '')
    .replace(/\D+/g, '')
    .slice(0, 10);

  if (!digits) return 'N/A';
  if (digits.length < 4) return digits;
  if (digits.length < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function formatAction(action) {
  const value = String(action || '')
    .trim()
    .toLowerCase();
  if (value === 'checkout') return 'Checkout';
  if (value === 'checkin') return 'Checkin';
  return value
    ? `${value.charAt(0).toUpperCase()}${value.slice(1)}`
    : 'Unknown';
}

function formatActionBadge(action) {
  const value = String(action || '')
    .trim()
    .toLowerCase();
  const label = escapeHtml(formatAction(action));

  if (value === 'checkout') {
    return `<span class="badge-borrowed">${label}</span>`;
  }

  if (value === 'checkin') {
    return `<span class="badge-available">${label}</span>`;
  }

  return `<span class="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-muted">${label}</span>`;
}

function formatDateTime(value) {
  if (!value) return 'N/A';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getActivityBook(activity, booksById) {
  const bookId = String(activity?.book_id || '').trim();
  if (!bookId) return null;
  return booksById.get(bookId) || null;
}

function activityRowMarkup(activity, booksById) {
  const activityId = escapeHtml(activity?.id || 'N/A');
  const book = getActivityBook(activity, booksById);
  const bookTitle = escapeHtml(book?.title || 'Unknown book');
  const bookAuthor = escapeHtml(book?.author || 'Unknown author');
  const borrowerName = escapeHtml(activity?.borrower_name || 'N/A');
  const borrowerPhone = escapeHtml(formatPhone(activity?.borrower_phone));
  const dateText = escapeHtml(formatDateTime(activity?.created_at));

  return `
    <tr class="transition hover:bg-primary-50/40">
      <td class="px-5 py-4 text-xs font-medium text-text-muted break-all whitespace-normal">
        <span class="font-mono">${activityId}</span>
      </td>
      <td class="px-5 py-4">
        <p class="max-w-xs truncate text-sm font-semibold text-text">${bookTitle}</p>
        <p class="max-w-xs truncate text-xs text-text-muted">by ${bookAuthor}</p>
      </td>
      <td class="px-5 py-4">
        ${formatActionBadge(activity?.action)}
      </td>
      <td class="px-5 py-4 text-sm text-text whitespace-nowrap">${borrowerName}</td>
      <td class="px-5 py-4 text-sm text-text-muted whitespace-nowrap">${borrowerPhone}</td>
      <td class="px-5 py-4 text-sm text-text-muted whitespace-nowrap">${dateText}</td>
    </tr>
  `;
}

function updatePaginationUi(rowCount) {
  const meta = el('paginationMeta');
  const prevButton = el('prevPage');
  const nextButton = el('nextPage');
  const pageInput = el('pageInput');
  const pageTotal = el('pageTotal');

  const hasRows = state.total > 0 && rowCount > 0;
  const start = hasRows ? (state.page - 1) * CONFIG.pageSize + 1 : 0;
  const end = hasRows ? start + rowCount - 1 : 0;

  if (meta) {
    meta.textContent = `Showing ${formatNumber(start)}-${formatNumber(end)} of ${formatNumber(state.total)} activities`;
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

  setButtonDisabled(prevButton, state.loading || state.page <= 1);
  setButtonDisabled(
    nextButton,
    state.loading || state.total === 0 || state.page >= state.totalPages
  );
}

function setRows(activities, booksById) {
  setTableContent(
    activities
      .map((activity) => activityRowMarkup(activity, booksById))
      .join('')
  );
}

async function resolveBooksById(activities) {
  const uniqueBookIds = [
    ...new Set(
      activities
        .map((activity) => String(activity?.book_id || '').trim())
        .filter(Boolean)
    ),
  ];

  if (!uniqueBookIds.length) return new Map();

  const missingIds = uniqueBookIds.filter(
    (bookId) => !state.bookCache.has(bookId)
  );

  const pairs = await Promise.all(
    missingIds.map(async (bookId) => {
      try {
        const book = await getBookById(bookId);
        return [bookId, book];
      } catch {
        return [bookId, null];
      }
    })
  );

  pairs.forEach(([bookId, book]) => {
    state.bookCache.set(bookId, book);
  });

  return new Map(
    uniqueBookIds.map((bookId) => [bookId, state.bookCache.get(bookId) || null])
  );
}

function sortTransactionsByDateDesc(list) {
  return [...list].sort((a, b) => {
    const dateA = new Date(a?.created_at || 0).getTime();
    const dateB = new Date(b?.created_at || 0).getTime();
    return dateB - dateA;
  });
}

function buildTransactionsQuery(page, limit) {
  const query = { page, limit };
  if (state.action) {
    query.action = state.action;
  }

  return query;
}

function buildTransactionsCountQuery() {
  const query = {};
  if (state.action) {
    query.action = state.action;
  }
  return query;
}

async function fetchSearchCandidateTransactions() {
  const all = [];
  let page = 1;

  while (true) {
    const data = await getTransactions(
      buildTransactionsQuery(page, CONFIG.searchBatchSize)
    );
    const rows = Array.isArray(data) ? data : [];
    if (!rows.length) break;

    all.push(...rows);

    if (rows.length < CONFIG.searchBatchSize) break;
    page += 1;
  }

  return sortTransactionsByDateDesc(all);
}

function filterActivitiesBySearch(activities, booksById) {
  const query = getSearchQuery();
  if (!query) return activities;

  const searchableRows = activities.map((activity) => {
    const book = getActivityBook(activity, booksById);
    return {
      activity,
      bookTitle: book?.title || '',
      bookAuthor: book?.author || '',
      borrowerName: activity?.borrower_name || '',
      borrowerPhone: activity?.borrower_phone || '',
      action: activity?.action || '',
    };
  });

  const filtered = search(query, searchableRows, [
    'bookTitle',
    'bookAuthor',
    'borrowerName',
    'borrowerPhone',
    'action',
  ]);

  return filtered.map((row) => row.activity);
}

function scrollToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
}

async function loadActivitiesPage(pageNumber) {
  const parsedPage = Number.parseInt(String(pageNumber), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const previousPage = state.page;
  let rowCount = 0;

  state.loading = true;
  setMeta('Loading activities...');
  setLoadingState();
  updatePaginationUi(0);

  try {
    const searchQuery = getSearchQuery();
    const hasSearch = searchQuery.length > 0;

    let rows = [];
    let booksById = new Map();

    if (hasSearch) {
      const candidates = await fetchSearchCandidateTransactions();
      booksById = await resolveBooksById(candidates);

      const filtered = filterActivitiesBySearch(candidates, booksById);
      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
      state.total = total;
      state.totalPages = totalPages;
      state.page = Math.min(requestedPage, totalPages);

      const start = (state.page - 1) * CONFIG.pageSize;
      const end = start + CONFIG.pageSize;
      rows = filtered.slice(start, end);
      rowCount = rows.length;
    } else {
      const countResult = await getTransactionsCount(
        buildTransactionsCountQuery()
      );
      const total = Number(countResult?.count) || 0;
      const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));

      state.total = total;
      state.totalPages = totalPages;
      state.page = Math.min(requestedPage, totalPages);

      if (total > 0) {
        const data = await getTransactions(
          buildTransactionsQuery(state.page, CONFIG.pageSize)
        );
        const list = Array.isArray(data) ? data : [];
        rows = sortTransactionsByDateDesc(list);
        rowCount = rows.length;
        booksById = await resolveBooksById(rows);
      }
    }

    if (!rows.length) {
      const message = hasSearch
        ? `No activities found for "${searchQuery}".`
        : 'No activities found.';
      setMeta(message);
      setEmptyState(message);
      return;
    }

    if (hasSearch) {
      setMeta(
        `Showing results for "${searchQuery}" (${formatNumber(state.total)} activities).`
      );
    } else if (state.action) {
      setMeta(`Filtered by action: ${getActionFilterLabel(state.action)}.`);
    } else {
      setMeta('Track checkout and checkin history (latest first).');
    }
    setRows(rows, booksById);
  } catch (error) {
    console.error('Failed to render activities', error);
    state.total = 0;
    state.totalPages = 1;
    state.page = 1;
    setMeta('Failed to load activities.');
    setErrorState();
  } finally {
    state.loading = false;
    updatePaginationUi(rowCount);
    if (state.page !== previousPage) {
      scrollToTop();
    }
  }
}

function bindControls() {
  if (bound) return;

  bindOnce(el('prevPage'), 'click', () => {
    if (state.loading || state.page <= 1) return;
    void loadActivitiesPage(state.page - 1);
  });

  bindOnce(el('nextPage'), 'click', () => {
    if (state.loading || state.page >= state.totalPages) return;
    void loadActivitiesPage(state.page + 1);
  });

  bindOnce(el('pageInput'), 'keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();

    const input = el('pageInput');
    if (!(input instanceof HTMLInputElement)) return;

    if (state.loading || state.total <= 0) {
      input.value = state.total <= 0 ? '0' : String(state.page);
      return;
    }

    const parsed = Number.parseInt(String(input.value || '').trim(), 10);
    if (!Number.isFinite(parsed)) {
      input.value = String(state.page);
      return;
    }

    const targetPage = Math.min(Math.max(parsed, 1), state.totalPages);
    input.value = String(targetPage);
    input.blur();

    if (targetPage === state.page) return;
    void loadActivitiesPage(targetPage);
  });

  const searchInput = el('searchInput');
  const searchClear = el('searchClear');
  bindOnce(searchInput, 'input', () => {
    clearSearchDebounce();

    searchDebounceId = window.setTimeout(() => {
      const changed = setSearchQuery(searchInput?.value || '');
      if (!changed) return;
      void loadActivitiesPage(1);
    }, CONFIG.searchDebounceMs);
  });

  bindOnce(searchInput, 'keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearSearchDebounce();

    const changed = setSearchQuery(searchInput?.value || '');
    if (!changed) return;
    void loadActivitiesPage(1);
  });

  bindOnce(searchClear, 'click', () => {
    clearSearchDebounce();
    const changed = setSearchQuery('', { syncInput: true });
    if (!changed) return;
    searchInput?.focus();
    void loadActivitiesPage(1);
  });

  bindOnce(el('actionTrigger'), 'click', () => {
    toggleActionMenu();
  });

  getActionFilterOptions().forEach((option) => {
    bindOnce(option, 'click', () => {
      closeActionMenu();
      const changed = setActionFilterValue(getActionOptionValue(option));
      if (!changed) return;
      void loadActivitiesPage(1);
    });
  });

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const root = el('actionRoot');
    if (root?.contains(event.target)) return;
    closeActionMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    closeActionMenu();
  });

  bound = true;
}

export async function renderActivities() {
  setSearchQuery(state.searchQuery, { syncInput: true });
  state.action = getActionFilterValue();
  syncActionFilterUi();

  bindControls();
  await loadActivitiesPage(1);
}
