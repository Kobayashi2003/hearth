/**
 * The next value along a list of presets, stopping at either end rather than
 * wrapping — holding − should stop shrinking the text, not leap back to enormous.
 */
export function neighbour<T>(values: readonly T[], current: T, delta: 1 | -1): T {
  const index = values.indexOf(current);
  const next = Math.max(0, Math.min(values.length - 1, (index === -1 ? 0 : index) + delta));
  return values[next] ?? current;
}
