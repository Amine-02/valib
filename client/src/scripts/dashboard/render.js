import { getBooks, getBooksCount } from '/src/services/booksService.js';
import {
  getOverdueBooks,
  getTransactions,
} from '/src/services/transactionService.js';
import { formatRelativeTime } from '/src/utils/date.js';
import { findElementByChildText } from '/src/utils/dom.js';
import { clearLoaderState, showCenteredLoader } from '/src/utils/loader.js';
import { formatNumber } from '/src/utils/number.js';
import { escapeHtml } from '/src/utils/string.js';

const USERS_PLACEHOLDER_COUNT = 128;
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
      path: 'm5 13 4 4L19 7',
    };
  }

  if (action === 'checkout') {
    return {
      wrapper: 'bg-warning-bg text-warning-text',
      path: 'M12 3v18m9-9H3',
    };
  }

  return {
    wrapper: 'bg-danger-bg text-danger-text',
    path: 'M12 9v4m0 4h.01',
  };
}

function buildRecentActivityItem(transaction) {
  const action = escapeHtml(transaction?.action || 'unknown');
  const bookId = escapeHtml(transaction?.book_id || '-');
  const borrowerName = escapeHtml(transaction?.borrower_name || 'N/A');
  const notes = escapeHtml(transaction?.notes || 'No notes');
  const createdAt = formatRelativeTime(transaction?.created_at);
  const icon = getActivityIconClasses(transaction?.action);

  return `
    <li class="flex items-start gap-3">
      <span class="mt-0.5 rounded-full p-2 ${icon.wrapper}">
        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="${icon.path}" stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
      </span>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-text">
          action: ${action} | book_id: ${bookId} | borrower_name: ${borrowerName}
        </p>
        <p class="text-xs text-text-soft">created_at: ${createdAt}</p>
        <p class="text-xs text-text-muted">notes: ${notes}</p>
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
      <div class="flex min-w-0 items-center gap-3">
        ${coverMarkup}
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-text">${title}</p>
          <p class="truncate text-xs text-text-muted">${author}</p>
        </div>
      </div>
      <span class="rounded-full bg-primary-100 px-3 py-1 text-xs font-semibold text-primary-700">
        ${borrowText}
      </span>
    </li>
  `;
}

function renderRecentActivity(transactions) {
  const card = findCardByTitle('Recent activity');
  const list = card?.querySelector('ul');
  if (!list) return;

  clearCardListLoading(list);

  const items = transactions.slice(0, 5).map(buildRecentActivityItem);
  if (!items.length) {
    list.innerHTML =
      '<li class="text-sm font-medium text-text-muted">No recent activity.</li>';
    return;
  }

  list.innerHTML = items.join('');
}

function renderPopularBooks(books, transactions) {
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

  const booksById = new Map(
    books
      .filter((book) => book?.id !== null && book?.id !== undefined)
      .map((book) => [book.id, book])
  );

  const rankedBooks = [...checkoutCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([bookId, count]) => ({ book: booksById.get(bookId), count }))
    .filter((entry) => !!entry.book);

  if (!rankedBooks.length) {
    const fallback = books
      .slice(0, 4)
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
      transactions = [],
      overdueBooks = [],
    ] = await Promise.all([
      getBooks(),
      getBooksCount(),
      getTransactions(),
      getOverdueBooks(),
    ]);

    const checkedOutBooks = books.filter((book) => book?.status === 'borrowed');
    const totalBooks = Number(booksCountResult?.count) || 0;

    setStatValue('Total books', totalBooks);
    setStatValue('Checked out books', checkedOutBooks.length);
    setStatValue('Overdue books', overdueBooks.length);
    setStatValue('Number of users', USERS_PLACEHOLDER_COUNT);

    renderRecentActivity(transactions);
    renderPopularBooks(books, transactions);
  } catch (error) {
    console.error('Failed to render dashboard', error);
    setStatValue('Total books', 0);
    setStatValue('Checked out books', 0);
    setStatValue('Overdue books', 0);
    setStatValue('Number of users', USERS_PLACEHOLDER_COUNT);
    renderRecentActivity([]);
    renderPopularBooks([], []);
  }
}
