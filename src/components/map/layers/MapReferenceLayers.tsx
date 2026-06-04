import React from "react";
import OpenreachOverlayLayer from "../OpenreachOverlayLayer";
import { ExchangeMarkersLayer } from "../ExchangeMarkersLayer";
import type { SavedMapAsset } from "../types";
import type { ExchangeAsset } from "../storage/exchangeStorage";

export type MapReferenceLayersProps = {
  openreachAssets: SavedMapAsset[];
  exchanges: ExchangeAsset[];
  visibleLayers: Record<string, boolean>;
  onOpenExchange?: (exchange: ExchangeAsset) => void;
  onReferenceAssetClick?: (asset: SavedMapAsset) => void;
};

/**
 * Non-operational/reference layers such as OR/PIA and exchange markers.
 */
export default function MapReferenceLayers({
  openreachAssets,
  exchanges,
  visibleLayers,
  onOpenExchange,
  onReferenceAssetClick,
}: MapReferenceLayersProps) {
  return (
    <>
      <OpenreachOverlayLayer
        assets={openreachAssets}
        visibleLayers={visibleLayers as any}
        onAssetClick={onReferenceAssetClick as any}
      />

      <ExchangeMarkersLayer
        exchanges={exchanges}
        onOpenExchange={onOpenExchange as any}
      />
    </>
  );
}
