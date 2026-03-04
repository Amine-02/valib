export function normalizePositiveIntString(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '';

  return String(parsed);
}

export function normalizeIntStringInRange(
  value,
  { min = 1, max = Number.MAX_SAFE_INTEGER, fallback = '' } = {}
) {
  const raw = String(value ?? '').trim();
  if (!raw) return String(fallback);

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return String(fallback);

  const bounded = Math.min(max, Math.max(min, parsed));
  return String(bounded);
}

export function normalizeLowerTrim(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function normalizeYearRange(
  fromValue,
  toValue,
  { min = 1, max = Number.MAX_SAFE_INTEGER, sort = true } = {}
) {
  let from = normalizeIntStringInRange(fromValue, { min, max, fallback: '' });
  let to = normalizeIntStringInRange(toValue, { min, max, fallback: '' });

  if (sort && from && to && Number(from) > Number(to)) {
    [from, to] = [to, from];
  }

  return { from, to };
}
