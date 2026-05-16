import { buildNetworkGraph, findDisconnectedAssets } from "./networkGraph";

export type AuditSeverity = "high" | "medium" | "low";

export type AuditIssue = {
  assetId: string;
  assetType: string;
  assetName?: string;
  issue: string;
  severity: AuditSeverity;
  category: string;
  asset?: any;
};

type Coordinate = [number, number];

function getAssetId(asset: any): string {
  return String(asset?.id || asset?.assetId || "unknown");
}

function getAssetName(asset: any): string {
  return String(
    asset?.name ||
      asset?.assetName ||
      asset?.cableId ||
      asset?.cableName ||
      asset?.jointId ||
      asset?.dpId ||
      asset?.properties?.name ||
      getAssetId(asset),
  );
}

function getAssetType(asset: any): string {
  return String(asset?.assetType || asset?.type || "unknown").toLowerCase();
}

function hasText(value: unknown): boolean {
  return value !== undefined && value !== null && String(value).trim() !== "";
}

function hasAnyText(asset: any, fields: string[]): boolean {
  return fields.some((field) =>
    hasText(asset?.[field] ?? asset?.properties?.[field]),
  );
}

function getFirstText(asset: any, fields: string[]): string {
  for (const field of fields) {
    const value = asset?.[field] ?? asset?.properties?.[field];
    if (hasText(value)) return String(value).trim();
  }

  return "";
}

function parseNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isHomeAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return ["home", "premise", "premises", "property", "building"].includes(type);
}

function isCableAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return ["cable", "drop", "duct"].includes(type);
}

function isDropAsset(asset: any): boolean {
  return (
    getAssetType(asset) === "drop" ||
    (getAssetType(asset) === "cable" &&
      String(
        asset?.cableType || asset?.properties?.cableType || "",
      ).toLowerCase() === "drop")
  );
}

function isJointAsset(asset: any): boolean {
  const type = getAssetType(asset);
  const jointType = String(
    asset?.jointType || asset?.properties?.jointType || "",
  ).toLowerCase();

  return (
    type === "joint" ||
    type === "ag-joint" ||
    type === "lmj" ||
    type === "cmj" ||
    jointType.includes("joint") ||
    jointType === "lmj" ||
    jointType === "cmj"
  );
}

function isLocationAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "joint",
    "ag-joint",
    "lmj",
    "cmj",
    "cabinet",
    "street-cabinet",
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

  return ["distribution-point", "dp", "afn", "cbt"].includes(type);
}

function isNetworkNodeAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return (
    isJointAsset(asset) ||
    isDistributionPointAsset(asset) ||
    ["pole", "chamber", "cabinet", "street-cabinet", "splitter"].includes(type)
  );
}

function hasValidCoordinates(asset: any): boolean {
  const geometry = asset?.geometry;

  if (!geometry) return false;

  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length >= 2;
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length >= 2;
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.length > 0;
  }

  return false;
}

function normalisePoint(point: unknown): Coordinate | null {
  if (!Array.isArray(point) || point.length < 2) return null;

  const first = Number(point[0]);
  const second = Number(point[1]);

  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

  // Most of the map code stores Leaflet-style [lat, lng].
  return [first, second];
}

function getAssetCoordinates(asset: any): Coordinate[] {
  const geometry = asset?.geometry;

  if (!geometry) return [];

  if (geometry.type === "Point") {
    const point = normalisePoint(geometry.coordinates);
    return point ? [point] : [];
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates
      .map(normalisePoint)
      .filter(Boolean) as Coordinate[];
  }

  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates?.[0])) {
    return geometry.coordinates[0]
      .map(normalisePoint)
      .filter(Boolean) as Coordinate[];
  }

  return [];
}

function getPointCoordinate(asset: any): Coordinate | null {
  const coords = getAssetCoordinates(asset);
  return coords[0] ?? null;
}

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
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
      "",
  ).trim();
}

function getConnectedDpId(asset: any): string {
  return String(
    asset?.connectedDpId ?? asset?.properties?.connectedDpId ?? "",
  ).trim();
}

function getDropDpId(drop: any): string {
  return String(
    drop?.dpId ??
      drop?.fromAssetId ??
      drop?.connectedDpId ??
      drop?.properties?.dpId ??
      drop?.properties?.fromAssetId ??
      drop?.properties?.connectedDpId ??
      "",
  ).trim();
}

