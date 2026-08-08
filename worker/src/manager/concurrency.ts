/**
 * Runs `fn` over `items` with at most `limit` in flight at once. Each item is
 * isolated — one rejecting doesn't stop the others — so callers get back one
 * settled result per item, in input order.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let nextIndex = 0

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++
      try {
        results[index] = { status: 'fulfilled', value: await fn(items[index]) }
      } catch (err) {
        results[index] = { status: 'rejected', reason: err }
      }
    }
  }

  const workerCount = Math.min(limit, items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))

  return results
}
