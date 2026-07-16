import React from "react";
import FieldActionDock from "../shared/FieldActionDock";

type Props = {
  hasSelectedAsset: boolean;
  onOpenPanel: () => void;
  onOpenLayers: () => void;
  onRefreshMapAssets?: () => void;
  isRefreshingMapAssets?: boolean;
  onGpsLocate: () => void;
  onOpenMaintenance: () => void;
};

export default function MaintenanceTabletControls({
  hasSelectedAsset,
  onOpenPanel,
  onOpenLayers,
  onRefreshMapAssets,
  isRefreshingMapAssets = false,
  onGpsLocate,
  onOpenMaintenance,
}: Props) {
  return (
    <FieldActionDock
      variant="tablet"
      actions={[
        { key: "panel", label: "Asset Panel", tone: "secondary", onClick: onOpenPanel },
        {
          key: "audit",
          label: "Audit Log",
          tone: hasSelectedAsset ? "primary" : "secondary",
          disabled: !hasSelectedAsset,
          title: hasSelectedAsset ? "Open maintenance history" : "Open an asset first",
          onClick: onOpenMaintenance,
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