function getDropHomeId(drop: any): string {
  return String(
    drop?.homeId ??
      drop?.toAssetId ??
      drop?.connectedHomeId ??
      drop?.uprn ??
      drop?.UPRN ??
      drop?.properties?.homeId ??
      drop?.properties?.toAssetId ??
      drop?.properties?.connectedHomeId ??
      drop?.properties?.uprn ??
      drop?.properties?.UPRN ??
      "",
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
    Number(dp?.properties?.capacity) ||
    Number(dp?.properties?.dpCapacity) ||
    Number(dp?.properties?.afnCapacity) ||
    Number(dp?.properties?.ports) ||
    16;

  return Math.max(0, capacity);
}

function getCableCapacity(asset: any): number {
  return parseNumber(
    asset?.fibreCount ??
      asset?.fiberCount ??
      asset?.coreCount ??
      asset?.size ??
      asset?.properties?.fibreCount ??
      asset?.properties?.fiberCount ??
      asset?.properties?.coreCount ??
      asset?.properties?.size,
  );
}

function getCableUsedFibres(asset: any): number {
  return parseNumber(
    asset?.usedFibres ??
      asset?.usedFibers ??
      asset?.usedCoreCount ??
      asset?.fibresUsed ??
      asset?.allocatedFibres ??
      asset?.properties?.usedFibres ??
      asset?.properties?.usedFibers ??
      asset?.properties?.usedCoreCount ??
      asset?.properties?.fibresUsed ??
      asset?.properties?.allocatedFibres,
  );
}

function getIssueSeverity(issue: string, asset?: any): AuditSeverity {
  const text = issue.toLowerCase();

  if (
    text.includes("disconnected") ||
    text.includes("missing dp") ||
    text.includes("missing home") ||
    text.includes("home connected to missing dp") ||
    text.includes("connected home has no drop") ||
    text.includes("over capacity") ||
    text.includes("endpoint not snapped") ||
    text.includes("duplicate asset id") ||
    text.includes("fibres exceed")
  ) {
    return "high";
  }

  if (
    text.includes("pia") ||
    text.includes("noi") ||
    text.includes("install method") ||
    text.includes("fibre count") ||
    text.includes("drop exceeds") ||
    text.includes("missing coordinates") ||
    text.includes("joint has no fibre mapping")
  ) {
    return "medium";
  }

  if (asset && isCableAsset(asset) && !isDropAsset(asset)) {
    return "medium";
  }

  return "low";
}

function getIssueCategory(issue: string): string {
  const text = issue.toLowerCase();

  if (text.includes("pia") || text.includes("noi")) return "PIA / NOI";
  if (text.includes("drop") || text.includes("home") || text.includes("dp"))
    return "DP / Homes";
  if (text.includes("disconnected") || text.includes("snapped"))
    return "Topology";
  if (text.includes("capacity") || text.includes("fibres exceed"))
    return "Capacity";
  if (
    text.includes("fibre") ||
    text.includes("mapping") ||
    text.includes("tray")
  )
    return "Fibre Mapping";
  if (text.includes("coordinate") || text.includes("location"))
    return "Field Data";
  if (text.includes("duplicate")) return "Data Quality";

  return "General";
}

function makeIssue(
  asset: any,
  issue: string,
  overrides: Partial<AuditIssue> = {},
): AuditIssue {
  const assetId = overrides.assetId ?? getAssetId(asset);
  const assetType = overrides.assetType ?? getAssetType(asset);
  const severity = overrides.severity ?? getIssueSeverity(issue, asset);

  return {
    assetId,
    assetType,
    assetName: overrides.assetName ?? getAssetName(asset),
    issue,
    severity,
    category: overrides.category ?? getIssueCategory(issue),
    asset: overrides.asset ?? asset,
  };
}

export function auditAsset(asset: any): string[] {
  const issues: string[] = [];

  // --------------------------------------------------
  // HOME / PREMISE ADDRESS CHECKS
  // --------------------------------------------------
  // Only homes/premises should be required to have a true address.
  // Network assets such as joints and cables usually do not have one.

  if (
    isHomeAsset(asset) &&
    !hasAnyText(asset, ["address", "fullAddress", "propertyAddress"])
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
      "piaNoi",
      "pia",
      "noi",
      "noiNumber",
      "ductRef",
      "routeRef",
    ])
  ) {
    issues.push("Missing PIA NOI");
  }

  if (
    isCableAsset(asset) &&
    !isDropAsset(asset) &&
    !hasAnyText(asset, ["installMethod", "method", "routeType"])
  ) {
    issues.push("Missing install method");
  }

  if (
    isCableAsset(asset) &&
    !isDropAsset(asset) &&
    getCableCapacity(asset) <= 0
  ) {
    issues.push("Missing fibre count");
  }

  if (
    isCableAsset(asset) &&
    !isDropAsset(asset) &&
    getCableCapacity(asset) > 0 &&
    getCableUsedFibres(asset) > getCableCapacity(asset)
  ) {
    issues.push(
      `Used fibres exceed cable size (${getCableUsedFibres(asset)}/${getCableCapacity(asset)})`,
    );
  }

  // --------------------------------------------------
  // JOINT / CABINET / POLE / CHAMBER LOCATION CHECKS
  // --------------------------------------------------
  // These assets may not have postal addresses, but a human-readable
  // location note is useful for field QA.

  const hasLocationText = hasAnyText(asset, [
    "locationDescription",
    "location",
    "nearestAddress",
    "roadName",
    "notes",
  ]);

  const hasMapLocation =
    hasValidCoordinates(asset) ||
    (typeof asset?.lat === "number" && typeof asset?.lng === "number");

  if (isLocationAsset(asset) && !hasLocationText && !hasMapLocation) {
    issues.push("Missing location description");
  }

  if (
    isJointAsset(asset) &&
    !hasAnyText(asset, [
      "mappingRowsCount",
      "trayRows",
      "continuityRows",
      "spliceCount",
    ])
  ) {
    issues.push("Joint has no fibre mapping summary");
  }

  // --------------------------------------------------
  // MISSING COORDINATES
  // --------------------------------------------------

  if (!hasValidCoordinates(asset)) {
    issues.push("Missing coordinates");
  }

  return issues;
}

