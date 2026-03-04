import dashboardTemplate from '/src/components/dashboard.html?raw';
import booksTemplate from '/src/components/books.html?raw';
import transactionsTemplate from '/src/components/transactions.html?raw';

import { setupDashboard } from '/src/scripts/dashboard/index.js';
import { setupBooks } from '/src/scripts/books/index.js';
import { setupTransactions } from '/src/scripts/transactions/index.js';

export const ROUTE_CONFIG = {
  dashboard: {
    viewId: 'view-dashboard',
    template: dashboardTemplate,
    loader: setupDashboard,
  },

  books: {
    viewId: 'view-books',
    template: booksTemplate,
    loader: setupBooks,
  },

  activties: {
    viewId: 'view-transactions',
    template: transactionsTemplate,
    loader: setupTransactions,
  },

  404: {
    viewId: 'view-404',
    template: `
      <div class="flex min-h-[60vh] items-center justify-center">
        <div class="text-center">
          <h1 class="text-4xl font-bold text-slate-900">404</h1>
          <p class="mt-2 text-slate-600">Page not found.</p>
        </div>
      </div>
    `,
    loader: null,
  },
};
