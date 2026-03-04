import {
  isDropdownOpen,
  setDropdownOpen,
  syncDropdownOptions,
} from '/src/utils/dropdown.js';
import {
  normalizeIntStringInRange,
  normalizeLowerTrim,
} from '/src/utils/filter.js';
import { toTitleCase } from '/src/utils/string.js';

const BOOKS_PREV_PAGE_ID = 'books-prev-page';
const BOOKS_NEXT_PAGE_ID = 'books-next-page';
const BOOKS_SEARCH_INPUT_ID = 'books-search-input';
const BOOKS_SEARCH_CLEAR_ID = 'books-search-clear';
const BOOKS_FILTER_YEAR_ROOT_ID = 'books-filter-year-root';
const BOOKS_FILTER_YEAR_TRIGGER_ID = 'books-filter-year-trigger';
const BOOKS_FILTER_YEAR_CHEVRON_ID = 'books-filter-year-chevron';
const BOOKS_FILTER_YEAR_MENU_ID = 'books-filter-year-menu';
const BOOKS_FILTER_YEAR_SUMMARY_ID = 'books-filter-year-summary';
const BOOKS_FILTER_YEAR_FROM_ID = 'books-filter-year-from';
const BOOKS_FILTER_YEAR_TO_ID = 'books-filter-year-to';
const BOOKS_FILTER_YEAR_FROM_VALUE_ID = 'books-filter-year-from-value';
const BOOKS_FILTER_YEAR_TO_VALUE_ID = 'books-filter-year-to-value';
const BOOKS_FILTER_YEAR_ACTIVE_RANGE_ID = 'books-filter-year-active-range';
const BOOKS_FILTER_GENRE_ID = 'books-filter-genre';
const BOOKS_FILTER_GENRE_ROOT_ID = 'books-filter-genre-root';
const BOOKS_FILTER_GENRE_TRIGGER_ID = 'books-filter-genre-trigger';
const BOOKS_FILTER_GENRE_LABEL_ID = 'books-filter-genre-label';
const BOOKS_FILTER_GENRE_CHEVRON_ID = 'books-filter-genre-chevron';
const BOOKS_FILTER_GENRE_MENU_ID = 'books-filter-genre-menu';
const BOOKS_FILTER_GENRE_OPTION_SELECTOR = '[data-genre-option]';
const BOOKS_FILTER_STATUS_ID = 'books-filter-status';
const BOOKS_FILTER_STATUS_ROOT_ID = 'books-filter-status-root';
const BOOKS_FILTER_STATUS_TRIGGER_ID = 'books-filter-status-trigger';
const BOOKS_FILTER_STATUS_LABEL_ID = 'books-filter-status-label';
const BOOKS_FILTER_STATUS_CHEVRON_ID = 'books-filter-status-chevron';
const BOOKS_FILTER_STATUS_MENU_ID = 'books-filter-status-menu';
const BOOKS_FILTER_STATUS_OPTION_SELECTOR = '[data-status-option]';

function getById(id) {
  return document.getElementById(id);
}

function getPrevButton() {
  return getById(BOOKS_PREV_PAGE_ID);
}

function getNextButton() {
  return getById(BOOKS_NEXT_PAGE_ID);
}

function getSearchInput() {
  return getById(BOOKS_SEARCH_INPUT_ID);
}

function getSearchClearButton() {
  return getById(BOOKS_SEARCH_CLEAR_ID);
}

function getYearFilterRoot() {
  return getById(BOOKS_FILTER_YEAR_ROOT_ID);
}

function getYearFilterTrigger() {
  return getById(BOOKS_FILTER_YEAR_TRIGGER_ID);
}

function getYearFilterChevron() {
  return getById(BOOKS_FILTER_YEAR_CHEVRON_ID);
}

function getYearFilterMenu() {
  return getById(BOOKS_FILTER_YEAR_MENU_ID);
}

function getYearSummaryLabel() {
  return getById(BOOKS_FILTER_YEAR_SUMMARY_ID);
}

function getYearFromFilterInput() {
  return getById(BOOKS_FILTER_YEAR_FROM_ID);
}

function getYearToFilterInput() {
  return getById(BOOKS_FILTER_YEAR_TO_ID);
}

function getYearFromValueLabel() {
  return getById(BOOKS_FILTER_YEAR_FROM_VALUE_ID);
}

