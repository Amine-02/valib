import { normalizeSearch } from './text.js';

export function search(query, items, keys = []) {
  if (!query || !items || items.length === 0) return [];

  const searchTokens = normalizeSearch(query)
    .split(/\s+/)
    .filter((token) => token.length > 0);

  if (searchTokens.length === 0) return [];

  return items.filter((item) => {
    let targetText = '';

    if (typeof item === 'string') {
      targetText = item;
    } else if (item && typeof item === 'object') {
      const searchIn = keys.length > 0 ? keys : Object.keys(item);
      targetText = searchIn.map((key) => item[key]).join(' ');
    }

    const normalizedTarget = normalizeSearch(targetText);
    return searchTokens.every((token) => normalizedTarget.includes(token));
  });
}
