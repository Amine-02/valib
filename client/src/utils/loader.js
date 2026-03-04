export function spinnerMarkup(sizeClass = 'h-6 w-6') {
  return `<span class="inline-block ${sizeClass} animate-spin rounded-full border-2 border-primary-200 border-t-primary-600"></span>`;
}

export function showCenteredLoader(
  target,
  {
    sizeClass = 'h-6 w-6',
    targetClasses = [],
    wrapperTag = 'span',
    wrapperClass = '',
  } = {}
) {
  if (!target) return;

  if (targetClasses.length) {
    target.classList.add(...targetClasses);
  }

  const wrapperClassAttr = wrapperClass ? ` class="${wrapperClass}"` : '';
  target.innerHTML = `<${wrapperTag}${wrapperClassAttr}>${spinnerMarkup(sizeClass)}</${wrapperTag}>`;
}

export function clearLoaderState(target, targetClasses = []) {
  if (!target) return;
  if (!targetClasses.length) return;
  target.classList.remove(...targetClasses);
}
