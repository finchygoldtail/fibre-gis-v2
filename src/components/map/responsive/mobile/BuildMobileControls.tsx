import React from "react";
import type { MapMode } from "../../hooks/useMapDrawingState";
import FieldActionDock from "../shared/FieldActionDock";

type Props = {
  variant?: "mobile" | "tablet";
  mapMode: MapMode;
  hasSelectedAsset: boolean;
  onOpenPanel: () => void;
  onPrepareAsset: () => void;
  onPrepareCable: () => void;
  onStartArea: () => void;
  onOpenLayers: () => void;
  onRefreshMapAssets?: () => void;
  isRefreshingMapAssets?: boolean;
  onGpsLocate: () => void;
};

export default function BuildMobileControls({
  variant = "mobile",
  mapMode,
  hasSelectedAsset,
  onOpenPanel,
  onPrepareAsset,
  onPrepareCable,
  onStartArea,
  onOpenLayers,
  onRefreshMapAssets,
  isRefreshingMapAssets = false,
  onGpsLocate,
}: Props) {
  const isTablet = variant === "tablet";

  return (
    <FieldActionDock
      variant={variant}
      actions={[
        {
          key: "panel",
          label: hasSelectedAsset ? "Details" : "Panel",
          tone: hasSelectedAsset ? "primary" : "secondary",
          onClick: onOpenPanel,
        },
        {
          key: "asset",
          label: "Asset",
          tone: mapMode === "pick" ? "primary" : "secondary",
          onClick: onPrepareAsset,
        },
        {
          key: "cable",
          label: mapMode === "draw-cable" ? "Drawing" : "Cable",
          tone: mapMode === "draw-cable" ? "primary" : "secondary",
          active: mapMode === "draw-cable",
          onClick: onPrepareCable,
        },
        {
          key: "area",
          label: "Area",
          tone: mapMode === "draw-area" ? "primary" : "secondary",
          active: mapMode === "draw-area",
          onClick: onStartArea,
        },
        ...(isTablet && onRefreshMapAssets
          ? [
              {
                key: "refresh",
                label: isRefreshingMapAssets ? "Refreshing" : "Refresh",
                tone: "secondary" as const,
                disabled: isRefreshingMapAssets,
                onClick: onRefreshMapAssets,
              },
            ]
          : []),
        ...(!isTablet
          ? [
              {
                key: "layers",
                label: "Layers",
                tone: "secondary" as const,
                onClick: onOpenLayers,
              },
              {
                key: "gps",
                label: "GPS",
                tone: "primary" as const,
                onClick: onGpsLocate,
              },
            ]
          : []),
      ]}
    />
  );
}
