import { getBooks, getBooksCount } from '/src/services/booksService.js';
import { setupBooksController } from './controller.js';
import { normalizeYearRange } from '/src/utils/filter.js';
import { spinnerMarkup } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { search } from '/src/utils/search.js';
import { escapeHtml } from '/src/utils/string.js';

const BOOKS_TABLE_BODY_ID = 'books-table-body';
const BOOKS_RESULTS_META_ID = 'books-results-meta';
const BOOKS_PAGINATION_META_ID = 'books-pagination-meta';
const BOOKS_PREV_PAGE_ID = 'books-prev-page';
const BOOKS_NEXT_PAGE_ID = 'books-next-page';
const BOOKS_PAGE_INDICATOR_ID = 'books-page-indicator';

const PAGE_SIZE = 12;
const SORT_FIELD = 'title';
const SORT_DIRECTION = 'asc';
const SEARCH_DEBOUNCE_MS = 220;
const FILTER_DEBOUNCE_MS = 220;
const SEARCH_KEYS = ['title', 'author', 'genre', 'summary'];
const YEAR_MIN = 1500;
const YEAR_MAX = 2026;

const state = {
  page: 1,
  total: 0,
  totalPages: 1,
  loading: false,
  searchQuery: '',
  yearFrom: '',
  yearTo: '',
  genre: '',
  status: '',
};

let booksController = null;

function getTableBody() {
  return document.getElementById(BOOKS_TABLE_BODY_ID);
}

function setMeta(text) {
  const el = document.getElementById(BOOKS_RESULTS_META_ID);
  if (el) el.textContent = text;
}

function getPaginationMeta() {
  return document.getElementById(BOOKS_PAGINATION_META_ID);
}

function getPrevButton() {
  return document.getElementById(BOOKS_PREV_PAGE_ID);
}

function getNextButton() {
  return document.getElementById(BOOKS_NEXT_PAGE_ID);
}

function getPageIndicator() {
  return document.getElementById(BOOKS_PAGE_INDICATOR_ID);
}

function setLoadingState() {
  const tbody = getTableBody();
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="h-40 px-5 py-4">
        <div class="flex h-full items-center justify-center">
          ${spinnerMarkup('h-8 w-8')}
        </div>
      </td>
    </tr>
  `;
}

function setEmptyState(message = 'No books found.') {
  const tbody = getTableBody();
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="px-5 py-8 text-center text-sm font-medium text-text-muted">
        ${escapeHtml(message)}
      </td>
    </tr>
  `;
}

