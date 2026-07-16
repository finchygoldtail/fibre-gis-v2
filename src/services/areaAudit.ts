import { buildNetworkGraph, findDisconnectedAssets } from "./networkGraph";
import { DEFAULT_DISTRIBUTION_CLOSURE_TYPE } from "./assetNameValidation";

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


function isReferenceInfrastructureAsset(asset: any): boolean {
  const haystack = [
    asset?.source,
    asset?.assetType,
    asset?.type,
    asset?.jointType,
    asset?.cableType,
    asset?.routeType,
    asset?.name,
    asset?.piaRef,
    asset?.piaKind,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return (
    asset?.readOnly === true ||
    asset?.isReferenceAsset === true ||
    haystack.includes("openreach") ||
    haystack.includes("pia") ||
    haystack.includes("osp:") ||
    haystack.includes("pol:") ||
    haystack.includes("mp:") ||
    haystack.includes("jc:") ||
    haystack.includes("ch:") ||
    haystack.includes("missing pole")
  );
}

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

function isFeederOrLinkCable(asset: any): boolean {
  if (!isCableAsset(asset) || isDropAsset(asset)) return false;

  const cableType = String(
    asset?.cableType ||
      asset?.type ||
      asset?.routeType ||
      asset?.properties?.cableType ||
      asset?.properties?.type ||
      "",
  ).toLowerCase();

  return cableType.includes("feeder") || cableType.includes("link");
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
    type === "midj" ||
    type === "cmj" ||
    jointType.includes("joint") ||
    jointType === "lmj" ||
    jointType === "midj" ||
    jointType === "cmj"
  );
}

function isLocationAsset(asset: any): boolean {
  const type = getAssetType(asset);

  return [
    "joint",
    "ag-joint",
    "lmj",
    "midj",
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
  const details = getDpDetails(dp);

  const capacity =
    Number(dp?.capacity) ||
    Number(dp?.dpCapacity) ||
    Number(dp?.afnCapacity) ||
    Number(dp?.ports) ||

    Number(details?.capacity) ||
    Number(details?.dpCapacity) ||
    Number(details?.afnCapacity) ||

    Number(dp?.properties?.capacity) ||
    Number(dp?.properties?.dpCapacity) ||
    Number(dp?.properties?.afnCapacity) ||
    Number(dp?.properties?.ports);

  if (capacity > 0) {
    return capacity;
  }

  const closureType = getDpClosureType(dp);

  switch (closureType) {
    case "AFN":
      return 24;

    case "MDU":
    case "MDU_SPLITTER":
      return 24;

    case "CBT":
    default:
      return 12;
  }
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

type DistributionArchitecture = "CBT" | "AFN" | "MDU" | "MDU_SPLITTER";

function normaliseArchitecture(value: unknown): DistributionArchitecture {
  const raw = String(value || DEFAULT_DISTRIBUTION_CLOSURE_TYPE).trim().toUpperCase();
  if (raw === "AFN") return "AFN";
  if (raw === "MDU") return "MDU";
  if (raw === "MDU_SPLITTER") return "MDU_SPLITTER";
  return "CBT";
}

function isPassthroughArchitecture(value: unknown): boolean {
  return normaliseArchitecture(value) !== "CBT";
}

function getDpDetails(asset: any): any {
  return asset?.dpDetails || asset?.properties?.dpDetails || {};
}

function getDpClosureType(asset: any): DistributionArchitecture {
  const details = getDpDetails(asset);
  return normaliseArchitecture(
    details?.closureType ||
      details?.networkArchitecture ||
      asset?.closureType ||
      asset?.networkArchitecture ||
      asset?.properties?.closureType,
  );
}

function getDpThroughCableId(asset: any): string {
  const details = getDpDetails(asset);
  return String(
    details?.afnDetails?.throughCableId ||
      details?.mduDetails?.throughCableId ||
      details?.autoFibrePlan?.throughCableId ||
      asset?.throughCableId ||
      asset?.parentCableId ||
      asset?.properties?.throughCableId ||
      "",
  ).trim();
}

function getDpInputFibres(asset: any): number[] {
  const details = getDpDetails(asset);
  const closureType = getDpClosureType(asset);
  const raw =
    closureType === "AFN"
      ? details?.afnDetails?.inputFibres
      : details?.mduDetails?.inputFibres || details?.autoFibrePlan?.inputFibres;

  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : [])
        .map((fibre: unknown) => Number(fibre))
        .filter((fibre: number) => Number.isFinite(fibre) && fibre > 0),
    ),
  ).sort((a, b) => a - b);
}

