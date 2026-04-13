const compactCreditFormatter = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatCreditCompact(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const normalizedValue = Math.max(value, 0);
  if (normalizedValue < 1000) {
    return new Intl.NumberFormat().format(Math.round(normalizedValue));
  }

  return compactCreditFormatter.format(normalizedValue);
}

export function formatCreditExact(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  const normalizedValue = Math.max(value, 0);
  const maximumFractionDigits = normalizedValue >= 100 ? 0 : 2;

  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits,
  }).format(normalizedValue);
}
