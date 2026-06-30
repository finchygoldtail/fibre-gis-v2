/**
 * Cable fibre usage helper.
 *
 * IMPORTANT:
 * Drop cables are deliberately isolated. The DP/home drop workflow took a long
 * time to stabilise, so this helper never derives feeder/link usage from drops
 * and never rewrites drop allocation data.
 *
 * Meaning of "Used fibres":
 * - Drop cables: 1 fibre
 * - Feeder/link/other cables: fibres allocated to this cable section
 * - When possible, derive usage from the destination joint's imported Excel
 *   mapping rows because joints are normally created/imported before cables.
 */

type LatLngLike = { lat: number; lng: number };

type CableUsageEndpointResult = {
  fromAsset?: any;
  toAsset?: any;
  fromAssetId?: string;
  toAssetId?: string;
};

export type CableUsageDerivation = CableUsageEndpointResult & {
  usedFibres: number;
  allocatedInputFibres: number[];
  usageSource: string;
  destinationJointUsage: number;
  sourceJointConsumed: number;
  parentCableUsed: number;
};

function normaliseText(value: any): string {
  return String(value ?? "").trim().toLowerCase();
}

function cableNameKeys(cable: any): string[] {
  return [cable?.id, cable?.name, cable?.cableId, cable?.label]
    .map((value) => normaliseText(value))
    .filter(Boolean);
}

function isDropCable(cable: any): boolean {
  const type = normaliseText(cable?.cableType || cable?.type || cable?.assetType);
  return type === "drop" || type.includes("drop");
}

function isCableAsset(asset: any): boolean {
  const type = normaliseText(asset?.assetType || asset?.type || asset?.jointType);
  return type.includes("cable") || asset?.geometry?.type === "LineString";
}

function isAreaAsset(asset: any): boolean {
  const type = normaliseText(asset?.assetType || asset?.type || asset?.jointType);
  return type.includes("area") || type.includes("polygon") || asset?.geometry?.type === "Polygon";
}

