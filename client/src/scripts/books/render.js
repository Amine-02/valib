import { getBooks, getBooksCount } from '/src/services/booksService.js';
import bookDetailTemplate from '/src/components/book-detail.html?raw';
import { setupBooksController } from './controller.js';
import { setupBooksModals } from './modals.js';
import { getById, queryAll } from '/src/utils/dom.js';
import { normalizeYearRange } from '/src/utils/filter.js';
import { spinnerMarkup } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { search } from '/src/utils/search.js';
import { escapeHtml, toTitleCase } from '/src/utils/string.js';

const IDS = {
  tableBody: 'books-table-body',
  resultsMeta: 'books-results-meta',
  paginationMeta: 'books-pagination-meta',
  prevPage: 'books-prev-page',
  nextPage: 'books-next-page',
  pageIndicator: 'books-page-indicator',
  booksView: 'view-books',
  detailHost: 'books-detail-host',
  detailEmpty: 'book-detail-empty',
  detailPanel: 'book-detail-panel',
  detailCover: 'book-detail-cover',
  detailCoverFallback: 'book-detail-cover-fallback',
  detailTitle: 'book-detail-title',
  detailAuthor: 'book-detail-author',
  detailStatus: 'book-detail-status',
  detailGenre: 'book-detail-genre',
  detailPublishedYear: 'book-detail-published-year',
  detailBorrowerRoot: 'book-detail-borrower-root',
  detailBorrowerName: 'book-detail-borrower-name',
  detailBorrowerPhone: 'book-detail-borrower-phone',
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
  selectedBookId: '',
};

let booksController = null;
let booksModals = null;
let detailScrollFrameId = 0;

function getBooksScrollContainer() {
  const view = el('booksView');
  if (view instanceof HTMLElement) return view;
  return document.scrollingElement || document.documentElement;
}

function el(key) {
  return getById(IDS[key]);
}