function findNearestNodeDistance(point: Coordinate, nodes: any[]): number {
  let best = Number.POSITIVE_INFINITY;

  for (const node of nodes) {
    const nodePoint = getPointCoordinate(node);
    if (!nodePoint) continue;

    best = Math.min(best, haversineMeters(point, nodePoint));
  }

  return best;
}

function addCableEndpointSnappingIssues(
  assets: any[],
  issues: AuditIssue[],
): void {
  const cables = assets.filter(
    (asset) => isCableAsset(asset) && !isDropAsset(asset),
  );
  const nodes = assets.filter(isNetworkNodeAsset);

  if (!cables.length || !nodes.length) return;

  for (const cable of cables) {
    const coords = getAssetCoordinates(cable);
    if (coords.length < 2) continue;

    const start = coords[0];
    const end = coords[coords.length - 1];
    const startDistance = findNearestNodeDistance(start, nodes);
    const endDistance = findNearestNodeDistance(end, nodes);
    const maxSnapDistanceM = 15;

    if (!Number.isFinite(startDistance) || startDistance > maxSnapDistanceM) {
      issues.push(
        makeIssue(
          cable,
          `Cable start endpoint not snapped to joint/pole/chamber (${Math.round(startDistance)}m)`,
          { severity: "high", category: "Topology" },
        ),
      );
    }

    if (!Number.isFinite(endDistance) || endDistance > maxSnapDistanceM) {
      issues.push(
        makeIssue(
          cable,
          `Cable end endpoint not snapped to joint/pole/chamber (${Math.round(endDistance)}m)`,
          { severity: "high", category: "Topology" },
        ),
      );
    }
  }
}