function setErrorState() {
  const tbody = getTableBody();
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5" class="px-5 py-8 text-center text-sm font-medium text-danger-text">
        Failed to load books.
      </td>
    </tr>
  `;
}

function setButtonDisabled(button, disabled) {
  if (!button) return;
  button.disabled = disabled;
  button.classList.toggle('opacity-50', disabled);
  button.classList.toggle('cursor-not-allowed', disabled);
}

function getActiveSearchQuery() {
  return String(state.searchQuery ?? '').trim();
}

function updatePaginationUi(rowCount = 0) {
  const meta = getPaginationMeta();
  const indicator = getPageIndicator();
  const prevButton = getPrevButton();
  const nextButton = getNextButton();

  const hasRows = state.total > 0 && rowCount > 0;
  const start = hasRows ? (state.page - 1) * PAGE_SIZE + 1 : 0;
  const end = hasRows ? start + rowCount - 1 : 0;

  if (meta) {
    meta.textContent = `Showing ${formatNumber(start)}-${formatNumber(end)} of ${formatNumber(state.total)} books`;
  }

  if (indicator) {
    const safeCurrentPage = state.total === 0 ? 0 : state.page;
    const safeTotalPages = state.total === 0 ? 0 : state.totalPages;
    indicator.textContent = `Page ${safeCurrentPage} / ${safeTotalPages}`;
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

function toStatusLabel(status) {
  const text = String(status || 'unknown')
    .trim()
    .toLowerCase()
    .replaceAll('_', ' ');

  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusBadgeMarkup(status) {
  const normalized = String(status || '')
    .trim()
    .toLowerCase();
  const label = escapeHtml(toStatusLabel(status));

  if (normalized === 'available') {
    return `<span class="badge-available">${label}</span>`;
  }

  if (normalized === 'borrowed') {
    return `<span class="badge-borrowed">${label}</span>`;
  }

  return `<span class="inline-flex items-center rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-muted">${label}</span>`;
}

function coverMarkup(book) {
  const title = escapeHtml(book?.title || 'Book');
  const coverUrl = escapeHtml(book?.cover_url || '');

  if (!coverUrl) {
    return '<div class="h-14 w-10 rounded-md bg-primary-100"></div>';
  }

  return `<img src="${coverUrl}" alt="${title} cover" class="h-14 w-10 rounded-md object-cover" loading="lazy" onerror="this.outerHTML='<div class=&quot;h-14 w-10 rounded-md bg-primary-100&quot;></div>'" />`;
}

function bookRowMarkup(book) {
  const id = escapeHtml(book?.id ?? '-');
  const title = escapeHtml(book?.title || 'Untitled');
  const author = escapeHtml(book?.author || 'Unknown author');
  const genre = escapeHtml(book?.genre || 'N/A');
  const status = statusBadgeMarkup(book?.status);

  return `
    <tr class="transition hover:bg-primary-50/40">
      <td class="px-5 py-4">
        <div class="flex items-center gap-3">
          ${coverMarkup(book)}
          <p class="text-sm font-semibold text-text">${title}</p>
        </div>
      </td>
      <td class="px-5 py-4 text-sm text-text-muted">${author}</td>
      <td class="px-5 py-4 text-sm text-text-muted">${genre}</td>
      <td class="px-5 py-4">${status}</td>
      <td class="px-5 py-4">
        <div class="flex justify-end gap-2">
          <button
            type="button"
            data-action="edit"
            data-book-id="${id}"
            aria-label="Edit book ${title}"
            title="Edit"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-primary-700 transition hover:bg-primary-100">
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true">
              <path
                d="M12 20h9"
                stroke-linecap="round"
                stroke-linejoin="round"></path>
              <path
                d="m16.5 3.5 4 4L8 20l-4 1 1-4L16.5 3.5Z"
                stroke-linecap="round"
                stroke-linejoin="round"></path>
            </svg>
          </button>
          <button
            type="button"
            data-action="delete"
            data-book-id="${id}"
            aria-label="Delete book ${title}"
            title="Delete"
            class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-400 text-white transition hover:bg-red-600">
            <svg
              class="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true">
              <path
                d="M3 6h18"
                stroke-linecap="round"
                stroke-linejoin="round"></path>
              <path
                d="M8 6V4h8v2m-7 0v13m6-13v13M5 6l1 14h12l1-14"
                stroke-linecap="round"
                stroke-linejoin="round"></path>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `;
}

function setRows(books) {
  const tbody = getTableBody();
  if (!tbody) return;
  tbody.innerHTML = books.map(bookRowMarkup).join('');
}

function filterBooksBySearch(books) {
  const activeSearchQuery = getActiveSearchQuery();
  if (!activeSearchQuery) return books;

  const filtered = search(activeSearchQuery, books, SEARCH_KEYS);
  return Array.isArray(filtered) ? filtered : [];
}

function scrollBooksViewToTop() {
  const view = document.getElementById('view-books');
  if (view instanceof HTMLElement) {
    view.scrollTo({ top: 0, left: 0 });
    return;
  }

  window.scrollTo({ top: 0, left: 0 });
}

function buildActiveFilters() {
  const filters = {};

  const { from: queryYearFrom, to: queryYearTo } = normalizeYearRange(
    state.yearFrom,
    state.yearTo,
    { min: YEAR_MIN, max: YEAR_MAX, sort: true }
  );

  if (queryYearFrom && Number(queryYearFrom) > YEAR_MIN) {
    filters.published_year_from = queryYearFrom;
  }

  if (queryYearTo && Number(queryYearTo) < YEAR_MAX) {
    filters.published_year_to = queryYearTo;
  }

  if (state.genre) {
    filters.genre = state.genre;
  }

  if (state.status) {
    filters.status = state.status;
  }

  return filters;
}

function buildBooksQuery(page) {
  const query = {
    page,
    limit: PAGE_SIZE,
    sort: SORT_FIELD,
    direction: SORT_DIRECTION,
    ...buildActiveFilters(),
  };

  const activeSearchQuery = getActiveSearchQuery();
  if (activeSearchQuery) {
    query.search = activeSearchQuery;
  }

  return query;
}

function buildCountQuery() {
  const query = { ...buildActiveFilters() };

  const activeSearchQuery = getActiveSearchQuery();
  if (activeSearchQuery) {
    query.search = activeSearchQuery;
  }

  return query;
}

function getBooksController() {
  if (booksController) return booksController;

  booksController = setupBooksController({
    state,
    yearMin: YEAR_MIN,
    yearMax: YEAR_MAX,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
    filterDebounceMs: FILTER_DEBOUNCE_MS,
    loadBooksPage,
  });

  return booksController;
}

async function loadBooksPage(pageNumber) {
  const previousPage = state.page;
  const parsedPage = Number.parseInt(String(pageNumber), 10);
  const requestedPage =
    Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  state.loading = true;
  setMeta('Loading books...');
  setLoadingState();
  updatePaginationUi(0);

  let rowCount = 0;

  try {
    const [countResult, pageBooksResult] = await Promise.all([
      getBooksCount(buildCountQuery()),
      getBooks(buildBooksQuery(requestedPage)),
    ]);

    const total = Number(countResult?.count) || 0;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    state.total = total;
    state.totalPages = totalPages;
    state.page = Math.min(requestedPage, totalPages);

    let books = Array.isArray(pageBooksResult) ? pageBooksResult : [];

    if (state.page !== requestedPage) {
      const clampedBooks = await getBooks(buildBooksQuery(state.page));
      books = Array.isArray(clampedBooks) ? clampedBooks : [];
    }

    books = filterBooksBySearch(books);

    rowCount = books.length;
    const activeSearchQuery = getActiveSearchQuery();

    if (!books.length) {
      const message = activeSearchQuery
        ? `No books found for "${activeSearchQuery}".`
        : 'No books found.';
      setMeta(message);
      setEmptyState(message);
      return;
    }

    if (activeSearchQuery) {
      setMeta(
        `Showing results for "${activeSearchQuery}" (${formatNumber(total)} books).`
      );
    } else {
      setMeta(`Track and manage ${formatNumber(total)} books (A-Z).`);
    }

    setRows(books);
  } catch (error) {
    console.error('Failed to render books', error);
    state.total = 0;
    state.totalPages = 1;
    state.page = 1;
    setMeta('Failed to load books.');
    setErrorState();
  } finally {
    state.loading = false;
    updatePaginationUi(rowCount);
    if (requestedPage !== previousPage) {
      scrollBooksViewToTop();
    }
  }
}

export async function renderBooks() {
  getBooksController().bindAll();
  await loadBooksPage(1);
}
