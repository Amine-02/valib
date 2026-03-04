import {
  checkInBook,
  checkOutBook,
  createBook,
  deleteBook,
  getAllBooks,
  getBooksCount,
  getBookById,
  updateBook,
} from '../db/booksQueries.js';
import { createBookTransaction } from '../db/transactionsQueries.js';

const BORROWED_STATUS = 'borrowed';
const AVAILABLE_STATUS = 'available';

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

async function logBookStatusTransaction(book, action, { fromBook } = {}) {
  if (!book?.id) return;

  await createBookTransaction({
    book_id: book.id,
    action,
    borrower_name: fromBook?.borrower_name ?? book?.borrower_name ?? null,
    borrower_phone: fromBook?.borrower_phone ?? book?.borrower_phone ?? null,
  });
}

async function logStatusTransitionTransaction(previousBook, nextBook) {
  const previousStatus = normalizeStatus(previousBook?.status);
  const nextStatus = normalizeStatus(nextBook?.status);

  if (previousStatus !== BORROWED_STATUS && nextStatus === BORROWED_STATUS) {
    await logBookStatusTransaction(nextBook, 'checkout');
    return;
  }

  if (previousStatus === BORROWED_STATUS && nextStatus === AVAILABLE_STATUS) {
    await logBookStatusTransaction(nextBook, 'checkin', {
      fromBook: previousBook,
    });
  }
}

function handleError(res, error) {
  if (error?.code === 'PGRST116') {
    return res.status(404).json({ error: 'Book not found' });
  }

  return res.status(500).json({ error: error?.message || 'Server error' });
}

export async function getBooksHandler(req, res) {
  try {
    const books = await getAllBooks(req.query);
    res.json(books);
  } catch (error) {
    handleError(res, error);
  }
}

export async function getBooksCountHandler(req, res) {
  try {
    const count = await getBooksCount(req.query);
    res.json({ count });
  } catch (error) {
    handleError(res, error);
  }
}

export async function getBookByIdHandler(req, res) {
  try {
    const book = await getBookById(req.params.id);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}

export async function createBookHandler(req, res) {
  const { title, author } = req.body ?? {};
  if (!title || !author) {
    return res.status(400).json({ error: 'title and author are required' });
  }

  try {
    const book = await createBook(req.body);
    if (normalizeStatus(book?.status) === BORROWED_STATUS) {
      await logBookStatusTransaction(book, 'checkout');
    }
    res.status(201).json(book);
  } catch (error) {
    handleError(res, error);
  }
}

export async function updateBookHandler(req, res) {
  if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Update payload is required' });
  }

  try {
    const previousBook = await getBookById(req.params.id);
    const book = await updateBook(req.params.id, req.body);
    await logStatusTransitionTransaction(previousBook, book);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}

export async function deleteBookHandler(req, res) {
  try {
    const book = await deleteBook(req.params.id);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}

export async function checkOutBookHandler(req, res) {
  const borrowerName = req.body?.borrower_name;
  const borrowerPhone = req.body?.borrower_phone;
  if (!borrowerName) {
    return res.status(400).json({ error: 'borrower_name is required' });
  }

  try {
    const previousBook = await getBookById(req.params.id);
    const book = await checkOutBook(req.params.id, borrowerName, borrowerPhone);
    await logStatusTransitionTransaction(previousBook, book);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}

export async function checkInBookHandler(req, res) {
  try {
    const previousBook = await getBookById(req.params.id);
    const book = await checkInBook(req.params.id);
    await logStatusTransitionTransaction(previousBook, book);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}
