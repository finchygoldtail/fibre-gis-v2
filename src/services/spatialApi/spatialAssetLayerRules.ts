import type { LayerVisibility } from "../../components/map/hooks/useLayerVisibility";
import { shouldRequestSpatialAssetType } from "../../config/assetZoomRules";

export function getSpatialAssetTypesForLayers(
  visibleLayers: LayerVisibility,
  zoom: number,
): string[] {
  const types = new Set<string>();

  if (visibleLayers.agJoints) {
    types.add("ag-joint");
    types.add("joint");
  }

  if (visibleLayers.streetCabs) types.add("street-cab");

  if (visibleLayers.distributionPoints) {
    types.add("distribution-point");
    types.add("dp");
  }

  if (visibleLayers.poles) types.add("pole");
  if (visibleLayers.chambers) types.add("chamber");

  if (visibleLayers.cables) {
    types.add("cable");
    types.add("feederCable");
    types.add("linkCable");
    types.add("drop-cable");
  }

  if (visibleLayers.homes) types.add("home");

  return Array.from(types).filter((assetType) =>
    shouldRequestSpatialAssetType(assetType, zoom),
  );
}
