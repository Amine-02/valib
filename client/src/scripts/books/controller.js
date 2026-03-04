import {
  isDropdownOpen,
  setDropdownOpen,
  syncDropdownOptions,
} from '/src/utils/dropdown.js';
import { getById, queryAll } from '/src/utils/dom.js';
import {
  normalizeIntStringInRange,
  normalizeLowerTrim,
} from '/src/utils/filter.js';
import { toTitleCase } from '/src/utils/string.js';

const IDS = {
  addButton: 'books-add-button',
  prevButton: 'books-prev-page',
  nextButton: 'books-next-page',
  searchInput: 'books-search-input',
  searchClear: 'books-search-clear',
  yearRoot: 'books-filter-year-root',
  yearTrigger: 'books-filter-year-trigger',
  yearChevron: 'books-filter-year-chevron',
  yearMenu: 'books-filter-year-menu',
  yearSummary: 'books-filter-year-summary',
  yearFrom: 'books-filter-year-from',
  yearTo: 'books-filter-year-to',
  yearFromValue: 'books-filter-year-from-value',
  yearToValue: 'books-filter-year-to-value',
  yearActiveRange: 'books-filter-year-active-range',
  genreInput: 'books-filter-genre',
  genreRoot: 'books-filter-genre-root',
  genreTrigger: 'books-filter-genre-trigger',
  genreLabel: 'books-filter-genre-label',
  genreChevron: 'books-filter-genre-chevron',
  genreMenu: 'books-filter-genre-menu',
  statusInput: 'books-filter-status',
  statusRoot: 'books-filter-status-root',
  statusTrigger: 'books-filter-status-trigger',
  statusLabel: 'books-filter-status-label',
  statusChevron: 'books-filter-status-chevron',
  statusMenu: 'books-filter-status-menu',
};

const SELECTORS = {
  genreOptions: '[data-genre-option]',
  statusOptions: '[data-status-option]',
};

const MENU_CONFIG = {
  year: {
    root: 'yearRoot',
    trigger: 'yearTrigger',
    menu: 'yearMenu',
    chevron: 'yearChevron',
  },
  genre: {
    root: 'genreRoot',
    trigger: 'genreTrigger',
    menu: 'genreMenu',
    chevron: 'genreChevron',
  },
  status: {
    root: 'statusRoot',
    trigger: 'statusTrigger',
    menu: 'statusMenu',
    chevron: 'statusChevron',
  },
};

const SIMPLE_FILTER_CONFIG = {
  genre: {
    stateKey: 'genre',
    input: 'genreInput',
    label: 'genreLabel',
    optionSelector: SELECTORS.genreOptions,
    readOptionValue: (option) =>
      normalizeLowerTrim(option?.dataset?.genreOption),
    labelFor: (value) => {
      if (!value) return 'All genre';
      return toTitleCase(String(value).replaceAll('_', ' '));
    },
  },
  status: {
    stateKey: 'status',
    input: 'statusInput',
    label: 'statusLabel',
    optionSelector: SELECTORS.statusOptions,
    readOptionValue: (option) =>
      normalizeLowerTrim(option?.dataset?.statusOption),
    labelFor: (value) => {
      if (value === 'available') return 'Available';
      if (value === 'borrowed') return 'Borrowed';
      return 'All status';
    },
  },
};

function el(key) {
  return getById(IDS[key]);
}

function bindOnce(element, eventName, handler) {
  if (!element || element.dataset.bound) return;
  element.addEventListener(eventName, handler);
  element.dataset.bound = 'true';
}

function getMenuElements(name) {
  const config = MENU_CONFIG[name];
  if (!config) return null;

  return {
    root: el(config.root),
    trigger: el(config.trigger),
    menu: el(config.menu),
    chevron: el(config.chevron),
  };
}

function isMenuOpen(name) {
  return isDropdownOpen(getMenuElements(name)?.menu);
}

function setMenuOpen(name, open) {
  const elements = getMenuElements(name);
  if (!elements) return;
  setDropdownOpen(elements.trigger, elements.menu, elements.chevron, open);
}

function closeMenu(name) {
  setMenuOpen(name, false);
}

function openMenu(name, { closeOthers = true } = {}) {
  if (closeOthers) {
    Object.keys(MENU_CONFIG).forEach((key) => {
      if (key === name) return;
      closeMenu(key);
    });
  }

  setMenuOpen(name, true);
}

function toggleMenu(name) {
  if (isMenuOpen(name)) {
    closeMenu(name);
    return;
  }

  openMenu(name);
}

function closeAllMenus() {
  Object.keys(MENU_CONFIG).forEach((key) => closeMenu(key));
}

function isInsideAnyMenuRoot(target) {
  return Object.keys(MENU_CONFIG).some((key) =>
    getMenuElements(key)?.root?.contains(target)
  );
}

function getSimpleFilterConfig(name) {
  return SIMPLE_FILTER_CONFIG[name] || null;
}

