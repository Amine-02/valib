import { buildQuery, requestJson } from '/src/utils/http.js';

const TRANSACTIONS_API = '/api/transactions';

export function getTransactions(filters = {}) {
  return requestJson(`${TRANSACTIONS_API}${buildQuery(filters)}`);
}

export function getTransactionsCount(filters = {}) {
  return requestJson(`${TRANSACTIONS_API}/count${buildQuery(filters)}`);
}

export function getTransactionById(transactionId) {
  return requestJson(`${TRANSACTIONS_API}/${transactionId}`);
}

export function createTransaction(transaction) {
  return requestJson(TRANSACTIONS_API, {
    method: 'POST',
    body: JSON.stringify(transaction),
  });
}

export function getOverdueBooks() {
  return requestJson(`${TRANSACTIONS_API}/overdue`);
}
