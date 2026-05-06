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
    asset?.id ||
    asset?.assetId ||
    "unknown"
  );
}

function getAssetType(asset: any): string {
  return String(
    asset?.assetType ||
    asset?.type ||
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

function isDropAsset(asset: any): boolean {
  return (
    getAssetType(asset) === "drop" ||
    (
      getAssetType(asset) === "cable" &&
      String(asset?.cableType || "").toLowerCase() === "drop"
    )
  );
}

function isLocationAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "joint",
    "cabinet",
    "splitter",
    "pole",
    "chamber",
    "distribution-point",
    "dp",
    "afn",
  ].includes(type);
}

function isDistributionPointAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "distribution-point",
    "dp",
    "afn",
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

function getHomeKey(asset: any): string {
  return String(
    asset?.id ??
      asset?.assetId ??
      asset?.homeId ??
      asset?.uprn ??
      asset?.UPRN ??
      asset?.properties?.UPRN ??
      asset?.properties?.uprn ??
      ""
  ).trim();
}

function getConnectedDpId(asset: any): string {
  return String(
    asset?.connectedDpId ??
      asset?.properties?.connectedDpId ??
      ""
  ).trim();
}

function getDropDpId(drop: any): string {
  return String(
    drop?.dpId ??
      drop?.fromAssetId ??
      drop?.connectedDpId ??
      ""
  ).trim();
}

function getDropHomeId(drop: any): string {
  return String(
    drop?.homeId ??
      drop?.toAssetId ??
      drop?.connectedHomeId ??
      drop?.uprn ??
      drop?.UPRN ??
      ""
  ).trim();
}

function keysMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a === `uprn-${b}`) return true;
  if (`uprn-${a}` === b) return true;
  return false;
}

function getDpCapacity(dp: any): number {
  const capacity =
    Number(dp?.capacity) ||
    Number(dp?.dpCapacity) ||
    Number(dp?.afnCapacity) ||
    Number(dp?.ports) ||
    16;

  return Math.max(0, capacity);
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
  // of address fields. Auto-generated drops are validated separately
  // in auditAreaAssets, so they are excluded from this PIA NOI check.

  if (
    isCableAsset(asset) &&
    !isDropAsset(asset) &&
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
  const validAssets = assets.filter(Boolean);

  // --------------------------------------------------
  // BASIC ASSET CHECKS
  // --------------------------------------------------

  for (const asset of validAssets) {
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

  for (const asset of validAssets) {
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

  const graph = buildNetworkGraph(validAssets);

  const disconnected =
    findDisconnectedAssets(graph);

  for (const node of disconnected) {
    issues.push({
      assetId: node.id,
      assetType: getAssetType(node.asset),
      issue: "Disconnected asset",
    });
  }

  // --------------------------------------------------
  // DP / DROP / HOME CONNECTION QA CHECKS
  // --------------------------------------------------

  const homes = validAssets.filter((asset: any) =>
    isHomeAsset(asset) ||
    Boolean(asset?.properties?.UPRN) ||
    Boolean(asset?.UPRN) ||
    Boolean(asset?.uprn)
  );

  const drops = validAssets.filter((asset: any) =>
    isDropAsset(asset)
  );

  const dps = validAssets.filter((asset: any) =>
    isDistributionPointAsset(asset)
  );

  const assetsById = new Map<string, any>();
  const homesByKey = new Map<string, any>();

  for (const asset of validAssets) {
    const id = getAssetId(asset);
    if (id && id !== "unknown") {
      assetsById.set(String(id), asset);
    }
  }

  for (const home of homes) {
    const key = getHomeKey(home);
    if (!key) continue;

    homesByKey.set(key, home);

    if (!key.startsWith("uprn-")) {
      homesByKey.set(`uprn-${key}`, home);
    }
  }

  for (const drop of drops) {
    const dropId = getAssetId(drop);
    const dpId = getDropDpId(drop);
    const homeId = getDropHomeId(drop);

    if (!dpId || !assetsById.has(dpId)) {
      issues.push({
        assetId: dropId,
        assetType: getAssetType(drop),
        issue: "Drop references missing DP",
      });
    }

    if (!homeId || !homesByKey.has(homeId)) {
      issues.push({
        assetId: dropId,
        assetType: getAssetType(drop),
        issue: "Drop references missing home",
      });
    }

    const distanceM = Number(drop?.distanceM);

    if (Number.isFinite(distanceM) && distanceM > 68) {
      issues.push({
        assetId: dropId,
        assetType: getAssetType(drop),
        issue: `Drop exceeds 68m (${Math.round(distanceM)}m)`,
      });
    }
  }

  for (const home of homes) {
    const connectedDpId = getConnectedDpId(home);
    if (!connectedDpId) continue;

    const homeKey = getHomeKey(home);

    const hasDrop = drops.some((drop: any) =>
      keysMatch(getDropHomeId(drop), homeKey) &&
      getDropDpId(drop) === connectedDpId
    );

    if (!hasDrop) {
      issues.push({
        assetId: getAssetId(home),
        assetType: getAssetType(home),
        issue: "Connected home has no drop cable",
      });
    }

    if (!assetsById.has(connectedDpId)) {
      issues.push({
        assetId: getAssetId(home),
        assetType: getAssetType(home),
        issue: "Home connected to missing DP",
      });
    }
  }

  for (const dp of dps) {
    const dpId = getAssetId(dp);
    const capacity = getDpCapacity(dp);

    const usedPorts = homes.filter((home: any) =>
      getConnectedDpId(home) === dpId
    ).length;

    if (usedPorts > capacity) {
      issues.push({
        assetId: dpId,
        assetType: getAssetType(dp),
        issue: `DP over capacity (${usedPorts}/${capacity})`,
      });
    }
  }

  return issues;
}
