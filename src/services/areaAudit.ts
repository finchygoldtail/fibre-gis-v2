import {
  buildNetworkGraph,
  findDisconnectedAssets,
} from "./networkGraph";

export type AuditIssue = {
  assetId: string;
  assetType: string;
  issue: string;
};

function getAssetId(asset: any): string {
  return (
    asset.id ||
    asset.assetId ||
    "unknown"
  );
}

function getAssetType(asset: any): string {
  return String(
    asset.assetType ||
    asset.type ||
    "unknown"
  ).toLowerCase();
}

function hasText(value: unknown): boolean {
  return value !== undefined &&
    value !== null &&
    String(value).trim() !== "";
}

function hasAnyText(asset: any, fields: string[]): boolean {
  return fields.some((field) => hasText(asset?.[field]));
}

function isHomeAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "home",
    "premise",
    "premises",
    "property",
    "building",
  ].includes(type);
}

function isCableAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "cable",
    "drop",
    "duct",
  ].includes(type);
}

function isLocationAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "joint",
    "cabinet",
    "splitter",
    "pole",
    "chamber",
  ].includes(type);
}

function hasValidCoordinates(asset: any): boolean {
  const geometry = asset?.geometry;

  if (!geometry) return false;

  if (
    geometry.type === "Point" &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates.length >= 2;
  }

  if (
    geometry.type === "LineString" &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates.length >= 2;
  }

  if (
    geometry.type === "Polygon" &&
    Array.isArray(geometry.coordinates)
  ) {
    return geometry.coordinates.length > 0;
  }

  return false;
}

export function auditAsset(
  asset: any
): string[] {
  const issues: string[] = [];

  // --------------------------------------------------
  // HOME / PREMISE ADDRESS CHECKS
  // --------------------------------------------------
  // Only homes/premises should be required to have a true address.
  // Network assets such as joints and cables usually do not have one.

  if (
    isHomeAsset(asset) &&
    !hasAnyText(asset, [
      "address",
      "fullAddress",
      "propertyAddress",
    ])
  ) {
    issues.push("Missing address");
  }

  // --------------------------------------------------
  // CABLE / DROP REFERENCE CHECKS
  // --------------------------------------------------
  // Cables should be checked against fibre/planning metadata instead
  // of address fields.

  if (
    isCableAsset(asset) &&
    !hasAnyText(asset, [
      "piaNoiNumber",
      "piaNOINumber",
      "noiNumber",
      "ductRef",
      "routeRef",
    ])
  ) {
    issues.push("Missing PIA NOI");
  }

  // --------------------------------------------------
  // JOINT / CABINET / POLE / CHAMBER LOCATION CHECKS
  // --------------------------------------------------
  // These assets may not have postal addresses, but a human-readable
  // location note is useful for field QA.

  if (
    isLocationAsset(asset) &&
    !hasAnyText(asset, [
      "locationDescription",
      "location",
      "nearestAddress",
      "roadName",
      "notes",
    ])
  ) {
    issues.push("Missing location description");
  }

  // --------------------------------------------------
  // MISSING COORDINATES
  // --------------------------------------------------

  if (!hasValidCoordinates(asset)) {
    issues.push("Missing coordinates");
  }

  return issues;
}

export function auditAreaAssets(
  assets: any[] = []
): AuditIssue[] {
  const issues: AuditIssue[] = [];

  // --------------------------------------------------
  // BASIC ASSET CHECKS
  // --------------------------------------------------

  for (const asset of assets) {
    const assetIssues = auditAsset(asset);

    for (const issue of assetIssues) {
      issues.push({
        assetId: getAssetId(asset),
        assetType: getAssetType(asset),
        issue,
      });
    }
  }

  // --------------------------------------------------
  // DUPLICATE IDS
  // --------------------------------------------------

  const seen = new Map<string, number>();

  for (const asset of assets) {
    const id = getAssetId(asset);

    seen.set(id, (seen.get(id) || 0) + 1);
  }

  for (const [id, count] of seen.entries()) {
    if (count > 1) {
      issues.push({
        assetId: id,
        assetType: "unknown",
        issue: "Duplicate asset ID",
      });
    }
  }

  // --------------------------------------------------
  // DISCONNECTED ASSETS
  // --------------------------------------------------

  const graph = buildNetworkGraph(assets);

  const disconnected =
    findDisconnectedAssets(graph);

  for (const node of disconnected) {
    issues.push({
      assetId: node.id,
      assetType: getAssetType(node.asset),
      issue: "Disconnected asset",
    });
  }

  return issues;
}
