import React from "react";
import AssetMarkersLayer from "../AssetMarkersLayer";
import CableLinesLayer from "../CableLinesLayer";
import AreaPolygonsLayer from "../AreaPolygonsLayer";
import type { SavedMapAsset } from "../types";

export type MapOperationalLayersProps = {
  assets: SavedMapAsset[];
  visibleLayers: Record<string, boolean>;
  onAssetClick?: (asset: SavedMapAsset) => void;
  onAssetDoubleClick?: (asset: SavedMapAsset) => void;
  onCableClick?: (asset: SavedMapAsset) => void;
};

/**
 * Operational network layer wrapper.
 * This keeps marker/cable/polygon layer JSX out of JointMapManager.
 * If prop names differ in your current layer components, adjust this adapter only.
 */
export default function MapOperationalLayers({
  assets,
  visibleLayers,
  onAssetClick,
  onAssetDoubleClick,
  onCableClick,
}: MapOperationalLayersProps) {
  const areaAssets = assets.filter((asset) => asset.assetType === "area");
  const cableAssets = assets.filter((asset) => asset.assetType === "cable");
  const markerAssets = assets.filter(
    (asset) => asset.assetType !== "area" && asset.assetType !== "cable",
  );

  return (
    <>
      {visibleLayers.areas !== false && (
        <AreaPolygonsLayer assets={areaAssets} visibleLayers={visibleLayers as any} />
      )}

      {visibleLayers.cables !== false && (
        <CableLinesLayer
          assets={cableAssets}
          visibleLayers={visibleLayers as any}
          onCableClick={onCableClick as any}
        />
      )}

      <AssetMarkersLayer
        assets={markerAssets}
        visibleLayers={visibleLayers as any}
        onAssetClick={onAssetClick as any}
        onAssetDoubleClick={onAssetDoubleClick as any}
      />
    </>
  );
}
