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
  return (
    asset.assetType ||
    asset.type ||
    "unknown"
  );
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
  // MISSING ADDRESS
  // --------------------------------------------------

  const address =
    asset.address ||
    asset.fullAddress ||
    asset.propertyAddress;

  if (!address || String(address).trim() === "") {
    issues.push("Missing address");
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