import dashboardTemplate from '/src/components/dashboard.html?raw';
import booksTemplate from '/src/components/books.html?raw';
import activitiesTemplate from '/src/components/activities.html?raw';
import signInTemplate from '/src/components/sign-in.html?raw';
import signUpTemplate from '/src/components/sign-up.html?raw';

import { setupDashboard } from '/src/scripts/dashboard/index.js';
import { setupBooks } from '/src/scripts/books/index.js';
import { setupActivities } from '/src/scripts/activities/index.js';
import { setupSignIn, setupSignUp } from '/src/scripts/auth/index.js';

export const ROUTE_CONFIG = {
  dashboard: {
    viewId: 'view-dashboard',
    template: dashboardTemplate,
    loader: setupDashboard,
    layout: 'app',
  },

  books: {
    viewId: 'view-books',
    template: booksTemplate,
    loader: setupBooks,
    layout: 'app',
  },

  activties: {
    viewId: 'view-activities',
    template: activitiesTemplate,
    loader: setupActivities,
    layout: 'app',
  },

  'sign-in': {
    viewId: 'view-sign-in',
    template: signInTemplate,
    loader: setupSignIn,
    layout: 'auth',
  },

  'sign-up': {
    viewId: 'view-sign-up',
    template: signUpTemplate,
    loader: setupSignUp,
    layout: 'auth',
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
    layout: 'app',
  },
};