function getYearToValueLabel() {
  return getById(BOOKS_FILTER_YEAR_TO_VALUE_ID);
}

function getYearActiveRange() {
  return getById(BOOKS_FILTER_YEAR_ACTIVE_RANGE_ID);
}

function getGenreFilterInput() {
  return getById(BOOKS_FILTER_GENRE_ID);
}

function getGenreFilterRoot() {
  return getById(BOOKS_FILTER_GENRE_ROOT_ID);
}

function getGenreFilterTrigger() {
  return getById(BOOKS_FILTER_GENRE_TRIGGER_ID);
}

function getGenreFilterLabel() {
  return getById(BOOKS_FILTER_GENRE_LABEL_ID);
}

function getGenreFilterChevron() {
  return getById(BOOKS_FILTER_GENRE_CHEVRON_ID);
}

function getGenreFilterMenu() {
  return getById(BOOKS_FILTER_GENRE_MENU_ID);
}

function getGenreFilterOptions() {
  const root = getGenreFilterRoot();
  if (!root) return [];
  return [...root.querySelectorAll(BOOKS_FILTER_GENRE_OPTION_SELECTOR)];
}

function getStatusFilterInput() {
  return getById(BOOKS_FILTER_STATUS_ID);
}

function getStatusFilterRoot() {
  return getById(BOOKS_FILTER_STATUS_ROOT_ID);
}

function getStatusFilterTrigger() {
  return getById(BOOKS_FILTER_STATUS_TRIGGER_ID);
}

function getStatusFilterLabel() {
  return getById(BOOKS_FILTER_STATUS_LABEL_ID);
}

function getStatusFilterChevron() {
  return getById(BOOKS_FILTER_STATUS_CHEVRON_ID);
}

function getStatusFilterMenu() {
  return getById(BOOKS_FILTER_STATUS_MENU_ID);
}

function getStatusFilterOptions() {
  const root = getStatusFilterRoot();
  if (!root) return [];
  return [...root.querySelectorAll(BOOKS_FILTER_STATUS_OPTION_SELECTOR)];
}

function getGenreOptionValue(option) {
  return normalizeLowerTrim(option?.dataset?.genreOption);
}

function getStatusOptionValue(option) {
  return normalizeLowerTrim(option?.dataset?.statusOption);
}

function getGenreFilterLabelText(genreValue) {
  if (!genreValue) return 'All genre';
  return toTitleCase(String(genreValue).replaceAll('_', ' '));
}

function getStatusFilterLabelText(statusValue) {
  if (statusValue === 'available') return 'Available';
  if (statusValue === 'borrowed') return 'Borrowed';
  return 'All status';
}

