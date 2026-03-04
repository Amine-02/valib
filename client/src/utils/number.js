export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}
