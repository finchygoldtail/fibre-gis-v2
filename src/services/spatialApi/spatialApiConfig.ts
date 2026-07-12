export type SpatialApiConfig = {
  enabled: boolean;
  writesEnabled: boolean;
  mapSource: "firestore" | "dual" | "postgis";
  postgisOnly: boolean;
  baseUrl: string;
};

function readSpatialApiEnabled(): boolean {
  return String(import.meta.env.VITE_SPATIAL_API_ENABLED ?? "false").toLowerCase() === "true";
}

function readSpatialApiWritesEnabled(): boolean {
  return String(import.meta.env.VITE_SPATIAL_API_WRITES_ENABLED ?? "false").toLowerCase() === "true";
}

function readMapSource(): SpatialApiConfig["mapSource"] {
  const value = String(import.meta.env.VITE_MAP_DATA_SOURCE ?? "dual").toLowerCase();
  if (value === "firestore" || value === "postgis" || value === "dual") return value;
  return "dual";
}

const mapSource = readMapSource();

export const spatialApiConfig: SpatialApiConfig = {
  enabled: readSpatialApiEnabled(),
  writesEnabled: readSpatialApiWritesEnabled(),
  mapSource,
  postgisOnly: mapSource === "postgis",
  baseUrl: String(import.meta.env.VITE_SPATIAL_API_URL ?? "http://localhost:3001").replace(
    /\/+$/,
    "",
  ),
};
