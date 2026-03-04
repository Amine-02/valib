import {
  createBook,
  deleteBook,
  getBookById,
  updateBook,
} from '/src/services/booksService.js';
import { confirmDelete } from '/src/utils/confirm-modal.js';
import {
  isDropdownOpen,
  setDropdownOpen,
  syncDropdownOptions,
} from '/src/utils/dropdown.js';
import { getById, queryAll } from '/src/utils/dom.js';
import { normalizeLowerTrim } from '/src/utils/filter.js';
import { clearLoaderState, showCenteredLoader } from '/src/utils/loader.js';
import { toTitleCase } from '/src/utils/string.js';

const IDS = {
  tableBody: 'books-table-body',
  overlay: 'books-edit-modal-overlay',
  modal: 'books-edit-modal',
  close: 'books-edit-close',
  cancel: 'books-edit-cancel',
  form: 'books-edit-form',
  modalTitle: 'books-edit-modal-title',
  formContent: 'books-edit-form-content',
  formLoader: 'books-edit-form-loader',
  title: 'books-edit-title',
  author: 'books-edit-author',
  publishedYear: 'books-edit-published-year',
  borrowerFields: 'books-edit-borrower-fields',
  borrowerName: 'books-edit-borrower-name',
  borrowerPhone: 'books-edit-borrower-phone',
  coverFile: 'books-edit-cover-file',
  coverFileName: 'books-edit-cover-file-name',
  coverPreview: 'books-edit-cover-preview',
  coverFallback: 'books-edit-cover-fallback',
  feedback: 'books-edit-feedback',
  submit: 'books-edit-submit',
};

const YEAR_MIN = 1500;
const YEAR_MAX = 2026;

const FORM_LOADER_CLASSES = [
  'flex',
  'items-center',
  'justify-center',
  'min-h-72',
];
const EDIT_BUTTON_SELECTOR = 'button[data-action="edit"][data-book-id]';
const DELETE_BUTTON_SELECTOR = 'button[data-action="delete"][data-book-id]';

const DROPDOWNS = {
  genre: {
    inputId: 'books-edit-genre',
    rootId: 'books-edit-genre-root',
    triggerId: 'books-edit-genre-trigger',
    labelId: 'books-edit-genre-label',
    chevronId: 'books-edit-genre-chevron',
    menuId: 'books-edit-genre-menu',
    optionSelector: '[data-modal-genre-option]',
    optionDatasetKey: 'modalGenreOption',
    fallback: '',
    labelFor: (value) => {
      if (!value) return 'Select genre';
      return toTitleCase(String(value).replaceAll('_', ' '));
    },
  },
  status: {
    inputId: 'books-edit-status',
    rootId: 'books-edit-status-root',
    triggerId: 'books-edit-status-trigger',
    labelId: 'books-edit-status-label',
    chevronId: 'books-edit-status-chevron',
    menuId: 'books-edit-status-menu',
    optionSelector: '[data-modal-status-option]',
    optionDatasetKey: 'modalStatusOption',
    fallback: 'available',
    labelFor: (value) => (value === 'borrowed' ? 'Borrowed' : 'Available'),
  },
};

const state = {
  bound: false,
  mode: 'edit',
  activeBookId: null,
  activeBorrowedAt: '',
  coverUrl: '',
  uploadedCoverDataUrl: '',
  onUpdated: null,
};

function el(key) {
  return getById(IDS[key]);
}

function normalizeValue(value, fallback = '') {
  return normalizeLowerTrim(value) || fallback;
}

function normalizePublishedYearInput(value, { required = false } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) {
    if (required) {
      throw new Error('Published year is required.');
    }
    return null;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < YEAR_MIN || parsed > YEAR_MAX) {
    throw new Error(
      `Published year must be between ${YEAR_MIN} and ${YEAR_MAX}.`
    );
  }

  return parsed;
}

function getPhoneDigits(value) {
  return String(value ?? '')
    .replace(/\D+/g, '')
    .slice(0, 10);
}

