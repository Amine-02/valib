export function setDropdownOpen(trigger, menu, chevron, open) {
  if (!trigger || !menu) return;

  menu.classList.toggle('hidden', !open);
  trigger.setAttribute('aria-expanded', String(open));

  if (chevron) {
    chevron.classList.toggle('rotate-180', open);
  }
}

export function isDropdownOpen(menu) {
  if (!menu) return false;
  return !menu.classList.contains('hidden');
}

export function syncDropdownOptions(options, activeValue, readOptionValue) {
  options.forEach((option) => {
    if (!(option instanceof HTMLElement)) return;

    const value = readOptionValue(option);
    const active = value === activeValue;

    option.classList.toggle('bg-primary-50', active);
    option.classList.toggle('text-primary-800', active);
    option.classList.toggle('font-semibold', active);
    option.classList.toggle('text-text', !active);
    option.setAttribute('aria-selected', String(active));
  });
}
