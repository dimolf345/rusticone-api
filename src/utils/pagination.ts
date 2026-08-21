export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Clamps an already-numeric page/limit value to a safe positive integer.
 */
export function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum?: number
): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    return fallback;
  }

  return maximum === undefined ? value : Math.min(maximum, value);
}

/**
 * Parses a positive integer from a raw query value, falling back when invalid.
 */
export function parsePositiveInteger(
  value: unknown,
  fallback: number,
  maximum?: number
): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return fallback;
  }

  return maximum === undefined ? parsed : Math.min(maximum, parsed);
}
