import type { SavedMapAsset } from "../../components/map/types";
import type { SpatialApiFeature, SpatialApiGeometry } from "./spatialApiTypes";

const SOURCE = "postgis";

export function isSpatialApiAsset(asset: SavedMapAsset | null | undefined): boolean {
  return String((asset as any)?.source || "").toLowerCase() === SOURCE;
}

export function spatialFeatureToMapAsset(feature: SpatialApiFeature): SavedMapAsset | null {
  const geometry = convertGeometry(feature.geometry);
  if (!geometry) return null;

  const assetType = mapAssetType(feature.properties.assetType);
  const metadata = feature.properties.metadata || {};

  return {
    id: `postgis:${feature.id}`,
    name: feature.properties.name || feature.id,
    assetType,
    jointType: getJointType(assetType, feature.properties.assetSubtype),
    status: (feature.properties.status as SavedMapAsset["status"]) || "",
    source: SOURCE,
    readOnly: true,
    notes: "Loaded read-only from the spatial API.",
    geometry,
    importedProperties: {
      ...metadata,
      postgisId: feature.id,
      businessId: feature.properties.businessId,
      projectId: feature.properties.projectId,
      areaId: feature.properties.areaId,
      assetSubtype: feature.properties.assetSubtype,
      sourceRevision: feature.properties.sourceRevision,
    },
  } as SavedMapAsset;
}

function mapAssetType(value: string): SavedMapAsset["assetType"] {
  const normalised = value.trim().toLowerCase();

  if (normalised === "dp") return "distribution-point";
  if (normalised === "feedercable" || normalised === "linkcable" || normalised === "cable") {
    return "cable";
  }

  return value as SavedMapAsset["assetType"];
}

function getJointType(assetType: SavedMapAsset["assetType"], subtype: string | null): string {
  if (assetType === "distribution-point") return subtype || "Distribution Point";
  if (assetType === "pole") return subtype || "Pole";
  if (assetType === "chamber") return subtype || "Chamber";
  if (assetType === "cable") return subtype || "Cable";
  if (assetType === "home") return subtype || "Home";
  return subtype || "Spatial Asset";
}

function convertGeometry(geometry: SpatialApiGeometry): SavedMapAsset["geometry"] | null {
  if (geometry.type === "Point") {
    return {
      type: "Point",
      coordinates: lngLatToLatLng(geometry.coordinates),
    };
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geometry.coordinates.map(lngLatToLatLng),
    };
  }

  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(lngLatToLatLng)),
    };
  }

  return null;
}

function lngLatToLatLng(position: [number, number]): [number, number] {
  const [lng, lat] = position;
  return [lat, lng];
}
