/**
 * Generic "get from cache, otherwise compute and store" helper on top of
 * Cloudflare KV.
 *
 * Flow:
 *   1. Look the key up in KV.
 *   2. Hit  -> return the stored value immediately (no upstream call).
 *   3. Miss -> run `compute`, store the result with an expiry, return it.
 *
 * If `compute` throws, nothing is written, so a failed upstream call is
 * never cached and the next request will try again.
 *
 * Note: KV is eventually consistent, so a freshly written value can take
 * up to about a minute to be visible in every location. That is fine for
 * data that only changes hourly.
 *
 * @param kv         The KV namespace binding (env.CACHE)
 * @param key        Cache key; should encode what the data is (metric, location, range)
 * @param ttlSeconds How long the entry lives before KV expires it
 * @param compute    Function that produces the value on a cache miss
 * @returns The value, and whether it came from the cache
 */
export async function getOrCompute<T>(
  kv: KVNamespace,
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
): Promise<{ value: T; hit: boolean }> {
  const cached = await kv.get<T>(key, "json");
  if (cached !== null) return { value: cached, hit: true };

  const value = await compute();
  await kv.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds });
  return { value, hit: false };
}