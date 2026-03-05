import {
  getBookLanguage,
  generateBookReview,
  generateBookSummary,
  getBookById,
  getBooks,
  getBooksCount,
} from '/src/services/booksService.js';
import bookDetailTemplate from '/src/components/book-detail.html?raw';
import { setupBooksController } from './controller.js';
import { setupBooksModals } from './modals.js';
import { getById, queryAll } from '/src/utils/dom.js';
import { normalizeYearRange } from '/src/utils/filter.js';
import { appState } from '/src/state.js';
import {
  clearLoaderState,
  showCenteredLoader,
  spinnerMarkup,
} from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { search } from '/src/utils/search.js';
import { escapeHtml, toTitleCase } from '/src/utils/string.js';

const IDS = {
  tableBody: 'books-table-body',
  resultsMeta: 'books-results-meta',
  paginationMeta: 'books-pagination-meta',
  prevPage: 'books-prev-page',
  nextPage: 'books-next-page',
  pageInput: 'books-page-input',
  pageTotal: 'books-page-total',
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
  detailLanguage: 'book-detail-language',
  detailBorrowerRoot: 'book-detail-borrower-root',
  detailBorrowerName: 'book-detail-borrower-name',
  detailBorrowerPhone: 'book-detail-borrower-phone',
  detailAiSummary: 'book-detail-ai-summary',
  detailAiRatingStars: 'book-detail-ai-rating-stars',
  detailAiRatingText: 'book-detail-ai-rating-text',
  detailAiRating: 'book-detail-ai-rating',
  detailAiReviews: 'book-detail-ai-reviews',
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
const OVERDUE_FILTER_VALUE = 'overdue';

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
  detailRequestId: 0,
};

let booksController = null;
let booksModals = null;
let detailScrollFrameId = 0;
const AI_SUMMARY_LOADER_CLASSES = [
  'min-h-16',
  'flex',
  'items-center',
  'justify-center',
];
const AI_REVIEWS_LOADER_CLASSES = [
  'min-h-24',
  'flex',
  'items-center',
  'justify-center',
];
const AI_RATING_LOADER_CLASSES = ['min-h-6', 'inline-flex', 'items-center'];
const LANGUAGE_LOADER_CLASSES = [
  'inline-flex',
  'items-center',
  'justify-center',
  'min-w-14',
];

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

function normalizeBookId(bookId) {
  return String(bookId || '').trim();
}

function getOverdueBookIdSet() {
  const ids = Array.isArray(appState.overdueBookIds)
    ? appState.overdueBookIds
    : [];
  return new Set(ids.map((bookId) => normalizeBookId(bookId)).filter(Boolean));
}

async function getOverdueBooksByIds() {
  const overdueBookIds = [...getOverdueBookIdSet()];
  if (!overdueBookIds.length) return [];

  const books = await Promise.all(
    overdueBookIds.map(async (bookId) => {
      try {
        return await getBookById(bookId);
      } catch {
        return null;
      }
    })
  );

  return books.filter(Boolean);
}

function filterBooksByYearAndGenre(books) {
  if (!Array.isArray(books)) return [];

  const { from: queryYearFrom, to: queryYearTo } = normalizeYearRange(
    state.yearFrom,
    state.yearTo,
    { min: CONFIG.yearMin, max: CONFIG.yearMax, sort: true }
  );
  const yearFrom = queryYearFrom ? Number(queryYearFrom) : null;
  const yearTo = queryYearTo ? Number(queryYearTo) : null;
  const genre = String(state.genre || '')
    .trim()
    .toLowerCase();

  return books.filter((book) => {
    const publishedYear = Number(book?.published_year);
    if (Number.isFinite(yearFrom) && Number.isFinite(publishedYear)) {
      if (publishedYear < yearFrom) return false;
    }
    if (Number.isFinite(yearTo) && Number.isFinite(publishedYear)) {
      if (publishedYear > yearTo) return false;
    }
    if (genre) {
      const bookGenre = String(book?.genre || '')
        .trim()
        .toLowerCase();
      if (!bookGenre.includes(genre)) return false;
    }
    return true;
  });
}

