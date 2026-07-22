import type { SavedMapAsset } from "../components/map/types";

function titleCase(value: string): string {
  const cleaned = value.replace(/-/g, " ").trim();
  return cleaned ? cleaned.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Asset";
}

export function getAssetDisplayName(asset: SavedMapAsset | null | undefined, fallback = "Asset"): string {
  const item = (asset || {}) as any;

  return String(
    item.name ||
      item.label ||
      item.jointName ||
      item.address ||
      item.properties?.address ||
      item.uprn ||
      item.UPRN ||
      item.id ||
      fallback,
  );
}

export function getAssetTypeLabel(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;

  if (item.assetType === "street-cab") return "Street Cab";
  if (item.assetType === "distribution-point") return "Distribution Point";
  if (item.assetType === "duct") {
    const count = Number(item.ductCount || 1);
    const diameter = Number(item.ductDiameterMm || 96);
    return `${Number.isFinite(count) ? count : 1} x ${Number.isFinite(diameter) ? diameter : 96}mm Duct`;
  }
  if (item.assetType === "cable") return String(item.cableType || "Cable");

  return titleCase(String(item.assetType || item.type || item.jointType || item.homeType || "asset"));
}

export function getAssetSearchText(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;

  return [
    item.id,
    item.assetId,
    item.name,
    item.jointName,
    item.label,
    item.cableId,
    item.cableName,
    item.assetType,
    item.type,
    item.jointType,
    item.cableType,
    item.ductCount,
    item.ductDiameterMm,
    item.ductUse,
    ...(Array.isArray(item.linkedCableIds) ? item.linkedCableIds : []),
    item.address,
    item.properties?.address,
    item.uprn,
    item.UPRN,
    item.status,
    item.buildStatus,
    item.piaNoi,
    item.piNoi,
    item.properties?.name,
    item.properties?.label,
    item.properties?.uprn,
    item.properties?.UPRN,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .filter(Boolean)
    .join(" ");
}