function getDpSpliceFibres(asset: any): number[] {
  const details = getDpDetails(asset);
  const raw =
    details?.afnDetails?.spliceFibres ||
    details?.mduDetails?.spliceFibres ||
    details?.autoFibrePlan?.spliceFibres ||
    details?.spliceFibres ||
    asset?.spliceFibres ||
    asset?.properties?.spliceFibres;

  return Array.from(
    new Set(
      (Array.isArray(raw) ? raw : [])
        .map((fibre: unknown) => Number(fibre))
        .filter((fibre: number) => Number.isFinite(fibre) && fibre > 0),
    ),
  ).sort((a, b) => a - b);
}

function getDpRequiredInputFibres(asset: any): number {
  const details = getDpDetails(asset);
  const closureType = getDpClosureType(asset);

  const fromPlan = Number(details?.autoFibrePlan?.reservedFibres);
  if (Number.isFinite(fromPlan) && fromPlan >= 0) return fromPlan;

  if (closureType === "AFN") {
    const fromAfn = Number(details?.afnDetails?.fibreCountUsed);
    if (Number.isFinite(fromAfn) && fromAfn >= 0) return fromAfn;
  }

  if (closureType === "MDU" || closureType === "MDU_SPLITTER") {
    const total = Number(details?.mduDetails?.totalReservedFibres);
    if (Number.isFinite(total) && total >= 0) return total;

    const mduFibres = Number(details?.mduDetails?.mduFibres || 0);
    const splitterFibres = Number(details?.mduDetails?.splitterFibres || 0);
    if (Number.isFinite(mduFibres + splitterFibres) && mduFibres + splitterFibres > 0) {
      return mduFibres + splitterFibres;
    }
  }

  return getDpInputFibres(asset).length;
}

function getCableDisplayName(asset: any): string {
  return String(asset?.name || asset?.cableId || asset?.label || asset?.id || "Cable");
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
    text.includes("fibres exceed") ||
    text.includes("duplicate reserved fibre") ||
    text.includes("no fibres selected") ||
    text.includes("reserved fibre demand exceeds") ||
    text.includes("selected fibre exceeds cable size") ||
    text.includes("selected fibres do not match required demand")
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
    text.includes("joint has no fibre mapping") ||
    text.includes("no through cable selected") ||
    text.includes("reserved more fibres than required")
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
    text.includes("tray") ||
    text.includes("through cable") ||
    text.includes("reservation")
  )
    return "Fibre Allocation";
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

  // Address metadata is optional during current QA passes.

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

function normaliseEndpointLookupKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

function getEndpointLookupKeysForAsset(asset: any): string[] {
  const values = [
    asset?.id,
    asset?.assetId,
    asset?.jointId,
    asset?.jointName,
    asset?.dpId,
    asset?.poleId,
    asset?.chamberId,
    asset?.cabinetId,
    asset?.name,
    asset?.assetName,
    asset?.label,
    asset?.nodeId,
    asset?.properties?.id,
    asset?.properties?.assetId,
    asset?.properties?.jointId,
    asset?.properties?.jointName,
    asset?.properties?.name,
  ];

  const keys = new Set<string>();

  values.forEach((value) => {
    const key = normaliseEndpointLookupKey(value);
    if (!key) return;

    keys.add(key);

    const withoutJointSuffix = key.replace(/-(cmj|mmj|lmj|midj)\d{1,4}$/i, "");
    if (withoutJointSuffix) keys.add(withoutJointSuffix);

    const nodeMatches = key.match(/(?:ag|lmj|mmj|cmj|midj|lc|sb|sc)\d{1,4}/gi);
    nodeMatches?.forEach((match) => keys.add(normaliseEndpointLookupKey(match)));
  });

  return Array.from(keys).filter((key) => key.length >= 2);
}

