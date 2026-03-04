import {
  createBookTransaction,
  getAllBookTransactions,
  getBookTransactionsCount,
  getBookTransactionById,
  getOverdueBooks,
} from '../db/transactionsQueries.js';

const ALLOWED_ACTIONS = ['checkout', 'checkin'];

function handleError(res, error) {
  if (error?.code === 'PGRST116') {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  return res.status(500).json({ error: error?.message || 'Server error' });
}

export async function getTransactionsHandler(req, res) {
  try {
    const transactions = await getAllBookTransactions(req.query);
    res.json(transactions);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getTransactionsCountHandler(req, res) {
  try {
    const count = await getBookTransactionsCount(req.query);
    res.json({ count });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getTransactionByIdHandler(req, res) {
  try {
    const transaction = await getBookTransactionById(req.params.id);
    res.json(transaction);
  } catch (error) {
    handleError(res, error);
  }
}

export async function createTransactionHandler(req, res) {
  const { book_id: bookId, action } = req.body ?? {};
  if (!bookId || !action) {
    return res.status(400).json({ error: 'book_id and action are required' });
  }
  if (!ALLOWED_ACTIONS.includes(action)) {
    return res
      .status(400)
      .json({ error: 'action must be checkout or checkin' });
  }

  try {
    const transaction = await createBookTransaction(req.body);
    res.status(201).json(transaction);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getOverdueBooksHandler(req, res) {
  try {
    const books = await getOverdueBooks(21);
    res.json(books);
  } catch (error) {
    handleError(res, error);
  }
}
