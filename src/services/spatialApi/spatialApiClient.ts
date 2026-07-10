import { spatialApiConfig } from "./spatialApiConfig";

export type SpatialApiRequestOptions = {
  signal?: AbortSignal;
  token?: string;
};

export async function spatialApiGet<T>(
  path: string,
  params: URLSearchParams,
  options: SpatialApiRequestOptions = {},
): Promise<T> {
  if (!spatialApiConfig.enabled) {
    throw new Error("Spatial API is disabled. Set VITE_SPATIAL_API_ENABLED=true to enable it.");
  }

  const response = await fetch(`${spatialApiConfig.baseUrl}${path}?${params.toString()}`, {
    method: "GET",
    signal: options.signal,
    headers: options.token
      ? {
          Authorization: `Bearer ${options.token}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`Spatial API request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
