import { buildQuery, requestJson } from '/src/utils/http.js';

const BOOKS_API = '/api/books';

export function getBooks(filters = {}) {
  return requestJson(`${BOOKS_API}${buildQuery(filters)}`);
}

export function getBooksCount(filters = {}) {
  return requestJson(`${BOOKS_API}/count${buildQuery(filters)}`);
}

export function getBookById(bookId) {
  return requestJson(`${BOOKS_API}/${bookId}`);
}

export function createBook(book) {
  return requestJson(BOOKS_API, {
    method: 'POST',
    body: JSON.stringify(book),
  });
}

export function updateBook(bookId, updates) {
  return requestJson(`${BOOKS_API}/${bookId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

export function deleteBook(bookId) {
  return requestJson(`${BOOKS_API}/${bookId}`, {
    method: 'DELETE',
  });
}

export function checkOutBook(bookId, borrowerName) {
  return requestJson(`${BOOKS_API}/${bookId}/checkout`, {
    method: 'POST',
    body: JSON.stringify({ borrower_name: borrowerName }),
  });
}

export function checkInBook(bookId) {
  return requestJson(`${BOOKS_API}/${bookId}/checkin`, {
    method: 'POST',
  });
}
