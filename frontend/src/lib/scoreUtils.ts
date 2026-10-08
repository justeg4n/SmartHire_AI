/** Backend stores 0–100; tolerate legacy 0–1 scalars. */
export function scoreToPercent(value: number | null | undefined): number {
  if (value == null || Number.isNaN(Number(value))) return 0
  const n = Number(value)
  return Math.round(n > 1 ? Math.min(100, n) : n * 100)
}