function ensureDetailTemplate() {
  const host = el('detailHost');
  if (!host || host.dataset.loaded === 'true') return;
  host.innerHTML = bookDetailTemplate;
  host.dataset.loaded = 'true';
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

function toGenreLabel(genre) {
  const value = String(genre || '').trim();
  if (!value) return 'N/A';
  return toTitleCase(value.replaceAll('_', ' '));
}

function resetBookDetail() {
  const empty = el('detailEmpty');
  const panel = el('detailPanel');
  const borrowerRoot = el('detailBorrowerRoot');
  const borrowerName = el('detailBorrowerName');
  const borrowerPhone = el('detailBorrowerPhone');
  if (empty) empty.classList.remove('hidden');
  if (panel) panel.classList.add('hidden');
  if (borrowerRoot) borrowerRoot.classList.add('hidden');
  if (borrowerName) borrowerName.textContent = 'N/A';
  if (borrowerPhone) borrowerPhone.textContent = 'N/A';
}

function setBookDetailCover(coverUrl = '') {
  const cover = el('detailCover');
  const fallback = el('detailCoverFallback');
  if (!cover || !fallback) return;

  const value = String(coverUrl || '').trim();
  if (!value) {
    cover.removeAttribute('src');
    cover.classList.add('hidden');
    fallback.classList.remove('hidden');
    return;
  }

  cover.src = value;
  cover.classList.remove('hidden');
  fallback.classList.add('hidden');
}

function syncBorrowerDetails({ status, borrowerName, borrowerPhone }) {
  const root = el('detailBorrowerRoot');
  const nameEl = el('detailBorrowerName');
  const phoneEl = el('detailBorrowerPhone');
  if (!root || !nameEl || !phoneEl) return;

  const isBorrowed =
    String(status || '')
      .trim()
      .toLowerCase() === 'borrowed';

  if (!isBorrowed) {
    root.classList.add('hidden');
    nameEl.textContent = 'N/A';
    phoneEl.textContent = 'N/A';
    return;
  }

  nameEl.textContent = borrowerName || 'N/A';
  phoneEl.textContent = borrowerPhone || 'N/A';
  root.classList.remove('hidden');
}

function animateScrollTo(container, targetY, durationMs = 420) {
  if (detailScrollFrameId) {
    window.cancelAnimationFrame(detailScrollFrameId);
    detailScrollFrameId = 0;
  }

  const isElement = container instanceof HTMLElement;
  const startY = isElement ? container.scrollTop : window.scrollY;
  const distance = targetY - startY;
  if (Math.abs(distance) < 2) {
    if (isElement) {
      container.scrollTop = targetY;
    } else {
      window.scrollTo({ top: targetY, left: 0 });
    }
    return;
  }

  const startAt = performance.now();
  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const tick = (now) => {
    const progress = Math.min(1, (now - startAt) / durationMs);
    const eased = easeInOutCubic(progress);
    const nextY = startY + distance * eased;

    if (isElement) {
      container.scrollTop = nextY;
    } else {
      window.scrollTo({ top: nextY, left: 0 });
    }

    if (progress < 1) {
      detailScrollFrameId = window.requestAnimationFrame(tick);
      return;
    }

    detailScrollFrameId = 0;
  };

  detailScrollFrameId = window.requestAnimationFrame(tick);
}

function scrollDetailIntoViewIfStacked() {
  if (window.matchMedia('(min-width: 1280px)').matches) return;
  const host = el('detailHost');
  if (!host) return;

  requestAnimationFrame(() => {
    const container = getBooksScrollContainer();
    const hostRect = host.getBoundingClientRect();
    const isElementContainer = container instanceof HTMLElement;

    const containerTop = isElementContainer
      ? container.getBoundingClientRect().top
      : 0;
    const currentY = isElementContainer ? container.scrollTop : window.scrollY;
    const targetY = Math.max(
      0,
      Math.round(currentY + (hostRect.top - containerTop) - 16)
    );

    animateScrollTo(container, targetY);
  });
}

function renderBookDetail(book) {
  if (!book) return;

  const id = String(book.id || '').trim();
  if (!id) return;

  state.selectedBookId = id;

  const empty = el('detailEmpty');
  const panel = el('detailPanel');
  if (empty) empty.classList.add('hidden');
  if (panel) panel.classList.remove('hidden');

  const title = String(book.title || 'Untitled').trim() || 'Untitled';
  const author =
    String(book.author || 'Unknown author').trim() || 'Unknown author';
  const genre = toGenreLabel(book.genre);
  const status = String(book.status || 'available')
    .trim()
    .toLowerCase();
  const publishedYear = String(book.published_year || '').trim() || 'N/A';
  const borrowerName = String(book.borrower_name || '').trim();
  const borrowerPhone = String(book.borrower_phone || '').trim();

  const titleEl = el('detailTitle');
  const authorEl = el('detailAuthor');
  const genreEl = el('detailGenre');
  const publishedYearEl = el('detailPublishedYear');
  const statusEl = el('detailStatus');

  if (titleEl) titleEl.textContent = title;
  if (authorEl) authorEl.textContent = author;
  if (genreEl) genreEl.textContent = genre;
  if (publishedYearEl) publishedYearEl.textContent = publishedYear;

  if (statusEl) {
    statusEl.textContent = toStatusLabel(status);
    statusEl.classList.remove('badge-available', 'badge-borrowed');
    statusEl.classList.add(
      status === 'borrowed' ? 'badge-borrowed' : 'badge-available'
    );
  }

  syncBorrowerDetails({ status, borrowerName, borrowerPhone });
  setBookDetailCover(book.cover_url);
}

function syncSelectedRowUi() {
  const selectedId = String(state.selectedBookId || '');

  queryAll('tr[data-book-row="true"]', el('tableBody')).forEach((row) => {
    const isActive = selectedId !== '' && row.dataset.bookId === selectedId;
    row.classList.toggle('bg-primary-50/70', isActive);
    row.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
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
  const rawId = String(book?.id ?? '').trim();
  const isSelected =
    rawId !== '' && rawId === String(state.selectedBookId || '');

  const rawTitle = String(book?.title || 'Untitled');
  const rawAuthor = String(book?.author || 'Unknown author');
  const rawPublishedYear = String(book?.published_year || '');
  const rawGenre = String(book?.genre || '');
  const rawStatus = String(book?.status || '');
  const rawCoverUrl = String(book?.cover_url || '');
  const rawBorrowerName = String(book?.borrower_name || '');
  const rawBorrowerPhone = String(book?.borrower_phone || '');

  const id = escapeHtml(rawId || '-');
  const title = escapeHtml(rawTitle || 'Untitled');
  const author = escapeHtml(rawAuthor || 'Unknown author');
  const publishedYear = escapeHtml(rawPublishedYear || 'N/A');
  const genre = escapeHtml(rawGenre || 'N/A');
  const status = statusBadgeMarkup(book?.status);
  const rowClass = isSelected ? 'bg-primary-50/70' : '';

  return `
    <tr
      data-book-row="true"
      data-book-id="${escapeHtml(rawId)}"
      data-book-title="${escapeHtml(rawTitle)}"
      data-book-author="${escapeHtml(rawAuthor)}"
      data-book-published-year="${escapeHtml(rawPublishedYear)}"
      data-book-genre="${escapeHtml(rawGenre)}"
      data-book-status="${escapeHtml(rawStatus)}"
      data-book-cover-url="${escapeHtml(rawCoverUrl)}"
      data-book-borrower-name="${escapeHtml(rawBorrowerName)}"
      data-book-borrower-phone="${escapeHtml(rawBorrowerPhone)}"
      aria-selected="${isSelected ? 'true' : 'false'}"
      class="transition hover:bg-primary-50/40 cursor-pointer ${rowClass}">
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
    onSelectBook: (book) => {
      renderBookDetail(book);
      syncSelectedRowUi();
      scrollDetailIntoViewIfStacked();
    },
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
      state.selectedBookId = '';
      resetBookDetail();
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

    if (state.selectedBookId) {
      const selected = books.find(
        (book) => String(book?.id || '') === String(state.selectedBookId)
      );

      if (selected) {
        renderBookDetail(selected);
      } else {
        state.selectedBookId = '';
        resetBookDetail();
      }
    }

    syncSelectedRowUi();
  } catch (error) {
    console.error('Failed to render books', error);
    state.total = 0;
    state.totalPages = 1;
    state.page = 1;
    state.selectedBookId = '';
    setMeta('Failed to load books.');
    setErrorState();
    resetBookDetail();
  } finally {
    state.loading = false;
    updatePaginationUi(rowCount);
    if (requestedPage !== previousPage) {
      scrollBooksViewToTop();
    }
  }
}

export async function renderBooks() {
  ensureDetailTemplate();
  resetBookDetail();

  booksModals = setupBooksModals({
    onUpdated: async () => {
      await loadBooksPage(state.page);
    },
  });

  getBooksController().bindAll();
  await loadBooksPage(1);
}
