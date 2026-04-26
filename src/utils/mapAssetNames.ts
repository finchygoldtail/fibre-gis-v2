export type NamedAssetType =
  | "ag-joint"
  | "street-cab"
  | "pole"
  | "distribution-point"
  | "cable";

export function getAssetLabel(assetType: NamedAssetType): string {
  switch (assetType) {
    case "ag-joint":
      return "AG Joint";
    case "street-cab":
      return "Street Cab";
    case "pole":
      return "Pole";
    case "distribution-point":
      return "Distribution Point";
    case "cable":
      return "Cable";
    default:
      return "Asset";
  }
}

export function getNextAssetName(
  savedAssets: Array<{ assetType?: string }>,
  assetType: NamedAssetType
): string {
  const base = getAssetLabel(assetType);
  const count = savedAssets.filter((item) => item.assetType === assetType).length;
  return `${base} ${count + 1}`;
}