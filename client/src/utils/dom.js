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
