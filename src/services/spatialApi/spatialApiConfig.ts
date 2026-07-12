export type SpatialApiConfig = {
  enabled: boolean;
  writesEnabled: boolean;
  baseUrl: string;
};

function readSpatialApiEnabled(): boolean {
  return String(import.meta.env.VITE_SPATIAL_API_ENABLED ?? "false").toLowerCase() === "true";
}

function readSpatialApiWritesEnabled(): boolean {
  return String(import.meta.env.VITE_SPATIAL_API_WRITES_ENABLED ?? "false").toLowerCase() === "true";
}

export const spatialApiConfig: SpatialApiConfig = {
  enabled: readSpatialApiEnabled(),
  writesEnabled: readSpatialApiWritesEnabled(),
  baseUrl: String(import.meta.env.VITE_SPATIAL_API_URL ?? "http://localhost:3001").replace(
    /\/+$/,
    "",
  ),
};