export function setupBooksController({
  state,
  loadBooksPage,
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
    const clearButton = getSearchClearButton();
    if (!clearButton) return;

    const hasQuery = String(state.searchQuery || '').length > 0;
    clearButton.classList.toggle('hidden', !hasQuery);
  }

  function setSearchQuery(value, { syncInput = false } = {}) {
    const nextQuery = String(value ?? '');
    const changed = nextQuery !== state.searchQuery;
    state.searchQuery = nextQuery;

    if (syncInput) {
      const input = getSearchInput();
      if (input && input.value !== nextQuery) {
        input.value = nextQuery;
      }
    }

    syncSearchUi();
    return changed;
  }

  function syncGenreDropdownUi() {
    const label = getGenreFilterLabel();
    if (label) {
      label.textContent = getGenreFilterLabelText(state.genre);
    }

    syncDropdownOptions(
      getGenreFilterOptions(),
      state.genre,
      getGenreOptionValue
    );
  }

  function syncStatusDropdownUi() {
    const label = getStatusFilterLabel();
    if (label) {
      label.textContent = getStatusFilterLabelText(state.status);
    }

    syncDropdownOptions(
      getStatusFilterOptions(),
      state.status,
      getStatusOptionValue
    );
  }

  function syncYearRangeUi() {
    const summary = getYearSummaryLabel();
    if (summary) {
      summary.textContent = `${state.yearFrom || yearMin} - ${state.yearTo || yearMax}`;
    }

    const fromLabel = getYearFromValueLabel();
    if (fromLabel) {
      fromLabel.textContent = state.yearFrom || String(yearMin);
    }

    const toLabel = getYearToValueLabel();
    if (toLabel) {
      toLabel.textContent = state.yearTo || String(yearMax);
    }

    const activeRange = getYearActiveRange();
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

  function setFilterValues({
    yearFrom = state.yearFrom,
    yearTo = state.yearTo,
    genre = state.genre,
    status = state.status,
  } = {}) {
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

    const yearFromInput = getYearFromFilterInput();
    if (yearFromInput && yearFromInput.value !== nextYearFrom) {
      yearFromInput.value = nextYearFrom;
    }

    const yearToInput = getYearToFilterInput();
    if (yearToInput && yearToInput.value !== nextYearTo) {
      yearToInput.value = nextYearTo;
    }

    const genreInput = getGenreFilterInput();
    if (genreInput && genreInput.value !== nextGenre) {
      genreInput.value = nextGenre;
    }

    const statusInput = getStatusFilterInput();
    if (statusInput && statusInput.value !== nextStatus) {
      statusInput.value = nextStatus;
    }

    syncGenreDropdownUi();
    syncStatusDropdownUi();
    syncYearRangeUi();

    return changed;
  }

  function isYearMenuOpen() {
    return isDropdownOpen(getYearFilterMenu());
  }

  function isGenreMenuOpen() {
    return isDropdownOpen(getGenreFilterMenu());
  }

  function isStatusMenuOpen() {
    return isDropdownOpen(getStatusFilterMenu());
  }

  function closeYearMenu() {
    setDropdownOpen(
      getYearFilterTrigger(),
      getYearFilterMenu(),
      getYearFilterChevron(),
      false
    );
  }

  function closeGenreMenu() {
    setDropdownOpen(
      getGenreFilterTrigger(),
      getGenreFilterMenu(),
      getGenreFilterChevron(),
      false
    );
  }

  function closeStatusMenu() {
    setDropdownOpen(
      getStatusFilterTrigger(),
      getStatusFilterMenu(),
      getStatusFilterChevron(),
      false
    );
  }

  function closeAllFilterMenus() {
    closeYearMenu();
    closeGenreMenu();
    closeStatusMenu();
  }

  function openYearMenu() {
    closeGenreMenu();
    closeStatusMenu();
    setDropdownOpen(
      getYearFilterTrigger(),
      getYearFilterMenu(),
      getYearFilterChevron(),
      true
    );
  }

  function openGenreMenu() {
    closeYearMenu();
    closeStatusMenu();
    setDropdownOpen(
      getGenreFilterTrigger(),
      getGenreFilterMenu(),
      getGenreFilterChevron(),
      true
    );
  }

  function openStatusMenu() {
    closeYearMenu();
    closeGenreMenu();
    setDropdownOpen(
      getStatusFilterTrigger(),
      getStatusFilterMenu(),
      getStatusFilterChevron(),
      true
    );
  }

  function toggleYearMenu() {
    if (isYearMenuOpen()) {
      closeYearMenu();
      return;
    }
    openYearMenu();
  }

  function toggleGenreMenu() {
    if (isGenreMenuOpen()) {
      closeGenreMenu();
      return;
    }
    openGenreMenu();
  }

  function toggleStatusMenu() {
    if (isStatusMenuOpen()) {
      closeStatusMenu();
      return;
    }
    openStatusMenu();
  }

  function getClampedYearRange(source = '') {
    const fromInput = getYearFromFilterInput();
    const toInput = getYearToFilterInput();

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

  function reloadFromFilterInputs({ force = false } = {}) {
    const { from, to } = getClampedYearRange();
    const changed = setFilterValues({
      yearFrom: from,
      yearTo: to,
      genre: getGenreFilterInput()?.value,
      status: getStatusFilterInput()?.value,
    });

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
    const { from, to } = getClampedYearRange(source);
    const changed = setFilterValues({
      yearFrom: from,
      yearTo: to,
    });

    if (!changed) return;
    scheduleFilterReload({ force: true });
  }

  function bindPaginationControls() {
    const prevButton = getPrevButton();
    const nextButton = getNextButton();

    if (prevButton && !prevButton.dataset.bound) {
      prevButton.addEventListener('click', () => {
        if (state.loading || state.page <= 1) return;
        void loadBooksPage(state.page - 1);
      });
      prevButton.dataset.bound = 'true';
    }

    if (nextButton && !nextButton.dataset.bound) {
      nextButton.addEventListener('click', () => {
        if (state.loading || state.page >= state.totalPages) return;
        void loadBooksPage(state.page + 1);
      });
      nextButton.dataset.bound = 'true';
    }
  }

  function bindSearchControls() {
    const input = getSearchInput();
    const clearButton = getSearchClearButton();

    if (input && !input.dataset.bound) {
      input.addEventListener('input', () => {
        clearSearchDebounce();

        searchDebounceId = window.setTimeout(() => {
          const changed = setSearchQuery(input.value);
          if (!changed) return;
          void loadBooksPage(1);
        }, searchDebounceMs);
      });

      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();

        clearSearchDebounce();

        const changed = setSearchQuery(input.value);
        if (!changed) return;
        void loadBooksPage(1);
      });

      input.dataset.bound = 'true';
    }

    if (clearButton && !clearButton.dataset.bound) {
      clearButton.addEventListener('click', () => {
        clearSearchDebounce();

        const changed = setSearchQuery('', { syncInput: true });
        if (!changed) return;

        if (input) input.focus();
        void loadBooksPage(1);
      });

      clearButton.dataset.bound = 'true';
    }

    syncSearchUi();
  }

  function bindYearDropdown() {
    const trigger = getYearFilterTrigger();
    if (trigger && !trigger.dataset.bound) {
      trigger.addEventListener('click', () => {
        toggleYearMenu();
      });
      trigger.dataset.bound = 'true';
    }
  }

  function bindGenreDropdown() {
    const trigger = getGenreFilterTrigger();
    if (trigger && !trigger.dataset.bound) {
      trigger.addEventListener('click', () => {
        toggleGenreMenu();
      });
      trigger.dataset.bound = 'true';
    }

    getGenreFilterOptions().forEach((option) => {
      if (!(option instanceof HTMLElement)) return;
      if (option.dataset.bound) return;

      option.addEventListener('click', () => {
        closeGenreMenu();

        const changed = setFilterValues({
          genre: getGenreOptionValue(option),
        });
        if (!changed) return;

        clearFilterDebounce();
        void loadBooksPage(1);
      });

      option.dataset.bound = 'true';
    });
  }

  function bindStatusDropdown() {
    const trigger = getStatusFilterTrigger();
    if (trigger && !trigger.dataset.bound) {
      trigger.addEventListener('click', () => {
        toggleStatusMenu();
      });
      trigger.dataset.bound = 'true';
    }

    getStatusFilterOptions().forEach((option) => {
      if (!(option instanceof HTMLElement)) return;
      if (option.dataset.bound) return;

      option.addEventListener('click', () => {
        closeStatusMenu();

        const changed = setFilterValues({
          status: getStatusOptionValue(option),
        });
        if (!changed) return;

        clearFilterDebounce();
        void loadBooksPage(1);
      });

      option.dataset.bound = 'true';
    });
  }

  function bindGlobalDropdownDismiss() {
    if (dropdownGlobalBound) return;

    document.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const yearRoot = getYearFilterRoot();
      const genreRoot = getGenreFilterRoot();
      const statusRoot = getStatusFilterRoot();
      if (yearRoot?.contains(event.target)) return;
      if (genreRoot?.contains(event.target)) return;
      if (statusRoot?.contains(event.target)) return;

      closeAllFilterMenus();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      closeAllFilterMenus();
    });

    dropdownGlobalBound = true;
  }

  function bindFilterControls() {
    const yearFromInput = getYearFromFilterInput();
    const yearToInput = getYearToFilterInput();

    if (yearFromInput && !yearFromInput.dataset.bound) {
      yearFromInput.addEventListener('input', () => {
        handleYearSliderInput('from');
      });

      yearFromInput.dataset.bound = 'true';
    }

    if (yearToInput && !yearToInput.dataset.bound) {
      yearToInput.addEventListener('input', () => {
        handleYearSliderInput('to');
      });

      yearToInput.dataset.bound = 'true';
    }

    bindYearDropdown();
    bindGenreDropdown();
    bindStatusDropdown();
    bindGlobalDropdownDismiss();

    setFilterValues({
      yearFrom: state.yearFrom,
      yearTo: state.yearTo,
      genre: state.genre,
      status: state.status,
    });
  }

  function bindAll() {
    bindPaginationControls();
    bindSearchControls();
    bindFilterControls();
  }

  return {
    bindAll,
  };
}
