import React from "react";
import AssetChangeLogPanel from "./AssetChangeLogPanel";
import type { SavedMapAsset } from "../types";

type Props = {
  visible: boolean;
  asset: SavedMapAsset | null;
  projectId?: string;
  onClose: () => void;
};

export default function MaintenanceAuditOverlay({
  visible,
  asset,
  projectId,
  onClose,
}: Props) {
  if (!visible || !asset) return null;

  return (
    <>
      <AssetChangeLogPanel
        visible={visible}
        asset={asset}
        projectId={projectId}
        onClose={onClose}
      />

      <button
        type="button"
        onClick={onClose}
        title="Close maintenance / audit history"
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 9000,
          background: "#dc2626",
          color: "white",
          border: "none",
          borderRadius: 10,
          padding: "8px 12px",
          cursor: "pointer",
          fontWeight: 900,
          boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
        }}
      >
        × Close Log
      </button>
    </>
  );
}
