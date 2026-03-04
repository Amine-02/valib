import { supabaseAdmin } from './supabaseClient.js';

const ALLOWED_ACTIONS = ['checkout', 'checkin'];
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;

function toPositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function applyPagination(query, filters = {}) {
  const hasPage = filters.page !== undefined;
  const hasLimit = filters.limit !== undefined;

  if (!hasPage && !hasLimit) return query;

  const page = toPositiveInt(filters.page) ?? 1;
  const limit = Math.min(
    toPositiveInt(filters.limit) ?? DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE
  );

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return query.range(from, to);
}

function applyTransactionFilters(query, filters = {}) {
  let next = query;

  if (filters.book_id) {
    next = next.eq('book_id', filters.book_id);
  }

  if (filters.action) {
    next = next.eq('action', filters.action);
  }

  return next;
}

export async function getAllBookTransactions(filters = {}) {
  const query = applyPagination(
    applyTransactionFilters(
      supabaseAdmin
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false }),
      filters
    ),
    filters
  );

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

export async function getBookTransactionById(transactionId) {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (error) throw error;
  return data;
}

export async function createBookTransaction(transaction) {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .insert([
      {
        book_id: transaction.book_id,
        action: transaction.action,
        borrower_name: transaction.borrower_name ?? null,
        notes: transaction.notes ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getOverdueBooks(days = 21) {
  const cutoff = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

  const { data: transactions, error } = await supabaseAdmin
    .from('transactions')
    .select('book_id, action, created_at')
    .in('action', ALLOWED_ACTIONS)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!transactions?.length) return [];

  const latestByBook = new Map();

  for (const transaction of transactions) {
    if (!latestByBook.has(transaction.book_id)) {
      latestByBook.set(transaction.book_id, transaction);
    }
  }

  const overdueTransactions = [...latestByBook.values()].filter(
    (transaction) =>
      transaction.action === 'checkout' && transaction.created_at < cutoff
  );

  if (!overdueTransactions.length) return [];

  const overdueByBookId = new Map(
    overdueTransactions.map((transaction) => [
      transaction.book_id,
      transaction.created_at,
    ])
  );

  const overdueBookIds = [...overdueByBookId.keys()];

  const { data: books, error: booksError } = await supabaseAdmin
    .from('books')
    .select('*')
    .in('id', overdueBookIds);

  if (booksError) throw booksError;

  return (books ?? [])
    .map((book) => ({
      ...book,
      overdue_since: overdueByBookId.get(book.id),
    }))
    .sort(
      (a, b) =>
        new Date(a.overdue_since).getTime() -
        new Date(b.overdue_since).getTime()
    );
}