function getFilterOptions(name) {
  const config = getSimpleFilterConfig(name);
  if (!config) return [];

  const root = getMenuElements(name)?.root;
  if (!root) return [];

  return queryAll(config.optionSelector, root);
}

function getFilterInputValue(name) {
  const config = getSimpleFilterConfig(name);
  if (!config) return '';
  return normalizeLowerTrim(el(config.input)?.value);
}

function setFilterInputValue(name, value) {
  const config = getSimpleFilterConfig(name);
  if (!config) return;

  const input = el(config.input);
  if (input) {
    input.value = normalizeLowerTrim(value);
  }
}

function syncSimpleFilterUi(name, state) {
  const config = getSimpleFilterConfig(name);
  if (!config) return;

  const activeValue = String(state[config.stateKey] || '');

  const label = el(config.label);
  if (label) {
    label.textContent = config.labelFor(activeValue);
  }

  syncDropdownOptions(
    getFilterOptions(name),
    activeValue,
    config.readOptionValue
  );
}

function syncYearRangeUi(state, { yearMin, yearMax }) {
  const summary = el('yearSummary');
  if (summary) {
    summary.textContent = `${state.yearFrom || yearMin} - ${state.yearTo || yearMax}`;
  }

  const fromLabel = el('yearFromValue');
  if (fromLabel) {
    fromLabel.textContent = state.yearFrom || String(yearMin);
  }

  const toLabel = el('yearToValue');
  if (toLabel) {
    toLabel.textContent = state.yearTo || String(yearMax);
  }

  const activeRange = el('yearActiveRange');
  if (!activeRange) return;

  const span = yearMax - yearMin || 1;
  const from = Number(state.yearFrom || yearMin);
  const to = Number(state.yearTo || yearMax);
  const start = Math.min(from, to);
  const end = Math.max(from, to);

  const left = ((start - yearMin) / span) * 100;
  const width = ((end - start) / span) * 100;

  activeRange.style.left = `${left}%`;
  activeRange.style.width = `${width}%`;
}

function setFilterValues(state, values, { yearMin, yearMax }) {
  const {
    yearFrom = state.yearFrom,
    yearTo = state.yearTo,
    genre = state.genre,
    status = state.status,
  } = values || {};

  const nextYearFrom = normalizeIntStringInRange(yearFrom, {
    min: yearMin,
    max: yearMax,
    fallback: String(yearMin),
  });
  const nextYearTo = normalizeIntStringInRange(yearTo, {
    min: yearMin,
    max: yearMax,
    fallback: String(yearMax),
  });
  const nextGenre = normalizeLowerTrim(genre);
  const nextStatus = normalizeLowerTrim(status);

  const changed =
    nextYearFrom !== state.yearFrom ||
    nextYearTo !== state.yearTo ||
    nextGenre !== state.genre ||
    nextStatus !== state.status;

  state.yearFrom = nextYearFrom;
  state.yearTo = nextYearTo;
  state.genre = nextGenre;
  state.status = nextStatus;

  const yearFromInput = el('yearFrom');
  if (yearFromInput && yearFromInput.value !== nextYearFrom) {
    yearFromInput.value = nextYearFrom;
  }

  const yearToInput = el('yearTo');
  if (yearToInput && yearToInput.value !== nextYearTo) {
    yearToInput.value = nextYearTo;
  }

  setFilterInputValue('genre', nextGenre);
  setFilterInputValue('status', nextStatus);
  syncSimpleFilterUi('genre', state);
  syncSimpleFilterUi('status', state);
  syncYearRangeUi(state, { yearMin, yearMax });

  return changed;
}

function getClampedYearRange({ yearMin, yearMax }, source = '') {
  const fromInput = el('yearFrom');
  const toInput = el('yearTo');

  let from = normalizeIntStringInRange(fromInput?.value, {
    min: yearMin,
    max: yearMax,
    fallback: String(yearMin),
  });
  let to = normalizeIntStringInRange(toInput?.value, {
    min: yearMin,
    max: yearMax,
    fallback: String(yearMax),
  });

  if (source === 'from' && Number(from) > Number(to)) {
    from = to;
  }

  if (source === 'to' && Number(to) < Number(from)) {
    to = from;
  }

  if (fromInput && fromInput.value !== from) {
    fromInput.value = from;
  }

  if (toInput && toInput.value !== to) {
    toInput.value = to;
  }

  return { from, to };
}

