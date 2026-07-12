import type { GeoJsonGeometry } from "./geojson.js";

export type WritableMapAsset = {
  id?: string;
  businessId: string;
  projectId?: string | null;
  areaId?: string | null;
  assetType: string;
  assetSubtype?: string | null;
  name?: string | null;
  status?: string | null;
  geometry: GeoJsonGeometry;
  metadata?: Record<string, unknown>;
  source?: string | null;
  sourceRevision?: string | null;
};

export type AssetWriteActor = {
  uid?: string | null;
  email?: string | null;
};
