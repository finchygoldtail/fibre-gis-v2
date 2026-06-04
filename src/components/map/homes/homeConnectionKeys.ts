import type { SavedMapAsset } from "../types";

export function getHomeConnectionKey(asset: any): string {
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

export function getHomeDropKeys(asset: any): string[] {
  const raw = getHomeConnectionKey(asset);
  if (!raw) return [];
  return raw.startsWith("uprn-") ? [raw, raw.replace(/^uprn-/, "")] : [raw, `uprn-${raw}`];
}

export function getDropHomeKeys(drop: any): string[] {
  const raw = String(
    drop?.homeId ??
      drop?.toAssetId ??
      drop?.connectedHomeId ??
      drop?.uprn ??
      drop?.UPRN ??
      "",
  ).trim();

  if (!raw) return [];
  return raw.startsWith("uprn-") ? [raw, raw.replace(/^uprn-/, "")] : [raw, `uprn-${raw}`];
}

export function isHomeAsset(asset: SavedMapAsset | any): boolean {
  const text = [asset?.assetType, asset?.type, asset?.jointType, asset?.name, asset?.homeType, asset?.uprn]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return text.includes("home") || text.includes("uprn") || text.includes("premise") || text.includes("property");
}