function getAssetPoint(asset: any): LatLngLike | null {
  if (typeof asset?.lat === "number" && typeof asset?.lng === "number") {
    return { lat: asset.lat, lng: asset.lng };
  }

  const coords = asset?.geometry?.coordinates;
  if (asset?.geometry?.type === "Point" && Array.isArray(coords)) {
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function parseCapacity(value: any): number {
  const match = String(value ?? "").match(/\d+/);
  const parsed = match ? Number(match[0]) : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function manualUsedFibres(cable: any): number {
  const allocatedInputFibres = Array.isArray(cable?.allocatedInputFibres)
    ? cable.allocatedInputFibres
        .map((f: any) => Number(f))
        .filter((f: number) => Number.isFinite(f) && f > 0)
    : [];

  if (allocatedInputFibres.length > 0) {
    return new Set(allocatedInputFibres).size;
  }

  for (const value of [
    cable?.usedFibres,
    cable?.usedFibreCount,
    cable?.fibresUsed,
    cable?.fibreUsage,
  ]) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return 0;
}

function maxReservedDpFibreOnCable(cable: any, allAssets: any[] = []): number {
  const cableId = String(cable?.id || "");
  if (!cableId) return 0;

  let maxFibre = 0;

  (allAssets || []).forEach((asset: any) => {
    const details = asset?.dpDetails;
    if (!details) return;

    const afn = details.afnDetails;
    const mdu = details.mduDetails;
    const throughCableId = String(afn?.throughCableId || mdu?.throughCableId || "");
    if (throughCableId !== cableId) return;

    [...(afn?.inputFibres || []), ...(mdu?.inputFibres || [])].forEach((value: any) => {
      const fibre = Number(value);
      if (Number.isFinite(fibre) && fibre > maxFibre) maxFibre = fibre;
    });
  });

  return maxFibre;
}

function rowLooksLikeHeader(text: string): boolean {
  return (
    text.includes("fibre") &&
    (text.includes("tray") || text.includes("tube") || text.includes("cable") || text.includes("input") || text.includes("output"))
  );
}

function rowToValues(row: any): any[] {
  if (Array.isArray(row)) return row;
  if (row && typeof row === "object") return Object.values(row);
  return [row];
}

function rowToText(row: any): string {
  return rowToValues(row)
    .map((value) => String(value ?? ""))
    .join(" ")
    .trim()
    .toLowerCase();
}

function rowHasCable(row: any, cableKeys: string[]): boolean {
  if (cableKeys.length === 0) return false;
  const text = rowToText(row);
  return cableKeys.some((key) => key && text.includes(key));
}

function rowHasMeaningfulAllocation(row: any): boolean {
  const values = rowToValues(row).map((value) => String(value ?? "").trim());
  const text = values.join(" ").trim().toLowerCase();
  if (!text || rowLooksLikeHeader(text)) return false;
  return values.some((value) => value !== "" && value !== "-" && value.toLowerCase() !== "spare");
}

function extractFibreNumber(row: any): number | null {
  if (row && !Array.isArray(row) && typeof row === "object") {
    const preferredKeys = [
      "inputFibre",
      "inputFiber",
      "inFibre",
      "inFiber",
      "fibre",
      "fiber",
      "fibreNo",
      "fiberNo",
      "fibreNumber",
      "fiberNumber",
      "fromFibre",
      "fromFiber",
      "core",
      "coreNo",
    ];

    for (const key of preferredKeys) {
      const value = Number((row as any)[key]);
      if (Number.isFinite(value) && value > 0) return value;
    }
  }

  for (const value of rowToValues(row)) {
    const match = String(value ?? "").match(/\b(\d{1,3})\b/);
    if (!match) continue;
    const parsed = Number(match[1]);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 432) return parsed;
  }

  return null;
}

function getMappingRows(asset: any): any[] {
  if (Array.isArray(asset?.mappingRows)) return asset.mappingRows;
  if (Array.isArray(asset?.trayRows)) return asset.trayRows;
  if (Array.isArray(asset?.continuityRows)) return asset.continuityRows;

  if (typeof asset?.mappingRowsJson === "string") {
    try {
      const parsed = JSON.parse(asset.mappingRowsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

export function getJointExcelAllocatedFibres(joint: any, incomingCable?: any): number {
  if (!joint) return 0;

  const rows = getMappingRows(joint);
  const cableKeys = cableNameKeys(incomingCable);
  const matchedRows = rows.filter((row) => rowHasMeaningfulAllocation(row) && rowHasCable(row, cableKeys));
  const candidateRows = matchedRows.length > 0 ? matchedRows : rows.filter(rowHasMeaningfulAllocation);

  const fibreNumbers = candidateRows
    .map(extractFibreNumber)
    .filter((value): value is number => value !== null);

  if (fibreNumbers.length > 0) {
    return new Set(fibreNumbers).size;
  }

  const countFromRows = candidateRows.length;
  if (countFromRows > 0) return countFromRows;

  const fallbackCount = Number(joint?.mappingRowsCount || joint?.trayRowsCount || joint?.spliceCount || 0);
  return Number.isFinite(fallbackCount) && fallbackCount > 0 ? fallbackCount : 0;
}

export function findCableEndpointAssets(
  assets: any[],
  points: LatLngLike[],
  snapDistanceM = 18,
): CableUsageEndpointResult {
  if (!Array.isArray(points) || points.length < 2) return {};

  const networkPoints = (assets || []).filter((asset) => {
    if (!asset?.id) return false;
    if (isCableAsset(asset) || isAreaAsset(asset)) return false;
    return Boolean(getAssetPoint(asset));
  });

  const nearest = (point: LatLngLike) => {
    return networkPoints
      .map((asset) => ({ asset, distance: getDistanceMeters(point, getAssetPoint(asset)!) }))
      .filter((entry) => entry.distance <= snapDistanceM)
      .sort((a, b) => a.distance - b.distance)[0]?.asset;
  };

  const fromAsset = nearest(points[0]);
  const toAsset = nearest(points[points.length - 1]);

  return {
    fromAsset,
    toAsset,
    fromAssetId: fromAsset?.id ? String(fromAsset.id) : undefined,
    toAssetId: toAsset?.id ? String(toAsset.id) : undefined,
  };
}

function makeSequentialFibres(count: number, capacity: number): number[] {
  const safeCapacity = capacity > 0 ? capacity : Math.max(count, 0);
  const safeCount = Math.max(0, Math.min(safeCapacity, Math.round(count)));
  return Array.from({ length: safeCount }, (_, index) => index + 1);
}

export function deriveCableUsageFromJointExcel(args: {
  cable: any;
  allAssets: any[];
  routePoints?: LatLngLike[];
  existingAllocatedInputFibres?: number[];
}): CableUsageDerivation {
  const { cable, allAssets, routePoints = [], existingAllocatedInputFibres = [] } = args;
  const capacity = parseCapacity(cable?.fibreCount || cable?.fiberCount || cable?.coreCount || cable?.size);

  if (!cable || isDropCable(cable)) {
    return {
      usedFibres: cable ? 1 : 0,
      allocatedInputFibres: cable ? [1] : [],
      usageSource: cable ? "drop-cable-isolated" : "no-cable",
      destinationJointUsage: 0,
      sourceJointConsumed: 0,
      parentCableUsed: 0,
    };
  }

  const points = routePoints.length >= 2 ? routePoints : [];
  const endpointAssets = findCableEndpointAssets(allAssets, points);

  const persistedFromAsset = (allAssets || []).find(
    (asset) => String(asset?.id || "") === String(cable?.fromJointId || "")
  );

  const persistedToAsset = (allAssets || []).find(
    (asset) => String(asset?.id || "") === String(cable?.toJointId || "")
  );

  if (persistedFromAsset && !endpointAssets.fromAsset) {
    endpointAssets.fromAsset = persistedFromAsset;
    endpointAssets.fromAssetId = persistedFromAsset.id;
  }

  if (persistedToAsset && !endpointAssets.toAsset) {
    endpointAssets.toAsset = persistedToAsset;
    endpointAssets.toAssetId = persistedToAsset.id;
  }

  const parentCable = (allAssets || []).find((asset) => String(asset?.id || "") === String(cable?.parentCableId || ""));
  const parentCableUsed = parentCable ? getCableUsedFibres(parentCable, allAssets) : 0;
  const sourceJointConsumed = getJointExcelAllocatedFibres(endpointAssets.fromAsset, parentCable || cable);
  const destinationJointUsage = getJointExcelAllocatedFibres(endpointAssets.toAsset, cable);

  let usedFibres = 0;
  let usageSource = "manual-or-existing";

  if (destinationJointUsage > 0) {
    usedFibres = destinationJointUsage;
    usageSource = "destination-joint-excel";
  } else if (parentCableUsed > 0) {
    usedFibres = Math.max(0, parentCableUsed - sourceJointConsumed);
    usageSource = "parent-minus-source-joint-excel";
  } else if (existingAllocatedInputFibres.length > 0) {
    usedFibres = new Set(existingAllocatedInputFibres.map(Number).filter(Number.isFinite)).size;
    usageSource = "existing-selected-fibres";
  } else {
    usedFibres = manualUsedFibres(cable);
  }

  usedFibres = Math.max(usedFibres, maxReservedDpFibreOnCable(cable, allAssets));

  if (capacity > 0) usedFibres = Math.min(capacity, usedFibres);

  return {
    ...endpointAssets,
    usedFibres,
    allocatedInputFibres: makeSequentialFibres(usedFibres, capacity),
    usageSource,
    destinationJointUsage,
    sourceJointConsumed,
    parentCableUsed,
  };
}

export function getCableUsedFibres(cable: any, allAssets: any[] = []): number {
  if (!cable) return 0;

  if (isDropCable(cable)) {
    return 1;
  }

  const manual = manualUsedFibres(cable);
  const dpReserved = maxReservedDpFibreOnCable(cable, allAssets);
  if (manual > 0 || dpReserved > 0) return Math.max(manual, dpReserved);

  // Display fallback only. Save/update code calls deriveCableUsageFromJointExcel
  // with route points so endpoint joints can be read accurately.
  const derived = deriveCableUsageFromJointExcel({
    cable,
    allAssets,
    routePoints: [],
    existingAllocatedInputFibres: [],
  });

  return derived.usedFibres;
}import { getDistanceMeters } from "../../utils/mapMeasure";