function formatPhoneNumber(value) {
  const digits = getPhoneDigits(value);
  if (!digits) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

function bindOnce(element, eventName, handler) {
  if (!element || element.dataset.bound) return;
  element.addEventListener(eventName, handler);
  element.dataset.bound = 'true';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read selected image.'));
    reader.readAsDataURL(file);
  });
}

function getDropdownConfig(name) {
  return DROPDOWNS[name] || null;
}

function getDropdownElements(name) {
  const config = getDropdownConfig(name);
  if (!config) return null;

  return {
    config,
    input: getById(config.inputId),
    root: getById(config.rootId),
    trigger: getById(config.triggerId),
    label: getById(config.labelId),
    chevron: getById(config.chevronId),
    menu: getById(config.menuId),
  };
}

function getDropdownOptions(name) {
  const elements = getDropdownElements(name);
  if (!elements?.root) return [];
  return queryAll(elements.config.optionSelector, elements.root);
}

function readDropdownOptionValue(name, option) {
  const config = getDropdownConfig(name);
  if (!config) return '';
  return normalizeLowerTrim(option?.dataset?.[config.optionDatasetKey]);
}

function getDropdownValue(name) {
  const elements = getDropdownElements(name);
  if (!elements) return '';
  return normalizeValue(elements.input?.value, elements.config.fallback);
}

function syncDropdownUi(name) {
  const elements = getDropdownElements(name);
  if (!elements) return;

  const activeValue = getDropdownValue(name);

  if (elements.label) {
    elements.label.textContent = elements.config.labelFor(activeValue);
  }

  syncDropdownOptions(getDropdownOptions(name), activeValue, (option) =>
    readDropdownOptionValue(name, option)
  );
}

function setDropdownValue(name, value) {
  const elements = getDropdownElements(name);
  if (!elements) return;

  const nextValue = normalizeValue(value, elements.config.fallback);
  if (elements.input) {
    elements.input.value = nextValue;
  }

  syncDropdownUi(name);

  if (name === 'status') {
    syncBorrowerFields(nextValue);
  }
}

function syncBorrowerFields(statusValue = getDropdownValue('status')) {
  const fieldsRoot = el('borrowerFields');
  if (!fieldsRoot) return;

  const isBorrowed = String(statusValue || '') === 'borrowed';
  fieldsRoot.classList.toggle('hidden', !isBorrowed);
}

function isDropdownMenuOpen(name) {
  return isDropdownOpen(getDropdownElements(name)?.menu);
}

function closeDropdownMenu(name) {
  const elements = getDropdownElements(name);
  if (!elements) return;
  setDropdownOpen(elements.trigger, elements.menu, elements.chevron, false);
}

function openDropdownMenu(name) {
  Object.keys(DROPDOWNS).forEach((key) => {
    if (key === name) return;
    closeDropdownMenu(key);
  });

  const elements = getDropdownElements(name);
  if (!elements) return;
  setDropdownOpen(elements.trigger, elements.menu, elements.chevron, true);
}

function toggleDropdownMenu(name) {
  if (isDropdownMenuOpen(name)) {
    closeDropdownMenu(name);
    return;
  }

  openDropdownMenu(name);
}

function hasOpenDropdownMenu() {
  return Object.keys(DROPDOWNS).some((key) => isDropdownMenuOpen(key));
}

function closeAllDropdownMenus() {
  Object.keys(DROPDOWNS).forEach((key) => {
    closeDropdownMenu(key);
  });
}

function isInsideAnyDropdown(target) {
  return Object.keys(DROPDOWNS).some((key) => {
    const root = getDropdownElements(key)?.root;
    return !!root?.contains(target);
  });
}

function setFeedback(message = '', { isError = true } = {}) {
  const feedback = el('feedback');
  if (!feedback) return;
  feedback.textContent = message;
  feedback.classList.toggle('text-red-600', isError);
  feedback.classList.toggle('text-green-700', !isError);
}

function getSubmitIdleLabel() {
  return state.mode === 'create' ? 'Create' : 'Save';
}

