import React from "react";
export type MapContextAction =
  | "joint"
  | "pole"
  | "distribution-point"
  | "chamber"
  | "street-cab"
  | "cable"
  | "area";

type Props = {
  visible: boolean;
  x: number;
  y: number;
  onSelect: (action: MapContextAction) => void;
  onClose: () => void;
};

export default function MapContextMenu({
  visible,
  x,
  y,
  onSelect,
  onClose,
}: Props) {
  if (!visible) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
        }}
      />

      <div
        style={{
          position: "fixed",
          left: x,
          top: y,
          zIndex: 9999,
          minWidth: 220,
          background: "#111827",
          border: "1px solid #374151",
          borderRadius: 10,
          boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <button onClick={() => onSelect("joint")} style={menuButton}>
          Add Joint
        </button>

        <button onClick={() => onSelect("pole")} style={menuButton}>
          Add Pole
        </button>

        <button
          onClick={() => onSelect("distribution-point")}
          style={menuButton}
        >
          Add Distribution Point
        </button>

        <button onClick={() => onSelect("chamber")} style={menuButton}>
          Add Chamber
        </button>

        <button onClick={() => onSelect("street-cab")} style={menuButton}>
          Add Street Cab
        </button>

        <button onClick={() => onSelect("cable")} style={menuButton}>
          Add Cable
        </button>

        <button onClick={() => onSelect("area")} style={menuButton}>
          Draw Polygon Area
        </button>

        <button onClick={onClose} style={menuButton}>
          Cancel
        </button>
      </div>
    </>
  );
}

const menuButton: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  padding: "0.75rem 0.9rem",
  background: "#111827",
  color: "white",
  border: "none",
  borderBottom: "1px solid #1f2937",
  cursor: "pointer",
};