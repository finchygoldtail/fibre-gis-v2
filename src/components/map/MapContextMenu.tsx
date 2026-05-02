import React, { useState } from "react";

export type MapContextAction =
  | "joint"
  | "pole"
  | "distribution-point"
  | "chamber"
  | "street-cab"
  | "exchange"
  | "cable"
  | "area";

type Props = {
  visible: boolean;
  x: number;
  y: number;
  onSelect: (action: MapContextAction) => void;
  onClose: () => void;
};

type SubmenuKey = "assets" | "draw" | null;

export default function MapContextMenu({
  visible,
  x,
  y,
  onSelect,
  onClose,
}: Props) {
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKey>(null);

  if (!visible) return null;

  const select = (action: MapContextAction) => {
    onClose();
    onSelect(action);
  };

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
          width: 165,
          background: "#0f172a",
          border: "1px solid #1f2937",
          borderRadius: 8,
          boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
          padding: "4px 0",
          color: "#e5e7eb",
          fontSize: 13,
        }}
      >
        <MenuRow
          label="Add Asset"
          hasSubmenu
          active={openSubmenu === "assets"}
          onMouseEnter={() => setOpenSubmenu("assets")}
        />

        <MenuRow
          label="Draw"
          hasSubmenu
          active={openSubmenu === "draw"}
          onMouseEnter={() => setOpenSubmenu("draw")}
        />

        <Divider />

        <MenuRow label="Cancel" danger onClick={onClose} />

        {openSubmenu === "assets" && (
          <Submenu top={4}>
            <MenuRow label="Joint" onClick={() => select("joint")} />
            <MenuRow label="Pole" onClick={() => select("pole")} />
            <MenuRow
              label="Distribution Point"
              onClick={() => select("distribution-point")}
            />
            <MenuRow label="Chamber" onClick={() => select("chamber")} />
            <MenuRow label="Street Cab" onClick={() => select("street-cab")} />
            <MenuRow label="Exchange" onClick={() => select("exchange")} />
          </Submenu>
        )}

        {openSubmenu === "draw" && (
          <Submenu top={34}>
            <MenuRow label="Cable" onClick={() => select("cable")} />
            <MenuRow label="Polygon Area" onClick={() => select("area")} />
          </Submenu>
        )}
      </div>
    </>
  );
}

function Submenu({
  children,
  top,
}: {
  children: React.ReactNode;
  top: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: 168,
        top,
        width: 175,
        background: "#0f172a",
        border: "1px solid #1f2937",
        borderRadius: 8,
        boxShadow: "0 10px 28px rgba(0,0,0,0.45)",
        padding: "4px 0",
      }}
    >
      {children}
    </div>
  );
}

function MenuRow({
  label,
  onClick,
  onMouseEnter,
  hasSubmenu = false,
  active = false,
  danger = false,
}: {
  label: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  hasSubmenu?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  const [hover, setHover] = useState(false);

  const bg = active || hover ? "#1f2937" : "transparent";

  return (
    <div
      onClick={onClick}
      onMouseEnter={(e) => {
        setHover(true);
        onMouseEnter?.();
      }}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 28,
        padding: "0 10px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: bg,
        color: danger ? "#f87171" : "#e5e7eb",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      <span>{label}</span>
      {hasSubmenu && <span style={{ opacity: 0.65 }}>›</span>}
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        height: 1,
        background: "#1f2937",
        margin: "4px 0",
      }}
    />
  );
}