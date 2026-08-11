const DEFAULT_CONCURRENCY = 4;
const MAX_RETRIES = 4;
const BASE_BACKOFF_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run `fn`, retrying on Clockify 429 rate-limit responses with the
 * Retry-After header when present, exponential backoff otherwise.
 * Non-429 errors are rethrown immediately.
 */
export async function withRateLimitRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimited = error?.response?.status === 429;
      if (!isRateLimited || attempt >= MAX_RETRIES) throw error;

      const retryAfterSeconds = Number(error.response?.headers?.["retry-after"]);
      const waitMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : BASE_BACKOFF_MS * 2 ** attempt;
      await sleep(waitMs);
    }
  }
}

/**
 * Map over `items` with at most `limit` promises in flight. Preserves
 * input order in the result. Each item's error must be handled inside
 * `fn` (bulk operations report per-item failures, they don't abort).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = DEFAULT_CONCURRENCY
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index], index);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
