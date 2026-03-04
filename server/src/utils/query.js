export function toPositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function toIntInRange(
  value,
  { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER } = {}
) {
  const parsed = toPositiveInt(value);
  if (parsed === null) return null;
  return Math.min(max, Math.max(min, parsed));
}

export function normalizeAscendingRange(min, max) {
  if (min !== null && max !== null && min > max) {
    return [max, min];
  }

  return [min, max];
}

export function applyPagination(
  query,
  filters = {},
  { defaultPageSize = 50, maxPageSize = 500 } = {}
) {
  const hasPage = filters.page !== undefined;
  const hasLimit = filters.limit !== undefined;

  if (!hasPage && !hasLimit) return query;

  const page = toPositiveInt(filters.page) ?? 1;
  const limit = Math.min(
    toPositiveInt(filters.limit) ?? defaultPageSize,
    maxPageSize
  );

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  return query.range(from, to);
}
