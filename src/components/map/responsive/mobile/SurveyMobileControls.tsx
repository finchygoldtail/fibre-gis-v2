import React from "react";
import type { MapMode } from "../../hooks/useMapDrawingState";
import FieldActionDock from "../shared/FieldActionDock";

type Props = {
  mapMode: MapMode;
  selectedMoveHomeCount: number;
  selectedDeleteHomeCount: number;
  onOpenPanel: () => void;
  onOpenLayers: () => void;
  onRefreshMapAssets?: () => void;
  isRefreshingMapAssets?: boolean;
  onGpsLocate: () => void;
  onToggleMoveHomes: () => void;
  onToggleDeleteHomes: () => void;
};

export default function SurveyMobileControls({
  mapMode,
  selectedMoveHomeCount,
  selectedDeleteHomeCount,
  onOpenPanel,
  onOpenLayers,
  onRefreshMapAssets,
  isRefreshingMapAssets = false,
  onGpsLocate,
  onToggleMoveHomes,
  onToggleDeleteHomes,
}: Props) {
  return (
    <FieldActionDock
      variant="mobile"
      actions={[
        { key: "panel", label: "Asset Panel", tone: "secondary", onClick: onOpenPanel },
        {
          key: "move",
          label: `Move ${selectedMoveHomeCount || "Homes"}`,
          tone: mapMode === "move-homes" ? "primary" : "secondary",
          active: mapMode === "move-homes",
          onClick: onToggleMoveHomes,
        },
        {
          key: "delete",
          label: `Delete ${selectedDeleteHomeCount || "Homes"}`,
          tone: mapMode === "survey-delete-homes" ? "danger" : "secondary",
          active: mapMode === "survey-delete-homes",
          onClick: onToggleDeleteHomes,
        },
        { key: "layers", label: "Layers", tone: "secondary", onClick: onOpenLayers },
        ...(onRefreshMapAssets
          ? [{
              key: "refresh",
              label: isRefreshingMapAssets ? "Refreshing" : "Refresh",
              tone: "secondary" as const,
              disabled: isRefreshingMapAssets,
              onClick: onRefreshMapAssets,
            }]
          : []),
        { key: "gps", label: "GPS", tone: "primary", onClick: onGpsLocate },
      ]}
    />
  );
}
