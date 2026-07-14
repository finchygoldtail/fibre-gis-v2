import { getDpCapacitySummary } from "../../../services/dpIntelligence";
import type { SavedMapAsset } from "../types";

export type ParentSbPopupSummary = {
  parentName: string;
  childName: string;
  fibresNeeded: number;
  parentFibres: number[];
  localFibres: number[];
  mappingRows: { parent: number; local: number }[];
};

function normaliseAssetRef(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[â€“â€”]/g, "-")
    .replace(/[^A-Z0-9]/g, "");
}

function refsMatch(a: unknown, b: unknown): boolean {
  const left = normaliseAssetRef(a);
  const right = normaliseAssetRef(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function uniquePositiveNumbers(values: unknown[]): number[] {
  return Array.from(
    new Set(
      values
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0),
    ),
  ).sort((a, b) => a - b);
}

function getManualSbRoutesFromDetails(details: any): any[] {
  const routes = details?.afnDetails?.sbToSbRoutes;
  return Array.isArray(routes) ? routes : [];
}

export function getPrimaryManualSbRouteForDp(dp: any): any | null {
  const details = dp?.dpDetails || dp?.properties?.dpDetails || {};
  const routes = getManualSbRoutesFromDetails(details);
  if (!routes.length) return null;
  const dpRefs = [dp?.id, dp?.assetId, dp?.name, dp?.jointName, dp?.label, dp?.dpId]
    .map(normaliseAssetRef)
    .filter(Boolean);
  return routes.find((route) => {
    const routeRefs = [route?.toSbId, route?.toSbName].map(normaliseAssetRef).filter(Boolean);
    return routeRefs.length && routeRefs.some((routeRef) => dpRefs.some((dpRef) => refsMatch(routeRef, dpRef)));
  }) || routes[0];
}

function getAssetIdentityValues(asset: any): string[] {
  return [
    asset?.id,
    asset?.assetId,
    asset?.name,
    asset?.jointName,
    asset?.label,
    asset?.dpId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function getHomeUniqueKey(asset: any): string {
  const raw =
    asset?.uprn ||
    asset?.UPRN ||
    asset?.properties?.UPRN ||
    asset?.properties?.uprn ||
    asset?.homeId ||
    asset?.id ||
    asset?.assetId ||
    asset?.name;

  return String(raw ?? "").trim().toLowerCase();
}

function getConnectedDpReference(asset: any): string {
  return String(
    asset?.connectedDpId ??
      asset?.dpId ??
      asset?.assignedDpId ??
      asset?.properties?.connectedDpId ??
      asset?.properties?.dpId ??
      asset?.properties?.assignedDpId ??
      "",
  ).trim();
}

function readPositiveNumber(...values: unknown[]): number {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    const text = String(value).trim();
    const match = text.match(/\d+/);
    const parsed = match ? Number(match[0]) : Number(text);

    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.floor(parsed);
    }
  }

  return 0;
}

function getSavedDpUsedPorts(dp: any, dpDetails: any, matchingDpState?: any): number {
  const savedConnectedHomes = Array.isArray(dp?.connectedHomes)
    ? dp.connectedHomes.length
    : Array.isArray(dpDetails?.connectedHomes)
      ? dpDetails.connectedHomes.length
      : 0;

  const savedConnectedHomeIds = Array.isArray(dp?.connectedHomeIds)
    ? dp.connectedHomeIds.length
    : Array.isArray(dpDetails?.connectedHomeIds)
      ? dpDetails.connectedHomeIds.length
      : 0;

  return readPositiveNumber(
    matchingDpState?.used,
    matchingDpState?.usedPorts,
    matchingDpState?.connectedHomes,
    matchingDpState?.connectedHomeCount,
    matchingDpState?.homeCount,
    dp?.usedPorts,
    dp?.usedPortCount,
    dp?.portsUsed,
    dp?.connectedHomesCount,
    dp?.connectedHomeCount,
    dp?.servedHomeCount,
    dp?.homesServed,
    dpDetails?.usedPorts,
    dpDetails?.usedPortCount,
    dpDetails?.portsUsed,
    dpDetails?.connectedHomesCount,
    dpDetails?.connectedHomeCount,
    dpDetails?.servedHomeCount,
    dpDetails?.homesServed,
    dpDetails?.autoFibrePlan?.usedPorts,
    dpDetails?.autoFibrePlan?.connectedHomes,
    savedConnectedHomes,
    savedConnectedHomeIds,
  );
}

function getDropHomeReference(drop: any, dpIdentityValues: string[]): string {
  const fromRefs = [
    drop?.fromAssetId,
    drop?.fromId,
    drop?.fromHomeId,
    drop?.fromAssetName,
    drop?.sourceAssetId,
    drop?.sourceId,
  ];

  const toRefs = [
    drop?.toAssetId,
    drop?.toId,
    drop?.toHomeId,
    drop?.toAssetName,
    drop?.targetAssetId,
    drop?.targetId,
  ];

  const fromIsDp = fromRefs.some((ref) =>
    dpIdentityValues.some((dpRef) => refsMatch(ref, dpRef)),
  );
  const toIsDp = toRefs.some((ref) =>
    dpIdentityValues.some((dpRef) => refsMatch(ref, dpRef)),
  );

  if (fromIsDp) {
    return String(
      drop?.toHomeId ||
        drop?.toAssetId ||
        drop?.toId ||
        drop?.targetAssetId ||
        drop?.targetId ||
        drop?.homeId ||
        drop?.connectedHomeId ||
        drop?.id ||
        "",
    ).trim();
  }

  if (toIsDp) {
    return String(
      drop?.fromHomeId ||
        drop?.fromAssetId ||
        drop?.fromId ||
        drop?.sourceAssetId ||
        drop?.sourceId ||
        drop?.homeId ||
        drop?.connectedHomeId ||
        drop?.id ||
        "",
    ).trim();
  }

  return "";
}

function isDropCableAsset(asset: SavedMapAsset): boolean {
  const text = [
    (asset as any).assetType,
    (asset as any).type,
    (asset as any).cableType,
    (asset as any).name,
    (asset as any).label,
    (asset as any).generatedBy,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return (
    text.includes("drop") ||
    (asset as any).isDropCable === true ||
    (asset as any).isHomeDrop === true ||
    (asset as any).generatedDrop === true ||
    (asset as any).autoGeneratedDrop === true ||
    (asset as any).dropCable === true ||
    Boolean(
      (asset as any).homeId ||
        (asset as any).connectedHomeId ||
        (asset as any).toHomeId ||
        (asset as any).fromHomeId,
    )
  );
}

export function getDpUsage(
  dp: SavedMapAsset,
  allAssets: SavedMapAsset[],
  networkState?: any,
) {
  const dpIdentityValues = getAssetIdentityValues(dp as any);
  const dpDetails = ((dp as any).dpDetails || (dp as any).properties?.dpDetails || {}) as any;
  const afnDetails = dpDetails.afnDetails || (dp as any).afnDetails || {};
  const mduDetails = dpDetails.mduDetails || (dp as any).mduDetails || {};

  const matchingDpState =
    (dp.id ? networkState?.dpStates?.[dp.id] : null) ||
    Object.values(networkState?.dpStates || {}).find((state: any) =>
      dpIdentityValues.some((dpRef) =>
        refsMatch(state?.assetId || state?.assetName || state?.dpName, dpRef),
      ),
    );

  const connectedHomeKeys = new Set<string>();

  allAssets.forEach((asset: any) => {
    if (asset?.assetType === "home") {
      const connectedDpRef = getConnectedDpReference(asset);
      if (!connectedDpRef) return;

      const belongsToThisDp = dpIdentityValues.some((dpRef) =>
        refsMatch(connectedDpRef, dpRef),
      );

      if (!belongsToThisDp) return;

      const key = getHomeUniqueKey(asset);
      if (key) connectedHomeKeys.add(key);
      return;
    }

    // The main map can be shown without all project homes loaded. In that case
    // use the saved drop-cable endpoints as a fallback so the DP popup does not
    // incorrectly show "0 used".
    if (isDropCableAsset(asset as SavedMapAsset)) {
      const homeRef = getDropHomeReference(asset, dpIdentityValues);
      if (homeRef) connectedHomeKeys.add(homeRef.toLowerCase());
    }
  });

  const manualSbRoute = getPrimaryManualSbRouteForDp(dp as any);
  const manualLocalFibres = uniquePositiveNumbers([
    ...((Array.isArray(manualSbRoute?.localFibres) ? manualSbRoute.localFibres : []) as any[]),
  ]);
  const manualParentFibres = uniquePositiveNumbers([
    ...((Array.isArray(manualSbRoute?.parentFibres) ? manualSbRoute.parentFibres : []) as any[]),
  ]);

  const storedSpliceFibres = uniquePositiveNumbers([
    ...((Array.isArray(afnDetails.spliceFibres) ? afnDetails.spliceFibres : []) as any[]),
    ...((Array.isArray(manualSbRoute?.spliceFibres) ? manualSbRoute.spliceFibres : []) as any[]),
  ]);

  const storedInputFibres = uniquePositiveNumbers([
    ...((Array.isArray(afnDetails.inputFibres) ? afnDetails.inputFibres : []) as any[]),
    ...((Array.isArray(afnDetails.splitterFibres) ? afnDetails.splitterFibres : []) as any[]),
  ]);

  // SB routing is manual-authority. Joint/network matched fibres are not allowed
  // to overwrite the SB local splitter fibres shown on the map popup.
  const inputFibres = manualLocalFibres.length ? manualLocalFibres : storedInputFibres;
  const splitterFibres = inputFibres;

  const closureType = String(
    dpDetails.closureType ||
      dpDetails.networkArchitecture ||
      (dp as any).closureType ||
      (dp as any).dpType ||
      "",
  ).toUpperCase();

  const isMdu = closureType.includes("MDU");
  const savedUsed = getSavedDpUsedPorts(dp as any, dpDetails, matchingDpState);

  // Prefer actual loaded homes/drop endpoints. If the main map has not loaded
  // homes for the project, fall back to the saved workspace/intelligence count.
  // Capacity is now calculated through the shared DP intelligence service so
  // popups, editor panels and workspace panels stay aligned.
  const used = connectedHomeKeys.size || savedUsed;
  const capacitySummary = getDpCapacitySummary(dp, allAssets, {
    connectedHomeCount: used,
    splitterInputCount: splitterFibres.length,
    splitterOutputsPerInput: 8,
  });
  const capacity = capacitySummary.capacity;
  const free = capacitySummary.free;

  return {
    capacity,
    used,
    free,
    overCapacity: used > capacity,
    inputFibres,
    spliceFibres: storedSpliceFibres,
    isMdu,
    mduFeedFibres: capacity,
  };
}

function getAssetDisplayName(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return String(item?.name || item?.jointName || item?.label || item?.assetId || item?.id || "SB");
}

function findAssetByReferences(assets: SavedMapAsset[], references: unknown[]): SavedMapAsset | null {
  const refs = references.map(normaliseAssetRef).filter(Boolean);
  if (!refs.length) return null;

  return (
    assets.find((asset) =>
      getAssetIdentityValues(asset).some((identity) =>
        refs.some((reference) => refsMatch(identity, reference)),
      ),
    ) || null
  );
}

export function buildParentSbPopupSummary(
  dp: SavedMapAsset,
  allAssets: SavedMapAsset[],
): ParentSbPopupSummary | null {
  const route = getPrimaryManualSbRouteForDp(dp as any);
  if (!route) return null;

  const allDps = allAssets.filter((asset) => asset.assetType === "distribution-point");
  const parent = findAssetByReferences(allDps, [route.fromSbId, route.fromSbName]);
  const child = findAssetByReferences(allDps, [route.toSbId, route.toSbName]) || dp;
  const parentFibres = uniquePositiveNumbers(Array.isArray(route.parentFibres) ? route.parentFibres : []);
  const localFibres = uniquePositiveNumbers(Array.isArray(route.localFibres) ? route.localFibres : []);
  const fibresNeeded = Math.max(parentFibres.length, localFibres.length);
  if (!fibresNeeded) return null;

  return {
    parentName: route.fromSbName || getAssetDisplayName(parent) || "Parent SB",
    childName: route.toSbName || getAssetDisplayName(child),
    fibresNeeded,
    parentFibres,
    localFibres,
    mappingRows: Array.from(
      { length: Math.min(parentFibres.length, localFibres.length) },
      (_, index) => ({ parent: parentFibres[index], local: localFibres[index] }),
    ),
  };
}
