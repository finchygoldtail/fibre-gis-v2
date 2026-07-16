import React from "react";
import type { MapMode } from "../../hooks/useMapDrawingState";

type Props = {
  variant: "mobile" | "tablet";
  role: "survey" | "maintenance";
  isOpen: boolean;
  currentAssetName?: string | null;
  mapMode: MapMode;
  selectedMoveHomeCount: number;
  selectedDeleteHomeCount: number;
  onToggle: () => void;
  onClose: () => void;
  onOpenPanel: () => void;
  onOpenLayers: () => void;
  onRefreshMapAssets?: () => void;
  isRefreshingMapAssets?: boolean;
  onGpsLocate: () => void;
  isSharingLocation?: boolean;
  liveUserCount?: number;
  onToggleLocationSharing?: () => void;
  onToggleMoveHomes: () => void;
  onToggleDeleteHomes: () => void;
  onOpenMaintenance: () => void;
};

const buttonBase: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.35)",
  borderRadius: 12,
  color: "white",
  fontWeight: 900,
  fontSize: 12,
  padding: "10px 12px",
  cursor: "pointer",
  textAlign: "left",
};

function drawerButton(
  tone: "primary" | "secondary" | "danger" = "secondary",
  active = false,
): React.CSSProperties {
  return {
    ...buttonBase,
    background:
      tone === "danger"
        ? "#991b1b"
        : tone === "primary" || active
          ? "#1d4ed8"
          : "#334155",
    border:
      tone === "danger"
        ? "1px solid rgba(248, 113, 113, 0.7)"
        : buttonBase.border,
  };
}

export default function FieldQuickActionDrawer({
  variant,
  role,
  isOpen,
  currentAssetName,
  mapMode,
  selectedMoveHomeCount,
  selectedDeleteHomeCount,
  onToggle,
  onClose,
  onOpenPanel,
  onOpenLayers,
  onRefreshMapAssets,
  isRefreshingMapAssets = false,
  onGpsLocate,
  isSharingLocation = false,
  liveUserCount = 0,
  onToggleLocationSharing,
  onToggleMoveHomes,
  onToggleDeleteHomes,
  onOpenMaintenance,
}: Props) {
  const isMobile = variant === "mobile";
  const title = role === "maintenance" ? "Maintenance Tools" : "Survey Tools";

  const run = (action: () => void, closeAfter = true) => {
    action();
    if (closeAfter) onClose();
  };

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 2450,
        top: isMobile ? 72 : 78,
        left: 12,
        width: isMobile ? 52 : 58,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: isMobile ? 52 : 58,
          height: isMobile ? 52 : 58,
          borderRadius: 18,
          border: "1px solid rgba(147, 197, 253, 0.7)",
          background: isOpen ? "#1d4ed8" : "rgba(15, 23, 42, 0.94)",
          color: "white",
          fontWeight: 1000,
          fontSize: 12,
          boxShadow: "0 14px 34px rgba(0,0,0,0.42)",
          cursor: "pointer",
        }}
        title={isOpen ? "Close field actions" : "Open field actions"}
      >
        Field
      </button>

      {isOpen && (
        <div
          style={{
            marginTop: 10,
            width: isMobile ? "calc(100vw - 24px)" : 260,
            maxWidth: isMobile ? 360 : 280,
            padding: 12,
            borderRadius: 18,
            background: "rgba(15, 23, 42, 0.97)",
            border: "1px solid rgba(148, 163, 184, 0.35)",
            boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ color: "#93c5fd", fontWeight: 900, fontSize: 12 }}>
                {title}
              </div>
              <div style={{ color: "#cbd5e1", fontSize: 11, marginTop: 3 }}>
                {currentAssetName ? `Asset: ${currentAssetName}` : "No asset selected"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: "none",
                background: "transparent",
                color: "#cbd5e1",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          </div>

          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            <button type="button" onClick={() => run(onOpenPanel)} style={drawerButton()}>
              Open Asset Panel
            </button>
            <button type="button" onClick={() => run(onOpenLayers)} style={drawerButton()}>
              Layers / Map View
            </button>
            {onRefreshMapAssets ? (
              <button
                type="button"
                onClick={() => run(onRefreshMapAssets, false)}
                style={drawerButton("secondary", isRefreshingMapAssets)}
                disabled={isRefreshingMapAssets}
              >
                {isRefreshingMapAssets ? "Refreshing Map" : "Refresh Map"}
              </button>
            ) : null}
            <button type="button" onClick={() => run(onGpsLocate)} style={drawerButton("primary")}>
              GPS Locate
            </button>
            {onToggleLocationSharing ? (
              <button
                type="button"
                onClick={() => run(onToggleLocationSharing, false)}
                style={drawerButton("secondary", isSharingLocation)}
              >
                {isSharingLocation ? "Stop Sharing Location" : "Share My Location"}
                {liveUserCount > 0 ? ` (${liveUserCount})` : ""}
              </button>
            ) : null}

            {role === "survey" ? (
              <>
                <button
                  type="button"
                  onClick={() => run(onToggleMoveHomes, false)}
                  style={drawerButton("secondary", mapMode === "move-homes")}
                >
                  {mapMode === "move-homes" ? "Exit Move Homes" : "Move Homes"}
                  {selectedMoveHomeCount > 0 ? ` (${selectedMoveHomeCount})` : ""}
                </button>
                <button
                  type="button"
                  onClick={() => run(onToggleDeleteHomes, false)}
                  style={drawerButton("danger", mapMode === "survey-delete-homes")}
                >
                  {mapMode === "survey-delete-homes" ? "Exit Delete Homes" : "Delete Homes"}
                  {selectedDeleteHomeCount > 0 ? ` (${selectedDeleteHomeCount})` : ""}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => run(onOpenMaintenance)}
                style={drawerButton(currentAssetName ? "primary" : "secondary")}
              >
                {currentAssetName ? "Open Maintenance History" : "Select Asset For History"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
