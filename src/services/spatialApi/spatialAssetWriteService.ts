import type { SavedMapAsset } from "../../components/map/types";
import { spatialApiConfig } from "./spatialApiConfig";
import { spatialApiJson } from "./spatialApiClient";
import type { SpatialApiFeature, SpatialApiGeometry } from "./spatialApiTypes";

type SaveSpatialAssetsOptions = {
  businessId: string;
  projectId?: string | null;
  areaId?: string | null;
  reason: string;
};

export async function saveSpatialMapAssets(
  assets: SavedMapAsset[],
  options: SaveSpatialAssetsOptions,
): Promise<SpatialApiFeature[]> {
  if (!spatialApiConfig.enabled || !spatialApiConfig.writesEnabled) {
    throw new Error("Spatial API writes are disabled.");
  }

  const writableAssets = assets
    .map((asset) => toWritableSpatialAsset(asset, options))
    .filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));

  const saved: SpatialApiFeature[] = [];

  for (const asset of writableAssets) {
    saved.push(
      await spatialApiJson<SpatialApiFeature>("/api/assets", {
        method: "POST",
        body: {
          ...asset,
          reason: options.reason,
        },
      }),
    );
  }

  return saved;
}

export async function deleteSpatialMapAsset(
  assetId: string,
  options: { businessId: string; reason?: string },
): Promise<{ deleted: true; id: string }> {
  if (!spatialApiConfig.enabled || !spatialApiConfig.writesEnabled) {
    throw new Error("Spatial API writes are disabled.");
  }

  const params = new URLSearchParams({
    businessId: options.businessId,
  });

  if (options.reason) params.set("reason", options.reason);

  return spatialApiJson<{ deleted: true; id: string }>(
    `/api/assets/${toStablePostgisId(assetId)}`,
    {
      method: "DELETE",
      params,
    },
  );
}

function toWritableSpatialAsset(
  asset: SavedMapAsset,
  options: SaveSpatialAssetsOptions,
) {
  const geometry = toSpatialGeometry(asset.geometry);
  if (!geometry) return null;
  const { originalAsset: _originalAsset, ...importedProperties } =
    asset.importedProperties || {};
  const originalAsset = {
    ...asset,
    importedProperties,
  };

  return {
    id: toStablePostgisId(asset.id),
    businessId: options.businessId,
    projectId: options.projectId || getString(asset.importedProperties?.projectId),
    areaId: options.areaId || getAssetAreaId(asset),
    assetType: normaliseAssetType(asset.assetType || asset.jointType),
    assetSubtype: asset.referenceSubtype || asset.jointType || null,
    name: asset.name || null,
    status: asset.status || null,
    geometry,
    metadata: {
      ...importedProperties,
      originalAsset,
    },
    source: "alistra-app",
    sourceRevision: "frontend-save",
  };
}

function toSpatialGeometry(geometry: SavedMapAsset["geometry"] | undefined): SpatialApiGeometry | null {
  if (!geometry) return null;

  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: latLngToLngLat(geometry.coordinates),
    };
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geometry.coordinates.map(latLngToLngLat),
    };
  }

  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(latLngToLngLat)),
    };
  }

  return null;
}

function latLngToLngLat(position: [number, number]): [number, number] {
  const [lat, lng] = position;
  return [lng, lat];
}

export function toStablePostgisId(value: string): string {
  const postgisId = String(value || "unknown-asset").replace(/^postgis:/, "");
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(postgisId)) {
    return postgisId;
  }

  return stableUuid(`fibre-gis-v2:alistra-app:${postgisId}`);
}

function stableUuid(value: string): string {
  const seed = value || "unknown-asset";
  let hash = 2166136261;
  const hex = Array.from({ length: 32 }, (_, index) => {
    hash ^= seed.charCodeAt(index % seed.length) + index;
    hash = Math.imul(hash, 16777619);
    return ((hash >>> ((index % 4) * 8)) & 0xff).toString(16).padStart(2, "0");
  }).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function normaliseAssetType(value: unknown): string {
  const raw = String(value || "").trim();
  if (!raw) return "unknown";
  if (raw === "distribution point") return "distribution-point";
  return raw.replace(/[\s_]+/g, "-");
}

function getAssetAreaId(asset: SavedMapAsset): string | null {
  return (
    getString(asset.importedProperties?.areaId) ||
    getString(asset.importedProperties?.area_id) ||
    getString((asset as any).areaId) ||
    null
  );
}

function getString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}
