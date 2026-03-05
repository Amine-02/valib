import {
  getBookById,
  getBooks,
  getBooksCount,
} from '/src/services/booksService.js';
import { getProfilesCount } from '/src/services/profilesService.js';
import {
  getOverdueBooks,
  getTransactions,
} from '/src/services/transactionsService.js';
import { formatRelativeTime } from '/src/utils/date.js';
import { findElementByChildText } from '/src/utils/dom.js';
import { clearLoaderState, showCenteredLoader } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { escapeHtml } from '/src/utils/string.js';

const RECENT_ACTIVITY_LIMIT = 10;
const POPULAR_BOOKS_LIMIT = 10;
const STAT_LOADER_CLASSES = [
  'w-full',
  'min-h-12',
  'flex',
  'items-center',
  'justify-center',
];
const LIST_LOADER_CLASSES = [
  'w-full',
  'min-h-56',
  'flex',
  'items-center',
  'justify-center',
];

function findCardByTitle(title) {
  return findElementByChildText('article.card', 'h2', title);
}

function findStatCardByLabel(label) {
  return findElementByChildText('article.stat-card', 'p.text-sm', label);
}

function setStatLoading(label) {
  const card = findStatCardByLabel(label);
  const valueEl = card?.querySelector('p.text-4xl');
  if (!valueEl) return;

  showCenteredLoader(valueEl, {
    targetClasses: STAT_LOADER_CLASSES,
  });
}

function setCardListLoading(title) {
  const card = findCardByTitle(title);
  const list = card?.querySelector('ul');
  if (!list) return;

  showCenteredLoader(list, {
    sizeClass: 'h-7 w-7',
    targetClasses: LIST_LOADER_CLASSES,
    wrapperTag: 'li',
    wrapperClass: 'flex items-center justify-center',
  });
}

function clearCardListLoading(list) {
  clearLoaderState(list, LIST_LOADER_CLASSES);
}

function showDashboardLoadingState() {
  setStatLoading('Total books');
  setStatLoading('Checked out books');
  setStatLoading('Overdue books');
  setStatLoading('Number of users');
  setCardListLoading('Recent activity');
  setCardListLoading('Popular books');
}

function setStatValue(label, value) {
  const card = findStatCardByLabel(label);
  const valueEl = card?.querySelector('p.text-4xl');
  if (!valueEl) return;

  clearLoaderState(valueEl, STAT_LOADER_CLASSES);
  valueEl.textContent = formatNumber(value);
}

function getActivityIconClasses(action) {
  if (action === 'checkin') {
    return {
      wrapper: 'bg-success-bg text-success-text',
      badge: 'bg-success-bg text-success-text',
      label: 'Checked in',
      path: 'm5 13 4 4L19 7',
    };
  }

  if (action === 'checkout') {
    return {
      wrapper: 'bg-warning-bg text-warning-text',
      badge: 'bg-warning-bg text-warning-text',
      label: 'Checked out',
      path: 'M12 3v18m9-9H3',
    };
  }

  return {
    wrapper: 'bg-danger-bg text-danger-text',
    badge: 'bg-danger-bg text-danger-text',
    label: 'Updated',
    path: 'M12 9v4m0 4h.01',
  };
}

