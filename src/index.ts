import { fetchTraffic, UpstreamError, RANGES, isRangeKey } from "./radar";
import { getOrCompute } from "./cache";

/**
 * Cloudflare Worker entrypoint that exposes the traffic endpoint.
 *
 * Routes:
 * - GET /api/traffic -> latest Portugal traffic index from Cloudflare Radar,
 *   served from KV when cached (1 hour TTL). The X-Cache response header
 *   is HIT when served from cache and MISS when freshly fetched.
 * - any other path -> 404 JSON response
 *
 * If the upstream Radar API fails, the worker returns a 502 with a generic error.
 * Unexpected application errors are re-thrown so they surface in logs.
 */
export default {
    /**
   * Handles incoming HTTP requests.
   *
   * @param request Incoming Request object
   * @param env Worker environment bindings, including RADAR_TOKEN
   * @returns HTTP Response for the requested route
   */
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/traffic") {
      const range = url.searchParams.get("range") ?? "7d";
      if (!isRangeKey(range)) {
        return Response.json(
          { error: "invalid range", allowed: Object.keys(RANGES) },
          { status: 400 },
        );
      }
      try {
        const { value, hit } = await getOrCompute(
          env.CACHE,
          `traffic:PT:${range}`,
          RANGES[range].ttl,
          () => fetchTraffic(env.RADAR_TOKEN, range),
        );
        return Response.json(value, { headers: { "X-Cache": hit ? "HIT" : "MISS" } });
      } catch (err) {
        if (err instanceof UpstreamError) {
          console.error(err.message);
          return Response.json({ error: "upstream failed" }, { status: 502 });
        }
        throw err;
      }
    }

    return Response.json({ error: "not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;