function sortBooksByTitle(books) {
  if (!Array.isArray(books)) return [];
  return [...books].sort((a, b) =>
    String(a?.title || '').localeCompare(String(b?.title || ''), undefined, {
      sensitivity: 'base',
    })
  );
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
    meta.textContent = `Showing ${formatNumber(start)}-${formatNumber(end)} of ${formatNumber(state.total)} books`;
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

function toLanguageLabel(language) {
  const value = String(language || '')
    .trim()
    .toLowerCase();
  if (!value) return 'N/A';
  const firstWord = value.split(/\s+/)[0].replace(/[^a-z]/g, '');
  if (!firstWord) return 'N/A';
  return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
}

function setLanguageValue(language) {
  const languageEl = el('detailLanguage');
  if (!languageEl) return;
  clearLoaderState(languageEl, LANGUAGE_LOADER_CLASSES);
  languageEl.textContent = toLanguageLabel(language);
}

function setAiLanguageLoading() {
  const languageEl = el('detailLanguage');
  if (!languageEl) return;
  showCenteredLoader(languageEl, {
    sizeClass: 'h-3 w-3',
    targetClasses: LANGUAGE_LOADER_CLASSES,
  });
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
  setLanguageValue('');
  resetAiDetail();
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

function isActiveDetailRequest(bookId, requestId) {
  return (
    String(state.selectedBookId || '') === String(bookId || '') &&
    requestId === state.detailRequestId
  );
}

function normalizeReviewScore(score) {
  const parsed = Number(score);
  if (!Number.isFinite(parsed)) return 4;
  return Math.max(0, Math.min(5, parsed));
}

function normalizeReviewQuotes(quotes) {
  if (!Array.isArray(quotes)) {
    return [
      '"Placeholder curated review #1"',
      '"Placeholder curated review #2"',
    ];
  }

  const cleaned = quotes
    .map((quote) => String(quote || '').trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((quote) => {
      const trimmed = quote.replace(/^['"]+|['"]+$/g, '');
      return `"${trimmed}"`;
    });

  if (cleaned.length === 2) return cleaned;
  if (cleaned.length === 1) {
    return [cleaned[0], '"Placeholder curated review #2"'];
  }
  return ['"Placeholder curated review #1"', '"Placeholder curated review #2"'];
}

function parseReviewObject(review) {
  if (!review) return null;

  let value = review;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (!value || typeof value !== 'object') return null;

  return {
    score: normalizeReviewScore(value.score),
    quotes: normalizeReviewQuotes(value.quotes),
  };
}

function setAiSummaryLoading() {
  const summaryEl = el('detailAiSummary');
  if (!summaryEl) return;

  showCenteredLoader(summaryEl, {
    sizeClass: 'h-6 w-6',
    targetClasses: AI_SUMMARY_LOADER_CLASSES,
  });
}

function setAiReviewLoading() {
  const reviewsEl = el('detailAiReviews');
  const starsEl = el('detailAiRatingStars');
  const ratingTextEl = el('detailAiRatingText');
  if (reviewsEl) {
    showCenteredLoader(reviewsEl, {
      sizeClass: 'h-6 w-6',
      targetClasses: AI_REVIEWS_LOADER_CLASSES,
      wrapperTag: 'li',
      wrapperClass: 'flex items-center justify-center',
    });
  }

  if (starsEl) {
    showCenteredLoader(starsEl, {
      sizeClass: 'h-4 w-4',
      targetClasses: AI_RATING_LOADER_CLASSES,
    });
  }

  if (ratingTextEl) {
    ratingTextEl.textContent = 'Loading...';
  }
}

function renderAiSummary(summary) {
  const summaryEl = el('detailAiSummary');
  if (!summaryEl) return;

  clearLoaderState(summaryEl, AI_SUMMARY_LOADER_CLASSES);
  summaryEl.textContent =
    String(summary || '').trim() || 'Summary unavailable right now.';
}

function renderAiRating(score) {
  const safeScore = normalizeReviewScore(score);
  const starsEl = el('detailAiRatingStars');
  const ratingTextEl = el('detailAiRatingText');
  const ratingRoot = el('detailAiRating');

  if (starsEl) {
    clearLoaderState(starsEl, AI_RATING_LOADER_CLASSES);

    const fillPercent = Math.round((safeScore / 5) * 1000) / 10;
    starsEl.innerHTML = `
      <span class="relative inline-block leading-none tracking-[0.05em]">
        <span class="text-slate-300">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
        <span class="absolute inset-y-0 left-0 overflow-hidden text-amber-500" style="width:${fillPercent}%;">&#9733;&#9733;&#9733;&#9733;&#9733;</span>
      </span>
    `;
  }

  if (ratingTextEl) {
    ratingTextEl.textContent = `${safeScore.toFixed(1)}/5`;
  }

  if (ratingRoot) {
    ratingRoot.setAttribute(
      'aria-label',
      `Ai rating ${safeScore.toFixed(1)} out of 5`
    );
  }
}

function renderAiReviews(quotes) {
  const reviewsEl = el('detailAiReviews');
  if (!reviewsEl) return;

  clearLoaderState(reviewsEl, AI_REVIEWS_LOADER_CLASSES);

  const safeQuotes = normalizeReviewQuotes(quotes);
  reviewsEl.innerHTML = safeQuotes
    .map(
      (quote) => `
        <li class="border-border bg-surface rounded-xl border px-3.5 py-3">
          <p class="text-text-muted text-sm leading-6">${escapeHtml(quote)}</p>
        </li>
      `
    )
    .join('');
}

function resetAiDetail() {
  renderAiSummary('Placeholder summary generated by AI.');
  renderAiRating(4);
  renderAiReviews([
    '"Placeholder curated review #1"',
    '"Placeholder curated review #2"',
  ]);
}

async function resolveBookSummary(book, bookId, requestId) {
  const existingSummary = String(book?.summary || '').trim();
  if (existingSummary) {
    renderAiSummary(existingSummary);
    return;
  }

  try {
    const generated = await generateBookSummary(bookId);
    if (!isActiveDetailRequest(bookId, requestId)) return;
    renderAiSummary(generated?.summary);
  } catch (error) {
    console.error('Failed to generate AI summary', error);
    if (!isActiveDetailRequest(bookId, requestId)) return;
    renderAiSummary('');
  }
}

async function resolveBookReview(book, bookId, requestId) {
  const existingReview = parseReviewObject(book?.review);
  if (existingReview) {
    renderAiRating(existingReview.score);
    renderAiReviews(existingReview.quotes);
    return;
  }

  try {
    const generated = await generateBookReview(bookId);
    if (!isActiveDetailRequest(bookId, requestId)) return;

    const review = parseReviewObject(generated?.review);
    if (!review) {
      renderAiRating(4);
      renderAiReviews([]);
      return;
    }

    renderAiRating(review.score);
    renderAiReviews(review.quotes);
  } catch (error) {
    console.error('Failed to generate AI review', error);
    if (!isActiveDetailRequest(bookId, requestId)) return;
    renderAiRating(4);
    renderAiReviews([]);
  }
}

async function resolveBookLanguage(bookId, requestId) {
  try {
    const response = await getBookLanguage(bookId);
    if (!isActiveDetailRequest(bookId, requestId)) return;
    setLanguageValue(response?.language);
  } catch (error) {
    console.error('Failed to resolve book language', error);
    if (!isActiveDetailRequest(bookId, requestId)) return;
    setLanguageValue('');
  }
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

async function renderBookDetail(book) {
  if (!book) return;

  const id = String(book.id || '').trim();
  if (!id) return;

  state.selectedBookId = id;
  state.detailRequestId += 1;
  const requestId = state.detailRequestId;

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

  setAiLanguageLoading();
  setAiSummaryLoading();
  setAiReviewLoading();

  try {
    const freshBook = await getBookById(id);
    if (!isActiveDetailRequest(id, requestId)) return;

    const freshTitle =
      String(freshBook?.title || 'Untitled').trim() || 'Untitled';
    const freshAuthor =
      String(freshBook?.author || 'Unknown author').trim() || 'Unknown author';
    const freshGenre = toGenreLabel(freshBook?.genre);
    const freshStatus = String(freshBook?.status || 'available')
      .trim()
      .toLowerCase();
    const freshPublishedYear =
      String(freshBook?.published_year || '').trim() || 'N/A';
    const freshBorrowerName = String(freshBook?.borrower_name || '').trim();
    const freshBorrowerPhone = String(freshBook?.borrower_phone || '').trim();

    if (titleEl) titleEl.textContent = freshTitle;
    if (authorEl) authorEl.textContent = freshAuthor;
    if (genreEl) genreEl.textContent = freshGenre;
    if (publishedYearEl) publishedYearEl.textContent = freshPublishedYear;

    if (statusEl) {
      statusEl.textContent = toStatusLabel(freshStatus);
      statusEl.classList.remove('badge-available', 'badge-borrowed');
      statusEl.classList.add(
        freshStatus === 'borrowed' ? 'badge-borrowed' : 'badge-available'
      );
    }

    syncBorrowerDetails({
      status: freshStatus,
      borrowerName: freshBorrowerName,
      borrowerPhone: freshBorrowerPhone,
    });
    setBookDetailCover(freshBook?.cover_url);

    await Promise.all([
      resolveBookSummary(freshBook, id, requestId),
      resolveBookReview(freshBook, id, requestId),
      resolveBookLanguage(id, requestId),
    ]);
  } catch (error) {
    console.error('Failed to load enriched book detail', error);
    if (!isActiveDetailRequest(id, requestId)) return;
    setLanguageValue('');
    renderAiSummary('');
    renderAiRating(4);
    renderAiReviews([]);
  }
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

  if (state.status && state.status !== OVERDUE_FILTER_VALUE) {
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
      void renderBookDetail(book);
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
    let total = 0;
    let books = [];

    if (state.status === OVERDUE_FILTER_VALUE) {
      let filteredOverdueBooks = await getOverdueBooksByIds();
      filteredOverdueBooks = filterBooksByYearAndGenre(filteredOverdueBooks);
      filteredOverdueBooks = filterBooksBySearch(filteredOverdueBooks);
      filteredOverdueBooks = sortBooksByTitle(filteredOverdueBooks);

      total = filteredOverdueBooks.length;
      state.total = total;
      state.totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
      state.page = total === 0 ? 1 : Math.min(requestedPage, state.totalPages);

      const start = (state.page - 1) * CONFIG.pageSize;
      books = filteredOverdueBooks.slice(start, start + CONFIG.pageSize);
    } else {
      const [countResult, pageBooksResult] = await Promise.all([
        getBooksCount(buildCountQuery()),
        getBooks(buildBooksQuery(requestedPage)),
      ]);

      total = Number(countResult?.count) || 0;
      state.total = total;
      state.totalPages = Math.max(1, Math.ceil(total / CONFIG.pageSize));
      state.page = Math.min(requestedPage, state.totalPages);
      books = Array.isArray(pageBooksResult) ? pageBooksResult : [];

      if (state.page !== requestedPage) {
        const clampedBooks = await getBooks(buildBooksQuery(state.page));
        books = Array.isArray(clampedBooks) ? clampedBooks : [];
      }

      books = filterBooksBySearch(books);
    }

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
      const contextLabel =
        state.status === OVERDUE_FILTER_VALUE
          ? 'overdue results (21+ days past checkout)'
          : 'results';
      setMeta(
        `Showing ${contextLabel} for "${activeSearchQuery}" (${formatNumber(total)} books).`
      );
    } else {
      if (state.status === OVERDUE_FILTER_VALUE) {
        const label = total === 1 ? 'book' : 'books';
        setMeta(
          `Showing ${formatNumber(total)} overdue ${label} (21+ days past checkout).`
        );
      } else {
        setMeta(`Track and manage ${formatNumber(total)} books (A-Z).`);
      }
    }

    setRows(books);

    if (state.selectedBookId) {
      const selected = books.find(
        (book) => String(book?.id || '') === String(state.selectedBookId)
      );

      if (selected) {
        void renderBookDetail(selected);
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