function getCableEndpointReferences(cable: any, side: "from" | "to"): unknown[] {
  const props = cable?.properties || {};

  if (side === "from") {
    return [
      cable?.fromAssetId,
      cable?.fromId,
      cable?.fromJointId,
      cable?.fromJoint,
      cable?.fromName,
      cable?.fromAssetName,
      cable?.startAssetId,
      cable?.startJoint,
      cable?.aAssetId,
      cable?.aEnd,
      cable?.aEndAssetId,
      cable?.sourceAssetId,
      cable?.sourceJointId,
      cable?.sourceJoint,
      cable?.sourceName,
      cable?.upstreamAssetId,
      cable?.upstreamJoint,
      props?.fromAssetId,
      props?.fromId,
      props?.fromJointId,
      props?.fromJoint,
      props?.fromAssetName,
      props?.startAssetId,
      props?.startJoint,
      props?.aAssetId,
      props?.aEnd,
      props?.aEndAssetId,
      props?.sourceAssetId,
      props?.sourceJointId,
      props?.sourceJoint,
    ];
  }

  return [
    cable?.toAssetId,
    cable?.toId,
    cable?.toJointId,
    cable?.toJoint,
    cable?.toName,
    cable?.toAssetName,
    cable?.endAssetId,
    cable?.endJoint,
    cable?.bAssetId,
    cable?.zEnd,
    cable?.zEndAssetId,
    cable?.targetAssetId,
    cable?.targetJointId,
    cable?.targetJoint,
    cable?.targetName,
    cable?.downstreamAssetId,
    cable?.downstreamJoint,
    props?.toAssetId,
    props?.toId,
    props?.toJointId,
    props?.toJoint,
    props?.toAssetName,
    props?.endAssetId,
    props?.endJoint,
    props?.bAssetId,
    props?.zEnd,
    props?.zEndAssetId,
    props?.targetAssetId,
    props?.targetJointId,
    props?.targetJoint,
  ];
}

function hasMatchingEndpointReference(reference: unknown, nodeLookupKeys: Set<string>): boolean {
  const lookup = normaliseEndpointLookupKey(reference);
  if (!lookup) return false;

  if (nodeLookupKeys.has(lookup)) return true;

  for (const key of nodeLookupKeys) {
    if (key.length < 3) continue;
    if (key.includes(lookup) || lookup.includes(key)) return true;
  }

  return false;
}

function hasValidCableEndpoint(cable: any, side: "from" | "to", nodeLookupKeys: Set<string>): boolean {
  return getCableEndpointReferences(cable, side).some((reference) =>
    hasMatchingEndpointReference(reference, nodeLookupKeys),
  );
}

function findReferencedEndpointNode(cable: any, side: "from" | "to", nodes: any[]): any | null {
  const references = getCableEndpointReferences(cable, side);

  return (
    nodes.find((node) =>
      references.some((reference) =>
        getEndpointLookupKeysForAsset(node).some((key) =>
          hasMatchingEndpointReference(reference, new Set([key])),
        ),
      ),
    ) || null
  );
}

function hasCableEndpointSnap(
  cable: any,
  side: "from" | "to",
  endpointPoint: Coordinate,
  oppositeEndpointPoint: Coordinate,
  nodes: any[],
  nodeLookupKeys: Set<string>,
  maxSnapDistanceM: number,
): boolean {
  if (hasValidCableEndpoint(cable, side, nodeLookupKeys)) return true;

  const referencedNode = findReferencedEndpointNode(cable, side, nodes);
  const referencedPoint = referencedNode ? getPointCoordinate(referencedNode) : null;

  return Boolean(
    referencedPoint &&
      Math.min(
        haversineMeters(endpointPoint, referencedPoint),
        haversineMeters(oppositeEndpointPoint, referencedPoint),
      ) <= maxSnapDistanceM,
  );
}

