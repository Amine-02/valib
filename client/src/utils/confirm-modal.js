import { getById } from '/src/utils/dom.js';

const IDS = {
  overlay: 'confirm-modal-overlay',
  dialog: 'confirm-modal-dialog',
  title: 'confirm-modal-title',
  message: 'confirm-modal-message',
  cancel: 'confirm-modal-cancel',
  confirm: 'confirm-modal-confirm',
  close: 'confirm-modal-close',
};

const state = {
  initialized: false,
  resolver: null,
  previousBodyOverflow: '',
};

function el(key) {
  return getById(IDS[key]);
}

function resolveAndClose(confirmed) {
  const overlay = el('overlay');
  if (!overlay) return;

  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = state.previousBodyOverflow;

  if (typeof state.resolver === 'function') {
    state.resolver(Boolean(confirmed));
  }
  state.resolver = null;
}

function setConfirmTone(tone = 'danger') {
  const confirmButton = el('confirm');
  if (!confirmButton) return;

  confirmButton.classList.remove('btn-danger', 'btn-primary');
  confirmButton.classList.add(
    tone === 'primary' ? 'btn-primary' : 'btn-danger'
  );
}

function ensureConfirmModalDom() {
  if (el('overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = IDS.overlay;
  overlay.className =
    'fixed inset-0 z-[70] hidden items-center justify-center bg-slate-900/25 p-4 backdrop-blur-[2px]';
  overlay.setAttribute('aria-hidden', 'true');

  overlay.innerHTML = `
    <div
      id="${IDS.dialog}"
      role="dialog"
      aria-modal="true"
      class="border-border bg-surface w-full max-w-md rounded-2xl border shadow-2xl">
      <div class="border-border flex items-center justify-between border-b px-5 py-4">
        <h2 id="${IDS.title}" class="text-text text-lg font-semibold">Confirm action</h2>
        <button
          id="${IDS.close}"
          type="button"
          class="text-text-soft hover:text-text rounded-md p-1"
          aria-label="Close confirmation modal">
          <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6 6 18" stroke-linecap="round" stroke-linejoin="round"></path>
            <path d="m6 6 12 12" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        </button>
      </div>

      <div class="space-y-5 px-5 py-4">
        <p id="${IDS.message}" class="text-text-muted text-center whitespace-pre-line text-sm leading-6"></p>

        <div class="flex justify-end gap-2">
          <button id="${IDS.cancel}" type="button" class="btn-secondary px-4 py-2 text-sm">Cancel</button>
          <button id="${IDS.confirm}" type="button" class="btn-danger px-4 py-2 text-sm">Delete</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
}

function bindConfirmModalEvents() {
  if (state.initialized) return;

  const overlay = el('overlay');
  const closeButton = el('close');
  const cancelButton = el('cancel');
  const confirmButton = el('confirm');

  closeButton?.addEventListener('click', () => resolveAndClose(false));
  cancelButton?.addEventListener('click', () => resolveAndClose(false));
  confirmButton?.addEventListener('click', () => resolveAndClose(true));

  overlay?.addEventListener('click', (event) => {
    if (event.target !== overlay) return;
    resolveAndClose(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const open = overlay && !overlay.classList.contains('hidden');
    if (!open) return;
    resolveAndClose(false);
  });

  state.initialized = true;
}

function ensureConfirmModal() {
  ensureConfirmModalDom();
  bindConfirmModalEvents();
}

export function confirmAction({
  title = 'Confirm action',
  message = 'Are you sure you want to continue?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  tone = 'danger',
} = {}) {
  ensureConfirmModal();

  const overlay = el('overlay');
  const titleEl = el('title');
  const messageEl = el('message');
  const confirmButton = el('confirm');
  const cancelButton = el('cancel');

  if (!overlay || !titleEl || !messageEl || !confirmButton || !cancelButton) {
    return Promise.resolve(false);
  }

  titleEl.textContent = String(title);
  messageEl.textContent = String(message);
  confirmButton.textContent = String(confirmText);
  cancelButton.textContent = String(cancelText);
  setConfirmTone(tone);

  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  overlay.setAttribute('aria-hidden', 'false');

  state.previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  requestAnimationFrame(() => {
    confirmButton.focus();
  });

  return new Promise((resolve) => {
    state.resolver = resolve;
  });
}

export function confirmDelete({
  title = 'Delete item',
  message = 'This action cannot be undone.',
  confirmText = 'Delete',
  cancelText = 'Cancel',
} = {}) {
  return confirmAction({
    title,
    message,
    confirmText,
    cancelText,
    tone: 'danger',
  });
}