function setFormMode(mode) {
  state.mode = mode === 'create' ? 'create' : 'edit';

  const titleEl = el('modalTitle');
  if (titleEl) {
    titleEl.textContent = state.mode === 'create' ? 'Add book' : 'Edit book';
  }
}

function setSaving(isSaving) {
  const submit = el('submit');
  if (!submit) return;
  submit.disabled = isSaving;
  submit.textContent = isSaving ? 'Saving...' : getSubmitIdleLabel();
}

function setPrefillLoading(isLoading) {
  const loader = el('formLoader');
  const content = el('formContent');
  if (!loader || !content) return;

  if (isLoading) {
    content.classList.add('hidden');
    loader.classList.remove('hidden');
    showCenteredLoader(loader, {
      sizeClass: 'h-8 w-8',
      targetClasses: FORM_LOADER_CLASSES,
      wrapperClass: 'inline-flex',
      wrapperTag: 'div',
    });
    return;
  }

  loader.classList.add('hidden');
  loader.innerHTML = '';
  clearLoaderState(loader, FORM_LOADER_CLASSES);
  content.classList.remove('hidden');
}

function setCoverPreview(url) {
  const preview = el('coverPreview');
  const fallback = el('coverFallback');
  if (!preview || !fallback) return;

  if (!url) {
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    fallback.classList.remove('hidden');
    return;
  }

  preview.src = url;
  preview.classList.remove('hidden');
  fallback.classList.add('hidden');
}