export function auditAreaAssets(assets: any[] = []): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const validAssets = assets.filter(Boolean);

  // --------------------------------------------------
  // BASIC ASSET CHECKS
  // --------------------------------------------------

  for (const asset of validAssets) {
    const assetIssues = auditAsset(asset);

    for (const issue of assetIssues) {
      issues.push(makeIssue(asset, issue));
    }
  }

  // --------------------------------------------------
  // DUPLICATE IDS
  // --------------------------------------------------

  const seen = new Map<string, any[]>();

  for (const asset of validAssets) {
    const id = getAssetId(asset);
    seen.set(id, [...(seen.get(id) || []), asset]);
  }

  for (const [id, matches] of seen.entries()) {
    if (id !== "unknown" && matches.length > 1) {
      for (const asset of matches) {
        issues.push(
          makeIssue(asset, "Duplicate asset ID", {
            assetId: id,
            assetType: getAssetType(asset),
            severity: "high",
            category: "Data Quality",
          }),
        );
      }
    }
  }

  // --------------------------------------------------
  // DISCONNECTED ASSETS
  // --------------------------------------------------

  const graph = buildNetworkGraph(validAssets);
  const disconnected = findDisconnectedAssets(graph);

  for (const node of disconnected) {
    issues.push(
      makeIssue(node.asset, "Disconnected asset", {
        assetId: node.id,
        assetType: getAssetType(node.asset),
        severity: "high",
        category: "Topology",
      }),
    );
  }

  // --------------------------------------------------
  // CABLE ENDPOINT SNAP QA
  // --------------------------------------------------

  addCableEndpointSnappingIssues(validAssets, issues);

  // --------------------------------------------------
  // DP / DROP / HOME CONNECTION QA CHECKS
  // --------------------------------------------------

  const homes = validAssets.filter(
    (asset: any) =>
      isHomeAsset(asset) ||
      Boolean(asset?.properties?.UPRN) ||
      Boolean(asset?.properties?.uprn) ||
      Boolean(asset?.UPRN) ||
      Boolean(asset?.uprn),
  );

  const drops = validAssets.filter((asset: any) => isDropAsset(asset));

  const dps = validAssets.filter((asset: any) =>
    isDistributionPointAsset(asset),
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
      issues.push(
        makeIssue(drop, "Drop references missing DP", {
          assetId: dropId,
          severity: "high",
          category: "DP / Homes",
        }),
      );
    }

    if (!homeId || !homesByKey.has(homeId)) {
      issues.push(
        makeIssue(drop, "Drop references missing home", {
          assetId: dropId,
          severity: "high",
          category: "DP / Homes",
        }),
      );
    }

    const distanceM = Number(drop?.distanceM ?? drop?.properties?.distanceM);

    if (Number.isFinite(distanceM) && distanceM > 68) {
      issues.push(
        makeIssue(drop, `Drop exceeds 68m (${Math.round(distanceM)}m)`, {
          assetId: dropId,
          severity: "medium",
          category: "DP / Homes",
        }),
      );
    }
  }

  for (const home of homes) {
    const connectedDpId = getConnectedDpId(home);
    if (!connectedDpId) continue;

    const homeKey = getHomeKey(home);

    const hasDrop = drops.some(
      (drop: any) =>
        keysMatch(getDropHomeId(drop), homeKey) &&
        getDropDpId(drop) === connectedDpId,
    );

    if (!hasDrop) {
      issues.push(
        makeIssue(home, "Connected home has no drop cable", {
          severity: "high",
          category: "DP / Homes",
        }),
      );
    }

    if (!assetsById.has(connectedDpId)) {
      issues.push(
        makeIssue(home, "Home connected to missing DP", {
          severity: "high",
          category: "DP / Homes",
        }),
      );
    }
  }

  for (const dp of dps) {
    const dpId = getAssetId(dp);
    const capacity = getDpCapacity(dp);

    const usedPorts = homes.filter(
      (home: any) => getConnectedDpId(home) === dpId,
    ).length;

    if (usedPorts > capacity) {
      issues.push(
        makeIssue(dp, `DP over capacity (${usedPorts}/${capacity})`, {
          assetId: dpId,
          severity: "high",
          category: "Capacity",
        }),
      );
    }
  }

  // --------------------------------------------------
  // DEDUPE IDENTICAL ISSUE ROWS
  // --------------------------------------------------

  const deduped = new Map<string, AuditIssue>();

  for (const issue of issues) {
    const key = `${issue.assetId}::${issue.issue}`;
    if (!deduped.has(key)) {
      deduped.set(key, issue);
    }
  }

  return Array.from(deduped.values()).sort((a, b) => {
    const severityRank: Record<AuditSeverity, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return (
      severityRank[a.severity] - severityRank[b.severity] ||
      a.category.localeCompare(b.category) ||
      a.assetType.localeCompare(b.assetType) ||
      a.assetName?.localeCompare(b.assetName || "") ||
      a.issue.localeCompare(b.issue)
    );
  });
}