function buildAssetIdLookup(assets: any[]): Set<string> {
  const ids = new Set<string>();

  for (const asset of assets) {
    getEndpointLookupKeysForAsset(asset).forEach((key) => ids.add(key));
  }

  return ids;
}

function addCableEndpointSnappingIssues(
  assets: any[],
  issues: AuditIssue[],
  allNetworkAssets: any[] = assets,
): void {
  const cables = assets.filter(
    (asset) => isCableAsset(asset) && !isDropAsset(asset) && !isFeederOrLinkCable(asset),
  );
  const networkAssets = allNetworkAssets.length ? allNetworkAssets : assets;
  const nodes = networkAssets.filter(isNetworkNodeAsset);
  const nodeIds = buildAssetIdLookup(nodes);

  if (!cables.length || !nodes.length) return;

  for (const cable of cables) {
    const coords = getAssetCoordinates(cable);
    if (coords.length < 2) continue;

    const maxSnapDistanceM = 15;

    const start = coords[0];
    const end = coords[coords.length - 1];
    const hasLinkedStart = hasCableEndpointSnap(cable, "from", start, end, nodes, nodeIds, maxSnapDistanceM);
    const hasLinkedEnd = hasCableEndpointSnap(cable, "to", end, start, nodes, nodeIds, maxSnapDistanceM);
    const startDistance = hasLinkedStart
      ? 0
      : findNearestNodeDistance(start, nodes);
    const endDistance = hasLinkedEnd
      ? 0
      : findNearestNodeDistance(end, nodes);

    if (!hasLinkedStart && (!Number.isFinite(startDistance) || startDistance > maxSnapDistanceM)) {
      issues.push(
        makeIssue(
          cable,
          `Cable start endpoint not snapped to joint/pole/chamber (${Math.round(startDistance)}m)`,
          { severity: "high", category: "Topology" },
        ),
      );
    }

    if (!hasLinkedEnd && (!Number.isFinite(endDistance) || endDistance > maxSnapDistanceM)) {
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

function addFibreAllocationIssues(assets: any[], issues: AuditIssue[]): void {
  const cables = assets.filter((asset) => isCableAsset(asset) && !isDropAsset(asset));
  const dps = assets.filter(isDistributionPointAsset);
  const cableById = new Map<string, any>();

  for (const cable of cables) {
    const id = getAssetId(cable);
    if (id && id !== "unknown") cableById.set(id, cable);
  }

  const reservationsByCable = new Map<
    string,
    {
      cable?: any;
      rows: {
        dp: any;
        dpId: string;
        dpName: string;
        closureType: DistributionArchitecture;
        requiredFibres: number;
        inputFibres: number[];
      }[];
    }
  >();

  for (const dp of dps) {
    const dpId = getAssetId(dp);
    const dpName = getAssetName(dp);
    const closureType = getDpClosureType(dp);
    const throughCableId = getDpThroughCableId(dp);
    const inputFibres = getDpInputFibres(dp);
    const spliceFibres = getDpSpliceFibres(dp);
    const requiredFibres = getDpRequiredInputFibres(dp);
    const shouldEnforceLocalDemand = closureType !== "AFN";

    if (!isPassthroughArchitecture(closureType)) continue;

    // SB → SB routing can now define valid fibre routing without a legacy
    // throughCableId. Also, workspace scoping can hide the physical cable while
    // the SB route remains valid. Do not raise through-cable QA issues here.
    // Only run cable-capacity / duplicate-reservation checks when the selected
    // cable is actually present in this scoped area.
    const cable = throughCableId ? cableById.get(throughCableId) : undefined;

    if (!throughCableId || !cable) {
      continue;
    }

    const cableName = getCableDisplayName(cable);
    const cableCapacity = getCableCapacity(cable);

    // AFN/SB fibres can be direct, split, spliced onward, or simply pass through
    // to another route. Do not compare them to local homes demand here; only
    // validate that selected fibre numbers are real for the through cable.
    if (shouldEnforceLocalDemand && requiredFibres > 0 && inputFibres.length === 0) {
      issues.push(
        makeIssue(dp, `${closureType} has no fibres selected on ${cableName}`, {
          assetId: dpId,
          severity: "high",
          category: "Fibre Allocation",
        }),
      );
    }

    if (shouldEnforceLocalDemand && requiredFibres > 0 && inputFibres.length < requiredFibres) {
      issues.push(
        makeIssue(
          dp,
          `${closureType} selected fibres do not match required demand (${inputFibres.length}/${requiredFibres})`,
          {
            assetId: dpId,
            severity: "high",
            category: "Fibre Allocation",
          },
        ),
      );
    }

    if (shouldEnforceLocalDemand && requiredFibres > 0 && inputFibres.length > requiredFibres) {
      issues.push(
        makeIssue(
          dp,
          `${closureType} reserved more fibres than required (${inputFibres.length}/${requiredFibres})`,
          {
            assetId: dpId,
            severity: "medium",
            category: "Fibre Allocation",
          },
        ),
      );
    }

    if (cableCapacity > 0) {
      const overSizedFibres = [...inputFibres, ...spliceFibres].filter((fibre) => fibre > cableCapacity);
      if (overSizedFibres.length) {
        issues.push(
          makeIssue(
            dp,
            `${closureType} selected fibre exceeds cable size on ${cableName}: F${overSizedFibres.join(", F")} / ${cableCapacity}F`,
            {
              assetId: dpId,
              severity: "high",
              category: "Fibre Allocation",
            },
          ),
        );
      }
    }

    if (!reservationsByCable.has(throughCableId)) {
      reservationsByCable.set(throughCableId, { cable, rows: [] });
    }

    reservationsByCable.get(throughCableId)?.rows.push({
      dp,
      dpId,
      dpName,
      closureType,
      requiredFibres,
      inputFibres,
    });
  }

  for (const [throughCableId, group] of reservationsByCable.entries()) {
    const cable = group.cable || cableById.get(throughCableId);
    const cableName = getCableDisplayName(cable || { id: throughCableId });
    const cableCapacity = cable ? getCableCapacity(cable) : 0;
    const fibreOwners = new Map<number, typeof group.rows>();

    for (const row of group.rows) {
      for (const fibre of row.inputFibres) {
        const owners = fibreOwners.get(fibre) || [];
        owners.push(row);
        fibreOwners.set(fibre, owners);
      }
    }

    for (const [fibre, owners] of fibreOwners.entries()) {
      if (owners.length <= 1) continue;

      const ownerNames = owners.map((owner) => owner.dpName).join(", ");
      for (const owner of owners) {
        issues.push(
          makeIssue(
            owner.dp,
            `Duplicate reserved fibre F${fibre} on ${cableName}: also used by ${ownerNames}`,
            {
              assetId: owner.dpId,
              severity: "high",
              category: "Fibre Allocation",
            },
          ),
        );
      }
    }

    const totalRequiredDemand = group.rows.reduce(
      (sum, row) => sum + Math.max(0, row.requiredFibres),
      0,
    );

    if (cable && cableCapacity > 0 && totalRequiredDemand > cableCapacity) {
      issues.push(
        makeIssue(
          cable,
          `Reserved fibre demand exceeds cable capacity on ${cableName} (${totalRequiredDemand}/${cableCapacity})`,
          {
            assetId: getAssetId(cable),
            assetType: getAssetType(cable),
            severity: "high",
            category: "Fibre Allocation",
          },
        ),
      );
    }
  }
}

export function auditAreaAssets(assets: any[] = [], allNetworkAssets: any[] = assets): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const validAssets = assets.filter(Boolean).filter((asset) => !isReferenceInfrastructureAsset(asset));

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

  addCableEndpointSnappingIssues(validAssets, issues, allNetworkAssets);

  // --------------------------------------------------
  // FIBRE ALLOCATION QA
  // --------------------------------------------------

  addFibreAllocationIssues(validAssets, issues);

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
