import React from "react";
import FieldActionDock from "../shared/FieldActionDock";

type Props = {
  hasSelectedAsset: boolean;
  onOpenPanel: () => void;
  onOpenLayers: () => void;
  onGpsLocate: () => void;
  onOpenMaintenance: () => void;
};

export default function MaintenanceMobileControls({
  hasSelectedAsset,
  onOpenPanel,
  onOpenLayers,
  onGpsLocate,
  onOpenMaintenance,
}: Props) {
  return (
    <FieldActionDock
      variant="mobile"
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
        { key: "gps", label: "GPS", tone: "primary", onClick: onGpsLocate },
      ]}
    />
  );
}