function closeEditModal() {
  const overlay = el('overlay');
  if (!overlay) return;

  closeAllDropdownMenus();
  overlay.classList.add('hidden');
  overlay.classList.remove('flex');
  overlay.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function openEditModal() {
  const overlay = el('overlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  overlay.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function resetCoverFileInput() {
  const coverFileInput = el('coverFile');
  const coverFileName = el('coverFileName');

  if (coverFileInput) {
    coverFileInput.value = '';
  }

  if (coverFileName) {
    coverFileName.textContent = 'No file selected';
  }
}

function fillEditForm(book) {
  const titleInput = el('title');
  const authorInput = el('author');
  const publishedYearInput = el('publishedYear');
  const borrowerNameInput = el('borrowerName');
  const borrowerPhoneInput = el('borrowerPhone');

  if (titleInput) titleInput.value = String(book?.title || '');
  if (authorInput) authorInput.value = String(book?.author || '');
  if (publishedYearInput) {
    publishedYearInput.value = book?.published_year
      ? String(book.published_year)
      : '';
  }
  if (borrowerNameInput) {
    borrowerNameInput.value = String(book?.borrower_name || '');
  }
  if (borrowerPhoneInput) {
    borrowerPhoneInput.value = formatPhoneNumber(
      String(book?.borrower_phone || '')
    );
  }
  setDropdownValue('genre', book?.genre);
  setDropdownValue('status', book?.status);

  state.activeBorrowedAt = String(book?.borrowed_at || '');
  state.coverUrl = String(book?.cover_url || '');
  state.uploadedCoverDataUrl = '';

  resetCoverFileInput();

  setCoverPreview(state.coverUrl);
  setFeedback('');
}

function fillCreateForm() {
  state.activeBookId = null;
  state.activeBorrowedAt = '';
  state.coverUrl = '';
  state.uploadedCoverDataUrl = '';

  const titleInput = el('title');
  const authorInput = el('author');
  const publishedYearInput = el('publishedYear');
  const borrowerNameInput = el('borrowerName');
  const borrowerPhoneInput = el('borrowerPhone');
  if (titleInput) titleInput.value = '';
  if (authorInput) authorInput.value = '';
  if (publishedYearInput) publishedYearInput.value = '';
  if (borrowerNameInput) borrowerNameInput.value = '';
  if (borrowerPhoneInput) borrowerPhoneInput.value = formatPhoneNumber('');

  setDropdownValue('genre', '');
  setDropdownValue('status', 'available');
  resetCoverFileInput();
  setCoverPreview('');
  setFeedback('');
}

async function openEditBookById(bookId) {
  const id = String(bookId || '').trim();
  if (!id) return;

  setFormMode('edit');
  state.activeBookId = null;
  openEditModal();
  setPrefillLoading(true);
  setSaving(true);

  try {
    const book = await getBookById(id);
    state.activeBookId = String(book?.id || id);
    fillEditForm(book);
    el('title')?.focus();
  } catch (error) {
    setFeedback(error?.message || 'Failed to load book.');
  } finally {
    setPrefillLoading(false);
    setSaving(false);
  }
}

function openCreateBookModal() {
  setFormMode('create');
  openEditModal();
  setPrefillLoading(false);
  setSaving(false);
  fillCreateForm();
  el('title')?.focus();
}

async function onCoverFileChange() {
  const coverFileInput = el('coverFile');
  const coverFileName = el('coverFileName');
  const file = coverFileInput?.files?.[0] || null;

  if (!file) {
    state.uploadedCoverDataUrl = '';
    if (coverFileName) coverFileName.textContent = 'No file selected';
    setCoverPreview(state.coverUrl);
    return;
  }

  if (coverFileName) {
    coverFileName.textContent = file.name;
  }

  try {
    const dataUrl = await readFileAsDataUrl(file);
    state.uploadedCoverDataUrl = dataUrl;
    setCoverPreview(dataUrl);
    setFeedback('');
  } catch (error) {
    state.uploadedCoverDataUrl = '';
    setCoverPreview(state.coverUrl);
    setFeedback(error?.message || 'Failed to import image.');
  }
}

function onBorrowerPhoneInput() {
  const input = el('borrowerPhone');
  if (!input) return;
  input.value = formatPhoneNumber(input.value);
}

function buildFormPayload() {
  const title = String(el('title')?.value || '').trim();
  const author = String(el('author')?.value || '').trim();
  const genre = getDropdownValue('genre');
  const status = getDropdownValue('status');
  const borrowerName = String(el('borrowerName')?.value || '').trim();
  const borrowerPhone = formatPhoneNumber(el('borrowerPhone')?.value);
  const borrowerPhoneDigits = getPhoneDigits(borrowerPhone);
  const borrowerPhoneInput = el('borrowerPhone');
  if (borrowerPhoneInput && borrowerPhoneInput.value !== borrowerPhone) {
    borrowerPhoneInput.value = borrowerPhone;
  }

  if (!title) {
    throw new Error('Title is required.');
  }

  if (!author) {
    throw new Error('Author is required.');
  }

  const publishedYear = normalizePublishedYearInput(
    el('publishedYear')?.value,
    {
      required: state.mode === 'create',
    }
  );

  if (state.mode === 'create' && !genre) {
    throw new Error('Genre is required.');
  }

  if (state.mode === 'create' && !status) {
    throw new Error('Status is required.');
  }

  if (status === 'borrowed' && !borrowerName) {
    throw new Error('Borrower name is required when status is borrowed.');
  }

  if (status === 'borrowed' && !borrowerPhone) {
    throw new Error('Borrower phone is required when status is borrowed.');
  }

  if (status === 'borrowed' && borrowerPhoneDigits.length !== 10) {
    throw new Error('Borrower phone must be 10 digits.');
  }

  const isBorrowed = status === 'borrowed';

  return {
    title,
    author,
    published_year: publishedYear,
    genre: genre || null,
    status: status || 'available',
    borrower_name: isBorrowed ? borrowerName : null,
    borrower_phone: isBorrowed ? borrowerPhone : null,
    borrowed_at: isBorrowed
      ? state.activeBorrowedAt || new Date().toISOString()
      : null,
    cover_url: state.uploadedCoverDataUrl || state.coverUrl || null,
  };
}

async function onEditSubmit(event) {
  event.preventDefault();

  if (state.mode === 'edit' && !state.activeBookId) {
    setFeedback('No selected book.');
    return;
  }

  setSaving(true);
  setFeedback('');

  try {
    const payload = buildFormPayload();

    if (state.mode === 'create') {
      await createBook(payload);
      setFeedback('Book created.', { isError: false });
    } else {
      await updateBook(state.activeBookId, payload);
      setFeedback('Book updated.', { isError: false });
    }

    closeEditModal();
    await Promise.resolve(state.onUpdated?.());
  } catch (error) {
    setFeedback(error?.message || 'Failed to save book.');
  } finally {
    setSaving(false);
  }
}

function bindOpenEditHandler() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest(EDIT_BUTTON_SELECTOR);
    if (!(button instanceof HTMLElement)) return;

    const tableBody = el('tableBody');
    if (!tableBody?.contains(button)) return;

    event.preventDefault();
    void openEditBookById(button.dataset.bookId);
  });
}

