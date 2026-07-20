import React from "react";
import type { CableSegmentInstallMethod } from "../../types";

type Props = {
  variant?: "mobile" | "tablet";
  pointCount: number;
  distanceLabel: string;
  installMethod: CableSegmentInstallMethod;
  isSaving: boolean;
  isEditing: boolean;
  onInstallMethodChange: (method: CableSegmentInstallMethod) => void;
  onUndo: () => void;
  onClear: () => void;
  onFinish: () => void;
  onClose: () => void;
};

export default function MobileCableDrawingSheet({
  variant = "mobile",
  pointCount,
  distanceLabel,
  installMethod,
  isSaving,
  isEditing,
  onInstallMethodChange,
  onUndo,
  onClear,
  onFinish,
  onClose,
}: Props) {
  const canFinish = pointCount >= 2 && !isSaving;
  const isTablet = variant === "tablet";

  return (
    <div style={getSheetStyle(isTablet)}>
      {!isTablet ? <div style={handle} /> : null}
      <div style={headerRow}>
        <div>
          <div style={kicker}>{isEditing ? "Edit cable route" : "Draw cable"}</div>
          <div style={title}>{pointCount} point{pointCount === 1 ? "" : "s"} · {distanceLabel}</div>
        </div>
        <button type="button" onClick={onClose} style={closeButton} aria-label="Close cable drawing">
          x
        </button>
      </div>

      <div style={spanBox}>
        <div style={spanLabel}>Next span</div>
        <div style={spanButtons}>
          <button
            type="button"
            onClick={() => onInstallMethodChange("Underground")}
            style={installMethod === "Underground" ? activeButton : secondaryButton}
          >
            UG
          </button>
          <button
            type="button"
            onClick={() => onInstallMethodChange("OH")}
            style={installMethod === "OH" ? activeButton : secondaryButton}
          >
            OH
          </button>
        </div>
        <div style={hint}>Choose UG or OH before placing the next point.</div>
      </div>

      <div style={getActionGridStyle(isTablet)}>
        <button type="button" onClick={onUndo} disabled={pointCount === 0} style={secondaryButton}>
          Undo
        </button>
        <button type="button" onClick={onClear} disabled={pointCount === 0} style={secondaryButton}>
          Clear
        </button>
        <button type="button" onClick={onFinish} disabled={!canFinish} style={primaryWideButton}>
          {isSaving ? "Saving..." : isEditing ? "Save Route" : "Finish Cable"}
        </button>
      </div>
    </div>
  );
}

const sheet: React.CSSProperties = {
  position: "absolute",
  left: 10,
  right: 10,
  bottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)",
  zIndex: 2480,
  borderRadius: 22,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(15,23,42,0.97)",
  color: "white",
  boxShadow: "0 18px 44px rgba(0,0,0,0.46)",
  padding: 14,
  backdropFilter: "blur(12px)",
};

function getSheetStyle(isTablet: boolean): React.CSSProperties {
  if (!isTablet) return sheet;

  return {
    ...sheet,
    left: "auto",
    right: 14,
    bottom: 18,
    width: 330,
    borderRadius: 18,
  };
}

const handle: React.CSSProperties = {
  width: 46,
  height: 5,
  borderRadius: 999,
  background: "rgba(148,163,184,0.55)",
  margin: "0 auto 12px",
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const kicker: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.8,
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  marginTop: 3,
  fontSize: 18,
  fontWeight: 900,
};

const closeButton: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(30,41,59,0.9)",
  color: "white",
  fontWeight: 900,
  flex: "0 0 auto",
};

const spanBox: React.CSSProperties = {
  marginTop: 12,
  padding: 10,
  borderRadius: 14,
  background: "rgba(30,41,59,0.78)",
  border: "1px solid rgba(148,163,184,0.22)",
};

const spanLabel: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 900,
  marginBottom: 8,
};

const spanButtons: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
};

const hint: React.CSSProperties = {
  marginTop: 7,
  color: "#94a3b8",
  fontSize: 12,
};

const actionGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 12,
};

function getActionGridStyle(isTablet: boolean): React.CSSProperties {
  if (!isTablet) return actionGrid;

  return {
    ...actionGrid,
    gridTemplateColumns: "1fr 1fr",
  };
}

const buttonBase: React.CSSProperties = {
  minHeight: 46,
  borderRadius: 14,
  color: "white",
  fontWeight: 900,
  fontSize: 13,
};

const activeButton: React.CSSProperties = {
  ...buttonBase,
  border: "1px solid rgba(96,165,250,0.7)",
  background: "#1d4ed8",
};

const secondaryButton: React.CSSProperties = {
  ...buttonBase,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "rgba(30,41,59,0.92)",
};

const primaryWideButton: React.CSSProperties = {
  ...buttonBase,
  gridColumn: "1 / -1",
  border: "none",
  background: "#2563eb",
};
