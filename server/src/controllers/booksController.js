import {
  checkInBook,
  checkOutBook,
  createBook,
  deleteBook,
  getAllBooks,
  getBookById,
  updateBook,
} from '../db/booksQueries.js';

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
    const book = await updateBook(req.params.id, req.body);
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
  if (!borrowerName) {
    return res.status(400).json({ error: 'borrower_name is required' });
  }

  try {
    const book = await checkOutBook(req.params.id, borrowerName);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}

export async function checkInBookHandler(req, res) {
  try {
    const book = await checkInBook(req.params.id);
    res.json(book);
  } catch (error) {
    handleError(res, error);
  }
}
