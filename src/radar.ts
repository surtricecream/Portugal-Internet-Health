const RADAR_URL = "https://api.cloudflare.com/client/v4/radar/http/timeseries";

/**
 * Raw payload returned by Cloudflare Radar's HTTP timeseries endpoint.
 * This mirrors the upstream API shape, so we keep it intentionally loose
 * and validate it before exposing it to the rest of the app.
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
 * Normalized traffic data for a given region and time window.
 * The values are the relative HTTP traffic index returned by Radar,
 * converted into a simpler shape for the app to consume.
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

export class UpstreamError extends Error {}


/**
 * Fetches recent HTTP traffic data for Portugal from Cloudflare Radar.
 *
 * @param token Cloudflare API token used for Authorization
 * @returns Normalized traffic data for the last 7 days
 * @throws UpstreamError when the upstream API fails or returns invalid data
 */
export async function fetchTraffic(token: string): Promise<TrafficResponse> {
  const params = new URLSearchParams({
    location: "PT",
    dateRange: "7d",
    aggInterval: "1h",
    format: "json",
  });

  const res = await fetch(`${RADAR_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new UpstreamError(`Radar responded with HTTP ${res.status}`);
  }

  const raw = (await res.json()) as RadarTimeseries;
  if (!raw.success || !raw.result) {
    throw new UpstreamError("Radar returned an unsuccessful response");
  }

  const { serie_0, meta } = raw.result;
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
      v: Number(serie_0.values[i]),
    })),
  };
}