function formatPhone(value) {
  const digits = String(value ?? '')
    .replace(/\D+/g, '')
    .slice(0, 10);
  if (!digits) return 'N/A';
  if (digits.length < 4) return digits;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function buildRecentActivityItem(transaction, book) {
  const borrowerName = escapeHtml(transaction?.borrower_name || 'N/A');
  const borrowerPhone = escapeHtml(formatPhone(transaction?.borrower_phone));
  const createdAt = formatRelativeTime(transaction?.created_at);
  const bookTitle = escapeHtml(book?.title || 'Unknown book');
  const bookAuthor = escapeHtml(book?.author || '');
  const icon = getActivityIconClasses(transaction?.action);

  return `
    <li class="rounded-2xl border border-primary-100 bg-white/40 p-3 sm:p-4">
      <div class="flex items-center gap-3">
      <span class="rounded-full p-2 ${icon.wrapper}">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="${icon.path}" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-2">
          <span class="rounded-full px-2.5 py-1 text-xs font-semibold ${icon.badge}">${icon.label}</span>
          <p class="text-xs text-text-soft">${escapeHtml(createdAt)}</p>
        </div>
        <p class="mt-2 text-sm font-semibold text-text">
          ${icon.label} <span class="text-primary-700">${bookTitle}</span>
        </p>
        ${
          bookAuthor
            ? `<p class="text-xs text-text-muted">by ${bookAuthor}</p>`
            : ''
        }
        <div class="mt-2 flex flex-wrap gap-2">
          <span class="rounded-full bg-primary-100 px-2.5 py-1 text-xs font-medium text-primary-700">
            Borrower: ${borrowerName}
          </span>
          <span class="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-text-soft ring-1 ring-primary-100">
            Phone: ${borrowerPhone}
          </span>
        </div>
      </div>
      </div>
    </li>
  `;
}

function buildPopularBookItem(book, count) {
  const title = escapeHtml(book?.title || `Book #${book?.id ?? '-'}`);
  const author = escapeHtml(book?.author || 'Unknown author');
  const coverUrl = escapeHtml(book?.cover_url || '');
  const borrowText = `${formatNumber(count)} borrow${count > 1 ? 's' : ''}`;
  const coverMarkup = coverUrl
    ? `<img src="${coverUrl}" alt="${title} cover" class="h-12 w-9 rounded object-cover" loading="lazy" onerror="this.outerHTML='<div class=&quot;h-12 w-9 rounded bg-primary-100&quot;></div>'" />`
    : '<div class="h-12 w-9 rounded bg-primary-100"></div>';

  return `
    <li class="flex items-center justify-between gap-3">
      <div class="flex min-w-0 flex-1 items-center gap-3">
        ${coverMarkup}
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-text">${title}</p>
          <p class="truncate text-xs text-text-muted">${author}</p>
        </div>
      </div>
      <span class="min-w-max shrink-0 whitespace-nowrap rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
        ${borrowText}
      </span>
    </li>
  `;
}

async function buildRecentActivityItems(transactions) {
  const recent = Array.isArray(transactions)
    ? transactions.slice(0, RECENT_ACTIVITY_LIMIT)
    : [];
  if (!recent.length) return [];

  const uniqueBookIds = [
    ...new Set(
      recent
        .map((transaction) => String(transaction?.book_id || '').trim())
        .filter(Boolean)
    ),
  ];

  const entries = await Promise.all(
    uniqueBookIds.map(async (bookId) => {
      try {
        const book = await getBookById(bookId);
        return [bookId, book];
      } catch {
        return [bookId, null];
      }
    })
  );

  const booksById = new Map(entries);

  return recent.map((transaction) => ({
    transaction,
    book: booksById.get(String(transaction?.book_id || '').trim()) || null,
  }));
}

function renderRecentActivity(activityItems) {
  const card = findCardByTitle('Recent activity');
  const list = card?.querySelector('ul');
  if (!list) return;

  clearCardListLoading(list);

  const items = activityItems.map(({ transaction, book }) =>
    buildRecentActivityItem(transaction, book)
  );
  if (!items.length) {
    list.innerHTML =
      '<li class="text-sm font-medium text-text-muted">No recent activity.</li>';
    return;
  }

  list.innerHTML = items.join('');
}

async function resolveBooksByIds(bookIds, seededBooks = []) {
  const booksById = new Map(
    seededBooks
      .filter((book) => book?.id !== null && book?.id !== undefined)
      .map((book) => [String(book.id), book])
  );

  const missingIds = bookIds.filter((bookId) => !booksById.has(String(bookId)));
  if (!missingIds.length) return booksById;

  const entries = await Promise.all(
    missingIds.map(async (bookId) => {
      try {
        const book = await getBookById(bookId);
        return [String(bookId), book];
      } catch {
        return [String(bookId), null];
      }
    })
  );

  entries.forEach(([bookId, book]) => {
    if (!book) return;
    booksById.set(String(bookId), book);
  });

  return booksById;
}

async function renderPopularBooks(books, transactions) {
  const card = findCardByTitle('Popular books');
  const list = card?.querySelector('ul');
  if (!list) return;

  clearCardListLoading(list);

  const checkoutCounts = new Map();

  transactions.forEach((transaction) => {
    if (transaction?.action !== 'checkout') return;
    if (!transaction?.book_id) return;

    const current = checkoutCounts.get(transaction.book_id) || 0;
    checkoutCounts.set(transaction.book_id, current + 1);
  });

  const rankedBookIds = [...checkoutCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, POPULAR_BOOKS_LIMIT)
    .map(([bookId]) => String(bookId));

  const booksById = await resolveBooksByIds(rankedBookIds, books);

  const rankedBooks = [...checkoutCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, POPULAR_BOOKS_LIMIT)
    .map(([bookId, count]) => ({ book: booksById.get(String(bookId)), count }))
    .filter((entry) => !!entry.book);

  if (!rankedBooks.length) {
    const fallback = books
      .slice(0, POPULAR_BOOKS_LIMIT)
      .map((book) => ({ book, count: 0 }))
      .filter((entry) => !!entry.book);

    list.innerHTML = fallback.length
      ? fallback
          .map((entry) => buildPopularBookItem(entry.book, entry.count))
          .join('')
      : '<li class="text-sm font-medium text-text-muted">No popular books yet.</li>';
    return;
  }

  list.innerHTML = rankedBooks
    .map((entry) => buildPopularBookItem(entry.book, entry.count))
    .join('');
}

export async function renderDashboard() {
  showDashboardLoadingState();

  try {
    const [
      books = [],
      booksCountResult = {},
      checkedOutCountResult = {},
      transactions = [],
      overdueBooks = [],
      usersCountResult = {},
    ] = await Promise.all([
      getBooks(),
      getBooksCount(),
      getBooksCount({ status: 'borrowed' }),
      getTransactions(),
      getOverdueBooks(),
      getProfilesCount(),
    ]);

    const totalBooks = Number(booksCountResult?.count) || 0;
    const checkedOutBooksCount = Number(checkedOutCountResult?.count) || 0;
    const usersCount = Number(usersCountResult?.count) || 0;

    setStatValue('Total books', totalBooks);
    setStatValue('Checked out books', checkedOutBooksCount);
    setStatValue('Overdue books', overdueBooks.length);
    setStatValue('Number of users', usersCount);

    const recentActivityItems = await buildRecentActivityItems(transactions);

    renderRecentActivity(recentActivityItems);
    await renderPopularBooks(books, transactions);
  } catch (error) {
    console.error('Failed to render dashboard', error);
    setStatValue('Total books', 0);
    setStatValue('Checked out books', 0);
    setStatValue('Overdue books', 0);
    setStatValue('Number of users', 0);
    renderRecentActivity([]);
    renderPopularBooks([], []);
  }
}
