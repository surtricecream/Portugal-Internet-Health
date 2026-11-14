/**
 * Base URL for the Cloudflare Radar HTTP timeseries endpoint.
 */
const RADAR_URL = "https://api.cloudflare.com/client/v4/radar/http/timeseries";

/**
 * Supported time windows. Each key is a public API value that maps to a Radar
 * date range, an aggregation interval and a cache TTL (in seconds).
 *
 * Radar rejects fine aggregation intervals for long date ranges, so hourly
 * points are used up to 30 days and weekly points for 6 months (26w) and
 * 1 year (52w). The keys must match the buttons in public/index.html.
 */
export const RANGES = {
  "1d":  { dateRange: "1d",  aggInterval: "1h", ttl: 900 },
  "7d":  { dateRange: "7d",  aggInterval: "1h", ttl: 3600 },
  "30d": { dateRange: "30d", aggInterval: "1h", ttl: 3600 },
  "6m":  { dateRange: "26w", aggInterval: "1w", ttl: 21600 },
  "1y":  { dateRange: "52w", aggInterval: "1w", ttl: 21600 },
} as const;

/**
 * Valid range keys accepted by the Radar client.
 */
export type RangeKey = keyof typeof RANGES;

/**
 * Checks whether a string is a supported range key.
 *
 * Uses Object.keys instead of the `in` operator so inherited properties
 * such as "toString" are not accepted.
 *
 * @param value Candidate value to validate.
 * @returns `true` when the value is one of the keys of `RANGES`.
 */
export function isRangeKey(value: string): value is RangeKey {
  return Object.keys(RANGES).includes(value);
}

/**
 * The subset of Radar's HTTP timeseries response that this code relies on.
 *
 * Fields that are not used here are omitted on purpose. `values` may arrive
 * as numbers or as numeric strings, so both are accepted.
 */
interface RadarTimeseries {
  success: boolean;
  result?: {
    serie_0: { timestamps: string[]; values: (string | number)[] };
    meta: {
      dateRange: { startTime: string; endTime: string }[];
      lastUpdated: string;
      aggInterval: string;
      normalization: string;
    };
  };
}

/**
 * Traffic data for Portugal in the selected time window, in the format
 * this app exposes through its own API.
 *
 * Values are a relative index normalized within the requested window, so
 * they are not comparable across different ranges.
 */
export interface TrafficResponse {
  location: string;
  description: string;
  normalization: string;
  interval: string;
  range: { start: string; end: string };
  updated: string;
  points: { t: string; v: number }[];
}

/**
 * Raised when the Radar API cannot be reached, returns an error status,
 * or returns data that is invalid or inconsistent.
 */
export class UpstreamError extends Error {}

/**
 * Fetches Portugal HTTP traffic data from Cloudflare Radar and reshapes it
 * into the app's own response format.
 *
 * @param token Cloudflare API token, sent as a Bearer token.
 * @param range Supported time window identifier.
 * @returns Traffic data for Portugal in the requested window.
 * @throws UpstreamError If Radar cannot be reached, responds with a non-OK
 * status, returns invalid JSON, reports `success: false`, or returns
 * timestamps and values of different lengths.
 * @note Values are normalized within the selected window and are not meant
 * to be compared across different date ranges.
 */
export async function fetchTraffic(
  token: string,
  range: RangeKey,
): Promise<TrafficResponse> {
  const { dateRange, aggInterval } = RANGES[range];
  const params = new URLSearchParams({
    location: "PT",
    dateRange,
    aggInterval,
    format: "json",
  });

  let res: Response;
  try {
    res = await fetch(`${RADAR_URL}?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new UpstreamError("Could not reach Radar");
  }

  if (!res.ok) {
    throw new UpstreamError(`Radar responded with HTTP ${res.status}`);
  }

  let raw: RadarTimeseries;
  try {
    raw = (await res.json()) as RadarTimeseries;
  } catch {
    throw new UpstreamError("Radar returned invalid JSON");
  }

  // Radar can return HTTP 200 with success: false
  if (!raw.success || !raw.result) {
    throw new UpstreamError("Radar returned an unsuccessful response");
  }

  const { serie_0, meta } = raw.result;

  // map() below would silently misalign points if the arrays differ in length
  if (serie_0.timestamps.length !== serie_0.values.length) {
    throw new UpstreamError("Radar timestamps and values do not match");
  }

  return {
    location: "PT",
    description: "Relative HTTP traffic index (normalized within this window)",
    normalization: meta.normalization,
    interval: meta.aggInterval,
    range: {
      start: meta.dateRange[0].startTime,
      end: meta.dateRange[0].endTime,
    },
    updated: meta.lastUpdated,
    points: serie_0.timestamps.map((t, i) => ({
      t,
      // values may arrive as numeric strings
      v: Number(serie_0.values[i]),
    })),
  };
}