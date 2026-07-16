import React from "react";

type FieldNavigationBarProps = {
  variant: "mobile" | "tablet";
  hasSelectedAsset: boolean;
  onGpsLocate: () => void;
  onZoomToSelected: () => void;
  onOpenLayers: () => void;
  isSharingLocation?: boolean;
  liveUserCount?: number;
  locationShareError?: string;
  onToggleLocationSharing?: () => void;
};

const buttonBase: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.94)",
  color: "#f8fafc",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 8px 22px rgba(15,23,42,0.28)",
  backdropFilter: "blur(10px)",
};

export default function FieldNavigationBar({
  variant,
  hasSelectedAsset,
  onGpsLocate,
  onZoomToSelected,
  onOpenLayers,
  isSharingLocation = false,
  liveUserCount = 0,
  locationShareError = "",
  onToggleLocationSharing,
}: FieldNavigationBarProps) {
  const isMobile = variant === "mobile";

  return (
    <div
      style={{
        position: "absolute",
        top: isMobile ? 70 : 74,
        right: isMobile ? 10 : 18,
        zIndex: 1250,
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: 8,
        alignItems: "flex-end",
        pointerEvents: "auto",
      }}
    >
      <button
        type="button"
        onClick={onGpsLocate}
        style={{
          ...buttonBase,
          minWidth: isMobile ? 48 : 88,
          minHeight: isMobile ? 48 : 42,
          padding: isMobile ? "0 10px" : "0 14px",
          borderRadius: 999,
        }}
        title="Zoom to my GPS location"
      >
        GPS
      </button>

      {onToggleLocationSharing ? (
        <button
          type="button"
          onClick={onToggleLocationSharing}
          style={{
            ...buttonBase,
            minWidth: isMobile ? 48 : 104,
            minHeight: isMobile ? 48 : 42,
            padding: isMobile ? "0 10px" : "0 14px",
            borderRadius: 999,
            background: isSharingLocation ? "#dcfce7" : locationShareError ? "#fee2e2" : buttonBase.background,
            color: isSharingLocation ? "#14532d" : locationShareError ? "#991b1b" : buttonBase.color,
            border: isSharingLocation
              ? "1px solid rgba(34,197,94,0.65)"
              : locationShareError
                ? "1px solid rgba(248,113,113,0.65)"
                : buttonBase.border,
          }}
          title={locationShareError || (isSharingLocation ? "Stop sharing live location" : "Share live location")}
        >
          {isMobile ? (isSharingLocation ? "Live" : "Share") : isSharingLocation ? "Live On" : "Share"}
          {liveUserCount > 0 && !isMobile ? ` (${liveUserCount})` : ""}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onOpenLayers}
        style={{
          ...buttonBase,
          minWidth: isMobile ? 48 : 92,
          minHeight: isMobile ? 48 : 42,
          padding: isMobile ? "0 10px" : "0 14px",
          borderRadius: 999,
        }}
        title="Open map layers"
      >
        Layers
      </button>

      {hasSelectedAsset ? (
        <button
          type="button"
          onClick={onZoomToSelected}
          style={{
            ...buttonBase,
            minWidth: isMobile ? 48 : 118,
            minHeight: isMobile ? 48 : 42,
            padding: isMobile ? "0 10px" : "0 14px",
            borderRadius: 999,
          }}
          title="Zoom to selected asset"
        >
          {isMobile ? "Asset" : "Zoom asset"}
        </button>
      ) : null}
    </div>
  );
}
