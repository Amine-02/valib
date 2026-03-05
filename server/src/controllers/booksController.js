import {
  callAIForLanguage,
  callAIForReview,
  callAIForSummary,
  checkInBook,
  checkOutBook,
  createBook,
  deleteBook,
  getAllBooks,
  getBooksCount,
  getBookById,
  updateBookLanguage,
  updateBookReview,
  updateBookSummary,
  updateBook,
} from '../db/booksQueries.js';
import { createBookTransaction } from '../db/transactionsQueries.js';

const BORROWED_STATUS = 'borrowed';
const AVAILABLE_STATUS = 'available';
const VIEWER_ROLE = 'viewer';

function normalizeStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hideBorrowerFields(book) {
  if (!book || typeof book !== 'object') return book;

  const safeBook = { ...book };
  delete safeBook.borrower_name;
  delete safeBook.borrower_phone;
  return safeBook;
}

function sanitizeBookForRole(book, role) {
  if (String(role || '') !== VIEWER_ROLE) return book;
  return hideBorrowerFields(book);
}

function sanitizeBooksForRole(books, role) {
  if (!Array.isArray(books)) return books;
  if (String(role || '') !== VIEWER_ROLE) return books;
  return books.map((book) => hideBorrowerFields(book));
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
    res.json(sanitizeBooksForRole(books, req.userRole));
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
    res.json(sanitizeBookForRole(book, req.userRole));
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

export async function generateBookSummaryHandler(req, res) {
  try {
    const book = await getBookById(req.params.id);
    const summary = await callAIForSummary({
      title: book?.title,
      author: book?.author,
      genre: book?.genre,
      publishedYear: book?.published_year,
    });

    const updated = await updateBookSummary(req.params.id, summary);
    res.json({
      id: updated.id,
      summary: updated.summary,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function generateBookReviewHandler(req, res) {
  try {
    const book = await getBookById(req.params.id);
    const review = await callAIForReview({
      title: book?.title,
      author: book?.author,
      genre: book?.genre,
      publishedYear: book?.published_year,
    });

    const updated = await updateBookReview(req.params.id, review);
    res.json({
      id: updated.id,
      review: updated.review,
    });
  } catch (error) {
    handleError(res, error);
  }
}

export async function generateBookLanguageHandler(req, res) {
  try {
    const book = await getBookById(req.params.id);
    const existingLanguage = String(book?.language || '').trim();
    if (existingLanguage) {
      return res.json({
        id: book.id,
        language: existingLanguage,
      });
    }

    const language = await callAIForLanguage({
      title: book?.title,
      author: book?.author,
      publishedYear: book?.published_year,
    });

    const updated = await updateBookLanguage(req.params.id, language);
    res.json({
      id: updated.id,
      language: updated.language,
    });
  } catch (error) {
    handleError(res, error);
  }
}
