import React from "react";
import type { MapMode } from "../../hooks/useMapDrawingState";
import FieldActionDock from "../shared/FieldActionDock";

type Props = {
  mapMode: MapMode;
  hasSelectedAsset: boolean;
  onOpenPanel: () => void;
  onPrepareAsset: () => void;
  onPrepareCable: () => void;
  onStartArea: () => void;
  onOpenLayers: () => void;
  onGpsLocate: () => void;
};

export default function BuildMobileControls({
  mapMode,
  hasSelectedAsset,
  onOpenPanel,
  onPrepareAsset,
  onPrepareCable,
  onStartArea,
  onOpenLayers,
  onGpsLocate,
}: Props) {
  return (
    <FieldActionDock
      variant="mobile"
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
        { key: "layers", label: "Layers", tone: "secondary", onClick: onOpenLayers },
        { key: "gps", label: "GPS", tone: "primary", onClick: onGpsLocate },
      ]}
    />
  );
}
