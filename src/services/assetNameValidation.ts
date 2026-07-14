import type { SavedMapAsset } from "../components/map/types";

export const DEFAULT_DISTRIBUTION_CLOSURE_TYPE = "AFN" as const;

function normalise(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[–—]/g, "-");
}

function normaliseNameText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[â€“â€”]/g, "-");
}

function inferAreaCode(value: unknown): string {
  const text = normalise(value);
  const match = text.match(/\b([A-Z]{2,4}-[A-Z0-9]{2,5}-AG\d+[A-Z]?)\b/);
  return match?.[1] || "";
}

function getAssetAreaText(asset: any): string {
  return [
    asset?.areaId,
    asset?.projectAreaId,
    asset?.projectId,
    asset?.areaName,
    asset?.projectAreaName,
    asset?.areaCode,
    asset?.projectAreaCode,
    asset?.properties?.areaId,
    asset?.properties?.projectAreaId,
    asset?.properties?.projectId,
    asset?.properties?.areaName,
    asset?.properties?.projectAreaName,
    asset?.properties?.areaCode,
    asset?.properties?.projectAreaCode,
    asset?.name,
  ]
    .map((value) => String(value ?? ""))
    .filter(Boolean)
    .join(" ");
}

function isInSameArea(asset: SavedMapAsset, activeAreaCode: string): boolean {
  if (!activeAreaCode) return true;

  const areaText = normalise(getAssetAreaText(asset));
  const assetAreaCode = inferAreaCode(areaText);

  if (assetAreaCode) return assetAreaCode === activeAreaCode;

  // Older assets may not have area metadata stamped, but their names usually do.
  return areaText.includes(activeAreaCode);
}

function getComparableAssetKey(name: string, activeAreaCode: string): string {
  const cleanName = normalise(name);
  if (!cleanName) return "";

  // Full Alistra asset code, e.g. BD-ALL-AG1-SB99.
  if (activeAreaCode && cleanName.startsWith(`${activeAreaCode}-`)) {
    return cleanName.slice(activeAreaCode.length + 1);
  }

  // If a user only types SB99, CMJ04, FW6 etc, compare by the local suffix
  // inside the selected AG. This lets other AGs reuse the same SB number safely.
  const suffixMatch = cleanName.match(
    /(SB\d+[A-Z]?|DP\d+[A-Z]?|CBT\d+[A-Z]?|AFN\d+[A-Z]?|CMJ\d+[A-Z]?|MIDJ\d+[A-Z]?|MMJ\d+[A-Z]?|LMJ\d+[A-Z]?|FW\d+[A-Z]?|CAB\d+[A-Z]?|STCAB\d+[A-Z]?|NP\d+[A-Z]?|MP\d+[A-Z]?|P\d+[A-Z]?)$/,
  );

  return suffixMatch?.[1] || cleanName;
}

export function isTelecomDistributionPointName(value: unknown): boolean {
  return /(^|[-_\s])SB\s*\d+[A-Z]?($|[-_\s])/i.test(normaliseNameText(value));
}

export function inferTelecomAssetTypeFromName(value: unknown): SavedMapAsset["assetType"] | null {
  const text = normaliseNameText(value);

  if (/(^|[-_\s])SB\s*\d+[A-Z]?($|[-_\s])/.test(text)) return "distribution-point";
  if (/(^|[-_\s])(CMJ|MMJ|MIDJ|LMJ)\s*\d+[A-Z]?($|[-_\s])/.test(text)) return "ag-joint";
  if (/(^|[-_\s])FW(2|4|6|10)($|[-_\s])/.test(text)) return "chamber";
  if (/(^|[-_\s])P\s*\d+[A-Z]?($|[-_\s])/.test(text)) return "pole";

  return null;
}

export function normaliseDistributionPointAsset<T extends SavedMapAsset>(asset: T): T {
  if (asset.assetType !== "distribution-point") return asset;

  const existingDetails = (asset as any).dpDetails || {};
  const importedProps = (asset as any).importedProperties || {};
  const ports = Number(importedProps.ports_count);
  const slots = Number(importedProps.slots_count);

  return {
    ...(asset as any),
    jointType: asset.jointType || "Distribution Point",
    dpDetails: {
      ...existingDetails,
      closureType:
        existingDetails.closureType ||
        (asset as any).closureType ||
        DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
      dpRole: existingDetails.dpRole || "serving",
      connectionsToHomes:
        existingDetails.connectionsToHomes ??
        (Number.isFinite(ports) ? ports : 8),
      ...(Number.isFinite(ports) ? { ports } : {}),
      ...(Number.isFinite(slots) ? { slots } : {}),
    },
  } as T;
}

export function findDuplicateAssetNameInArea(args: {
  assets: SavedMapAsset[];
  name: string;
  currentAssetId?: string | null;
  activeAreaName?: string | null;
  activeAreaId?: string | null;
}): SavedMapAsset | null {
  const activeAreaCode =
    inferAreaCode(args.activeAreaName) ||
    inferAreaCode(args.activeAreaId) ||
    inferAreaCode(args.name);
  const nextKey = getComparableAssetKey(args.name, activeAreaCode);

  if (!nextKey) return null;

  return (
    (args.assets ?? []).find((asset) => {
      if (!asset) return false;
      if (args.currentAssetId && asset.id === args.currentAssetId) return false;
      if (!isInSameArea(asset, activeAreaCode)) return false;

      const existingKey = getComparableAssetKey(asset.name, activeAreaCode);
      return existingKey === nextKey;
    }) || null
  );
}

export function findDuplicateAssetInArea(args: {
  assets: SavedMapAsset[];
  asset: SavedMapAsset;
  activeAreaName?: string | null;
  activeAreaId?: string | null;
}): SavedMapAsset | null {
  return findDuplicateAssetNameInArea({
    assets: args.assets,
    name: args.asset.name,
    currentAssetId: args.asset.id,
    activeAreaName: args.activeAreaName,
    activeAreaId: args.activeAreaId,
  });
}

export function buildDuplicateAssetNameMessage(args: {
  attemptedName: string;
  duplicate: SavedMapAsset;
  activeAreaName?: string | null;
}): string {
  const areaLabel = args.activeAreaName || "this area";
  return `Duplicate asset name blocked.\n\n${args.duplicate.name} already exists in ${areaLabel}.\n\nYou cannot create or rename another asset with the same local asset number in the same AG.`;
}

export function filterUniqueAssetsForAreaImport(args: {
  existingAssets: SavedMapAsset[];
  importedAssets: SavedMapAsset[];
  activeAreaName?: string | null;
  activeAreaId?: string | null;
}): { assets: SavedMapAsset[]; duplicates: SavedMapAsset[] } {
  const accepted: SavedMapAsset[] = [];
  const duplicates: SavedMapAsset[] = [];

  for (const asset of args.importedAssets) {
    const geometryType = String((asset as any)?.geometry?.type || "").toLowerCase();
    const assetType = String((asset as any)?.assetType || "").toLowerCase();
    const isImportedPolygon =
      assetType === "area" ||
      assetType === "polygon" ||
      assetType === "project-area" ||
      geometryType === "polygon" ||
      geometryType === "multipolygon";

    if (isImportedPolygon) {
      accepted.push(asset);
      continue;
    }

    const duplicate = findDuplicateAssetInArea({
      assets: [...args.existingAssets, ...accepted],
      asset,
      activeAreaName: args.activeAreaName,
      activeAreaId: args.activeAreaId,
    });

    if (duplicate) {
      duplicates.push(asset);
    } else {
      accepted.push(asset);
    }
  }

  return { assets: accepted, duplicates };
}