export function setupBooksController({
  state,
  loadBooksPage,
  openCreateModal,
  yearMin,
  yearMax,
  searchDebounceMs,
  filterDebounceMs,
}) {
  let searchDebounceId = null;
  let filterDebounceId = null;
  let dropdownGlobalBound = false;

  function clearSearchDebounce() {
    if (!searchDebounceId) return;
    window.clearTimeout(searchDebounceId);
    searchDebounceId = null;
  }

  function clearFilterDebounce() {
    if (!filterDebounceId) return;
    window.clearTimeout(filterDebounceId);
    filterDebounceId = null;
  }

  function syncSearchUi() {
    const clearButton = el('searchClear');
    if (!clearButton) return;

    const hasQuery = String(state.searchQuery || '').length > 0;
    clearButton.classList.toggle('hidden', !hasQuery);
  }

  function setSearchQuery(value, { syncInput = false } = {}) {
    const nextQuery = String(value ?? '');
    const changed = nextQuery !== state.searchQuery;
    state.searchQuery = nextQuery;

    if (syncInput) {
      const input = el('searchInput');
      if (input && input.value !== nextQuery) {
        input.value = nextQuery;
      }
    }

    syncSearchUi();
    return changed;
  }

  function reloadFromFilterInputs({ force = false } = {}) {
    const { from, to } = getClampedYearRange({ yearMin, yearMax });
    const changed = setFilterValues(
      state,
      {
        yearFrom: from,
        yearTo: to,
        genre: getFilterInputValue('genre'),
        status: getFilterInputValue('status'),
      },
      { yearMin, yearMax }
    );

    if (!changed && !force) return;
    void loadBooksPage(1);
  }

  function scheduleFilterReload({ force = false } = {}) {
    clearFilterDebounce();
    filterDebounceId = window.setTimeout(() => {
      reloadFromFilterInputs({ force });
    }, filterDebounceMs);
  }

  function handleYearSliderInput(source) {
    const { from, to } = getClampedYearRange({ yearMin, yearMax }, source);
    const changed = setFilterValues(
      state,
      {
        yearFrom: from,
        yearTo: to,
      },
      { yearMin, yearMax }
    );

    if (!changed) return;
    scheduleFilterReload({ force: true });
  }

  function bindPaginationControls() {
    bindOnce(el('prevButton'), 'click', () => {
      if (state.loading || state.page <= 1) return;
      void loadBooksPage(state.page - 1);
    });

    bindOnce(el('nextButton'), 'click', () => {
      if (state.loading || state.page >= state.totalPages) return;
      void loadBooksPage(state.page + 1);
    });
  }

  function bindAddControl() {
    bindOnce(el('addButton'), 'click', () => {
      if (typeof openCreateModal !== 'function') return;
      openCreateModal();
    });
  }

  function bindSearchControls() {
    const input = el('searchInput');
    const clearButton = el('searchClear');

    bindOnce(input, 'input', () => {
      clearSearchDebounce();

      searchDebounceId = window.setTimeout(() => {
        const changed = setSearchQuery(input.value);
        if (!changed) return;
        void loadBooksPage(1);
      }, searchDebounceMs);
    });

    bindOnce(input, 'keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();

      clearSearchDebounce();

      const changed = setSearchQuery(input.value);
      if (!changed) return;
      void loadBooksPage(1);
    });

    bindOnce(clearButton, 'click', () => {
      clearSearchDebounce();

      const changed = setSearchQuery('', { syncInput: true });
      if (!changed) return;

      input?.focus();
      void loadBooksPage(1);
    });

    syncSearchUi();
  }

  function bindYearDropdown() {
    bindOnce(el('yearTrigger'), 'click', () => {
      toggleMenu('year');
    });
  }

  function bindSimpleFilterDropdown(name) {
    bindOnce(getMenuElements(name)?.trigger, 'click', () => {
      toggleMenu(name);
    });

    const config = getSimpleFilterConfig(name);
    if (!config) return;

    getFilterOptions(name).forEach((option) => {
      bindOnce(option, 'click', () => {
        closeMenu(name);

        const changed = setFilterValues(
          state,
          {
            [config.stateKey]: config.readOptionValue(option),
          },
          { yearMin, yearMax }
        );
        if (!changed) return;

        clearFilterDebounce();
        void loadBooksPage(1);
      });
    });
  }

  function bindGlobalDropdownDismiss() {
    if (dropdownGlobalBound) return;

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      if (isInsideAnyMenuRoot(event.target)) return;

      closeAllMenus();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeAllMenus();
    });

    dropdownGlobalBound = true;
  }

  function bindFilterControls() {
    bindOnce(el('yearFrom'), 'input', () => {
      handleYearSliderInput('from');
    });

    bindOnce(el('yearTo'), 'input', () => {
      handleYearSliderInput('to');
    });

    bindYearDropdown();
    bindSimpleFilterDropdown('genre');
    bindSimpleFilterDropdown('status');
    bindGlobalDropdownDismiss();

    setFilterValues(
      state,
      {
        yearFrom: state.yearFrom,
        yearTo: state.yearTo,
        genre: state.genre,
        status: state.status,
      },
      { yearMin, yearMax }
    );
  }

  function bindAll() {
    bindAddControl();
    bindPaginationControls();
    bindSearchControls();
    bindFilterControls();
  }

  return {
    bindAll,
  };
}
