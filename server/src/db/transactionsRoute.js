import { supabaseAdmin } from './supabaseClient.js';

export async function getAllBookTransactions(filters = {}) {
  let query = supabaseAdmin
    .from('book_transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.book_id) {
    query = query.eq('book_id', filters.book_id);
  }

  if (filters.action) {
    query = query.eq('action', filters.action);
  }

  const { data, error } = await query;
  if (error) throw error;

  return data;
}

export async function getBookTransactionById(transactionId) {
  const { data, error } = await supabaseAdmin
    .from('book_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (error) throw error;
  return data;
}

export async function createBookTransaction(transaction) {
  const { data, error } = await supabaseAdmin
    .from('book_transactions')
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