async function deleteBookWithConfirmation(bookId) {
  const id = String(bookId || '').trim();
  if (!id) return;

  try {
    const book = await getBookById(id);
    const title = String(book?.title || 'Untitled');
    const author = String(book?.author || 'Unknown author');

    const confirmed = await confirmDelete({
      title: 'Delete book',
      message: `Delete "${title}" by ${author}?\n This action cannot be undone.`,
      confirmText: 'Delete book',
    });

    if (!confirmed) return;
    await deleteBook(id);
    await Promise.resolve(state.onUpdated?.());
  } catch (error) {
    console.error('Failed to delete book', error);
  }
}

function bindDeleteHandler() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;

    const button = event.target.closest(DELETE_BUTTON_SELECTOR);
    if (!(button instanceof HTMLElement)) return;

    const tableBody = el('tableBody');
    if (!tableBody?.contains(button)) return;

    event.preventDefault();
    void deleteBookWithConfirmation(button.dataset.bookId);
  });
}

function bindCloseHandlers() {
  bindOnce(el('close'), 'click', closeEditModal);
  bindOnce(el('cancel'), 'click', closeEditModal);

  const overlay = el('overlay');
  bindOnce(overlay, 'click', (event) => {
    if (event.target !== overlay) return;
    closeEditModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    const overlay = el('overlay');
    if (!overlay || overlay.classList.contains('hidden')) return;

    if (hasOpenDropdownMenu()) {
      closeAllDropdownMenus();
      return;
    }

    closeEditModal();
  });
}

function bindDropdown(name) {
  const elements = getDropdownElements(name);
  if (!elements) return;

  bindOnce(elements.trigger, 'click', () => {
    toggleDropdownMenu(name);
  });

  getDropdownOptions(name).forEach((option) => {
    bindOnce(option, 'click', () => {
      setDropdownValue(name, readDropdownOptionValue(name, option));
      closeDropdownMenu(name);
    });
  });
}

function bindDropdownDismiss() {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    if (isInsideAnyDropdown(event.target)) return;
    closeAllDropdownMenus();
  });
}

function bindFormHandlers() {
  bindOnce(el('form'), 'submit', onEditSubmit);
  bindOnce(el('coverFile'), 'change', () => {
    void onCoverFileChange();
  });
  bindOnce(el('borrowerPhone'), 'input', onBorrowerPhoneInput);
}

function syncDefaultFormUi() {
  setFormMode('edit');
  setDropdownValue('genre', '');
  setDropdownValue('status', 'available');
  setPrefillLoading(false);
  setSaving(false);
}

export function setupBooksModals({ onUpdated } = {}) {
  state.onUpdated = typeof onUpdated === 'function' ? onUpdated : null;

  if (state.bound) {
    return {
      openCreateModal: openCreateBookModal,
    };
  }
  if (!el('overlay') || !el('modal')) {
    return {
      openCreateModal: () => {},
    };
  }

  bindOpenEditHandler();
  bindDeleteHandler();
  bindCloseHandlers();
  bindDropdown('genre');
  bindDropdown('status');
  bindDropdownDismiss();
  bindFormHandlers();
  syncDefaultFormUi();

  state.bound = true;

  return {
    openCreateModal: openCreateBookModal,
  };
}
