import { supabaseAdmin } from './supabaseClient.js';

export async function getAllBooks(filters = {}) {
  let query = supabaseAdmin
    .from('books')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }

  if (filters.genre) {
    query = query.ilike('genre', `%${filters.genre}%`);
  }

  if (filters.search) {
    const safe = filters.search.trim();
    query = query.or(
      `title.ilike.%${safe}%,author.ilike.%${safe}%,genre.ilike.%${safe}%,summary.ilike.%${safe}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;

  return data;
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
