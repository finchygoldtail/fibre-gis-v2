import { auth } from "../../firebase";
import { spatialApiConfig } from "./spatialApiConfig";

export type SpatialApiRequestOptions = {
  signal?: AbortSignal;
  token?: string;
};

type SpatialApiJsonOptions = SpatialApiRequestOptions & {
  method?: "POST" | "PUT" | "DELETE";
  body?: unknown;
  params?: URLSearchParams;
};

export async function spatialApiGet<T>(
  path: string,
  params: URLSearchParams,
  options: SpatialApiRequestOptions = {},
): Promise<T> {
  if (!spatialApiConfig.enabled) {
    throw new Error("Spatial API is disabled. Set VITE_SPATIAL_API_ENABLED=true to enable it.");
  }

  const token = options.token || (await auth.currentUser?.getIdToken());

  const response = await fetch(`${spatialApiConfig.baseUrl}${path}?${params.toString()}`, {
    method: "GET",
    signal: options.signal,
    headers: token
      ? {
          Authorization: `Bearer ${token}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`Spatial API request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function spatialApiJson<T>(
  path: string,
  options: SpatialApiJsonOptions = {},
): Promise<T> {
  if (!spatialApiConfig.enabled) {
    throw new Error("Spatial API is disabled. Set VITE_SPATIAL_API_ENABLED=true to enable it.");
  }

  const token = options.token || (await auth.currentUser?.getIdToken());
  const query = options.params ? `?${options.params.toString()}` : "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) headers.Authorization = `Bearer ${token}`;
  if (auth.currentUser?.uid) headers["X-Alistra-User-Uid"] = auth.currentUser.uid;
  if (auth.currentUser?.email) headers["X-Alistra-User-Email"] = auth.currentUser.email;

  const response = await fetch(`${spatialApiConfig.baseUrl}${path}${query}`, {
    method: options.method || "POST",
    signal: options.signal,
    headers,
    body: typeof options.body === "undefined" ? undefined : JSON.stringify(options.body),
  });

  if (!response.ok) {
    throw new Error(`Spatial API request failed with ${response.status}`);
  }

  return (await response.json()) as T;
}
