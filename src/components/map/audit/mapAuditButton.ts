import type { SavedMapAsset } from "../types";

function getAssetAuditTypeText(asset: SavedMapAsset): string {
  return String(
    (asset as any).assetType ||
      (asset as any).type ||
      (asset as any).jointType ||
      "",
  ).toLowerCase();
}

export function getAuditButtonLabel(asset: SavedMapAsset): string {
  const type = getAssetAuditTypeText(asset);
  if (type.includes("joint") || type.includes("cmj") || type.includes("lmj")) return "Audit Joint";
  if (type.includes("chamber")) return "Audit Chamber";
  if (type.includes("pole")) return "Audit Pole";
  if (type.includes("distribution") || type === "dp") return "Audit DP";
  if (type.includes("cab")) return "Audit Street Cab";
  if (type.includes("home")) return "Audit Home";
  return "Audit Asset";
}

export function hasAuditFormTemplate(asset: SavedMapAsset): boolean {
  const type = getAssetAuditTypeText(asset);
  return (
    type.includes("joint") ||
    type.includes("cmj") ||
    type.includes("lmj") ||
    type.includes("chamber") ||
    type.includes("pole")
  );
}
