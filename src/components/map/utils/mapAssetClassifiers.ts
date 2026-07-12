import type { SavedMapAsset } from "../types";

export type NormalisedMapAssetKind =
  | "area"
  | "cable"
  | "chamber"
  | "distribution-point"
  | "exchange"
  | "home"
  | "joint"
  | "pole"
  | "street-cab"
  | "unknown";

function text(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function compact(value: unknown): string {
  return text(value).replace(/[\s_-]+/g, "");
}

export function getAssetKind(asset: SavedMapAsset | null | undefined): NormalisedMapAssetKind {
  const item = (asset || {}) as any;
  const assetType = text(item.assetType || item.type);
  const jointType = text(item.jointType || item.assetSubtype || item.referenceSubtype);
  const name = text(item.name || item.label || item.id);
  const assetTypeCompact = compact(item.assetType || item.type);

  if (!asset) return "unknown";

  if (assetType === "area" || assetType === "polygon" || assetType === "project-area") return "area";
  if (assetType === "exchange" || jointType === "exchange") return "exchange";
  if (assetType === "home" || assetType === "premise" || assetType === "premises") return "home";
  if (assetType === "cable" || assetType.endsWith("-cable") || assetTypeCompact.endsWith("cable")) return "cable";

  if (
    assetType === "distribution-point" ||
    assetType === "dp" ||
    assetTypeCompact === "distributionpoint" ||
    assetType.includes("distribution") ||
    /^sb\d+$/i.test(String(item.name || "").trim()) ||
    /(^|[-_\s])sb\d+$/i.test(String(item.name || "").trim())
  ) {
    return "distribution-point";
  }

  if (assetType === "street-cab" || assetType === "street cab" || assetType === "cabinet" || assetTypeCompact === "streetcab") {
    return "street-cab";
  }

  if (assetType === "pole" || jointType === "pole" || jointType.includes("pole")) return "pole";

  if (
    assetType === "chamber" ||
    jointType === "chamber" ||
    jointType.includes("chamber") ||
    name.includes("chamber")
  ) {
    return "chamber";
  }

  if (
    assetType === "ag-joint" ||
    assetType === "joint" ||
    assetType.includes("joint") ||
    jointType.includes("joint") ||
    name.includes("cmj") ||
    name.includes("mmj") ||
    name.includes("lmj") ||
    name.includes("midj")
  ) {
    return "joint";
  }

  return "unknown";
}

export function isAreaAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "area";
}

export function isCableAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "cable";
}

export function isChamberAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "chamber";
}

export function isDistributionPointAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "distribution-point";
}

export function isExchangeAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "exchange";
}

export function isHomeAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "home";
}

export function isJointAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "joint";
}

export function isPoleAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "pole";
}

export function isStreetCabAsset(asset: SavedMapAsset | null | undefined): boolean {
  return getAssetKind(asset) === "street-cab";
}

export function isPointNetworkAsset(asset: SavedMapAsset | null | undefined): boolean {
  const kind = getAssetKind(asset);
  return (
    kind === "joint" ||
    kind === "distribution-point" ||
    kind === "pole" ||
    kind === "chamber" ||
    kind === "street-cab" ||
    kind === "exchange"
  );
}
