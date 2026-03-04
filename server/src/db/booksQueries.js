import { supabaseAdmin } from './supabaseClient.js';
import {
  applyPagination,
  normalizeAscendingRange,
  toIntInRange,
} from '../utils/query.js';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 500;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_DIRECTION = 'desc';
const MIN_PUBLISHED_YEAR = 1500;
const MAX_PUBLISHED_YEAR = 2026;
const SORTABLE_BOOK_FIELDS = new Set([
  'id',
  'title',
  'author',
  'genre',
  'status',
  'created_at',
  'published_year',
]);

function applyBookSorting(query, filters = {}) {
  const rawSort = String(filters.sort || DEFAULT_SORT_FIELD)
    .trim()
    .toLowerCase();
  const sort = SORTABLE_BOOK_FIELDS.has(rawSort) ? rawSort : DEFAULT_SORT_FIELD;

  const rawDirection = String(
    filters.direction || filters.order || DEFAULT_SORT_DIRECTION
  )
    .trim()
    .toLowerCase();
  const ascending = rawDirection === 'asc';

  return query.order(sort, { ascending });
}

function applyBookFilters(query, filters = {}) {
  let next = query;

  if (filters.status) {
    next = next.eq('status', filters.status);
  }

  if (filters.genre) {
    next = next.ilike('genre', `%${filters.genre}%`);
  }

  const publishedYear = toIntInRange(filters.published_year, {
    min: MIN_PUBLISHED_YEAR,
    max: MAX_PUBLISHED_YEAR,
  });
  if (publishedYear !== null) {
    next = next.eq('published_year', publishedYear);
  }

  let publishedYearFrom = toIntInRange(filters.published_year_from, {
    min: MIN_PUBLISHED_YEAR,
    max: MAX_PUBLISHED_YEAR,
  });
  let publishedYearTo = toIntInRange(filters.published_year_to, {
    min: MIN_PUBLISHED_YEAR,
    max: MAX_PUBLISHED_YEAR,
  });
  [publishedYearFrom, publishedYearTo] = normalizeAscendingRange(
    publishedYearFrom,
    publishedYearTo
  );

  if (publishedYearFrom !== null) {
    next = next.gte('published_year', publishedYearFrom);
  }

  if (publishedYearTo !== null) {
    next = next.lte('published_year', publishedYearTo);
  }

  if (filters.search) {
    const safe = filters.search.trim();
    next = next.or(
      `title.ilike.%${safe}%,author.ilike.%${safe}%,genre.ilike.%${safe}%,summary.ilike.%${safe}%`
    );
  }

  return next;
}

export async function getAllBooks(filters = {}) {
  const query = applyPagination(
    applyBookSorting(
      applyBookFilters(supabaseAdmin.from('books').select('*'), filters),
      filters
    ),
    filters,
    { defaultPageSize: DEFAULT_PAGE_SIZE, maxPageSize: MAX_PAGE_SIZE }
  );

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

export async function getBooksCount(filters = {}) {
  const query = applyBookFilters(
    supabaseAdmin.from('books').select('*', { count: 'exact', head: true }),
    filters
  );

  const { count, error } = await query;
  if (error) throw error;

  return count ?? 0;
}

export async function getBookById(bookId) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .select('*')
    .eq('id', bookId)
    .single();

  if (error) throw error;
  return data;
}

export async function createBook(book) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .insert([
      {
        title: book.title,
        author: book.author,
        genre: book.genre ?? null,
        published_year: book.published_year ?? null,
        summary: book.summary ?? null,
        status: book.status ?? 'available',
        borrower_name: book.borrower_name ?? null,
        borrowed_at: book.borrowed_at ?? null,
        cover_url: book.cover_url ?? null,
      },
    ])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBook(bookId, updates) {
  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from('books')
    .update(payload)
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteBook(bookId) {
  const { data, error } = await supabaseAdmin
    .from('books')
    .delete()
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function checkOutBook(bookId, borrowerName) {
  const borrowedAt = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('books')
    .update({
      status: 'borrowed',
      borrower_name: borrowerName,
      borrowed_at: borrowedAt,
      updated_at: borrowedAt,
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function checkInBook(bookId) {
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('books')
    .update({
      status: 'available',
      borrower_name: null,
      borrowed_at: null,
      updated_at: now,
    })
    .eq('id', bookId)
    .select()
    .single();

  if (error) throw error;
  return data;
}
