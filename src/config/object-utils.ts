/**
 * Returns a new object with all `undefined` values removed, so optional
 * tool parameters are never sent to the Clockify API as nulls.
 */
export function omitUndefined<T extends Record<string, unknown>>(
  obj: T
): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}
