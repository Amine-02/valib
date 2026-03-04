export function getById(id) {
  return document.getElementById(id);
}

export function queryAll(selector, root = document) {
  if (!root || typeof root.querySelectorAll !== 'function') return [];
  return [...root.querySelectorAll(selector)];
}

export function findElementByChildText(parentSelector, childSelector, text) {
  const expected = String(text ?? '')
    .trim()
    .toLowerCase();
  if (!expected) return null;

  return (
    [...document.querySelectorAll(parentSelector)].find((el) => {
      const child = el.querySelector(childSelector);
      return child?.textContent?.trim().toLowerCase() === expected;
    }) || null
  );
}
