import { getBooks, getBooksCount } from '/src/services/booksService.js';
import { setupBooksController } from './controller.js';
import { setupBooksModals } from './modals.js';
import { getById } from '/src/utils/dom.js';
import { normalizeYearRange } from '/src/utils/filter.js';
import { spinnerMarkup } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { search } from '/src/utils/search.js';
import { escapeHtml } from '/src/utils/string.js';

const IDS = {
  tableBody: 'books-table-body',
  resultsMeta: 'books-results-meta',
  paginationMeta: 'books-pagination-meta',
  prevPage: 'books-prev-page',
  nextPage: 'books-next-page',
  pageIndicator: 'books-page-indicator',
  booksView: 'view-books',
};

const CONFIG = {
  pageSize: 12,
  sortField: 'title',
  sortDirection: 'asc',
  searchDebounceMs: 220,
  filterDebounceMs: 220,
  searchKeys: ['title', 'author', 'genre', 'summary'],
  yearMin: 1500,
  yearMax: 2026,
};

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
let booksModals = null;

function el(key) {
  return getById(IDS[key]);
}

function setMeta(text) {
  const meta = el('resultsMeta');
  if (meta) {
    meta.textContent = text;
  }
}

function setTableContent(html) {
  const tbody = el('tableBody');
  if (!tbody) return;
  tbody.innerHTML = html;
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

function setEmptyState(message = 'No books found.') {
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
        Failed to load books.
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

function getActiveSearchQuery() {
  return String(state.searchQuery ?? '').trim();
}

function updatePaginationUi(rowCount = 0) {
  const meta = el('paginationMeta');
  const indicator = el('pageIndicator');
  const prevButton = el('prevPage');
  const nextButton = el('nextPage');

  const hasRows = state.total > 0 && rowCount > 0;
  const start = hasRows ? (state.page - 1) * CONFIG.pageSize + 1 : 0;
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
    return '<div class="h-14 w-10 rounded-sm bg-primary-100"></div>';
  }

  return `<img src="${coverUrl}" alt="${title} cover" class="h-14 w-10 rounded-sm object-cover" loading="lazy" onerror="this.outerHTML='<div class=&quot;h-14 w-10 rounded-sm bg-primary-100&quot;></div>'" />`;
}

function bookRowMarkup(book) {
  const id = escapeHtml(book?.id ?? '-');
  const title = escapeHtml(book?.title || 'Untitled');
  const author = escapeHtml(book?.author || 'Unknown author');
  const publishedYear = escapeHtml(book?.published_year || 'N/A');
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
      <td class="px-5 py-4 text-sm text-text-muted">${publishedYear}</td>
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
  setTableContent(books.map(bookRowMarkup).join(''));
}

function filterBooksBySearch(books) {
  const activeSearchQuery = getActiveSearchQuery();
  if (!activeSearchQuery) return books;

  const filtered = search(activeSearchQuery, books, CONFIG.searchKeys);
  return Array.isArray(filtered) ? filtered : [];
}

function scrollBooksViewToTop() {
  const view = el('booksView');
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
    { min: CONFIG.yearMin, max: CONFIG.yearMax, sort: true }
  );

  if (queryYearFrom && Number(queryYearFrom) > CONFIG.yearMin) {
    filters.published_year_from = queryYearFrom;
  }

  if (queryYearTo && Number(queryYearTo) < CONFIG.yearMax) {
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
    limit: CONFIG.pageSize,
    sort: CONFIG.sortField,
    direction: CONFIG.sortDirection,
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
    yearMin: CONFIG.yearMin,
    yearMax: CONFIG.yearMax,
    searchDebounceMs: CONFIG.searchDebounceMs,
    filterDebounceMs: CONFIG.filterDebounceMs,
    loadBooksPage,
    openCreateModal: () => booksModals?.openCreateModal?.(),
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
    const totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));

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
  booksModals = setupBooksModals({
    onUpdated: async () => {
      await loadBooksPage(state.page);
    },
  });

  getBooksController().bindAll();
  await loadBooksPage(1);
}
