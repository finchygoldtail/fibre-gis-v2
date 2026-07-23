import React, { useState } from "react";

export type MapContextAction =
  | "joint"
  | "joint-lmj"
  | "joint-cmj"
  | "joint-mmj"
  | "joint-midj"
  | "joint-ug"
  | "joint-oh"
  | "pole"
  | "pole-or"
  | "pole-new"
  | "distribution-point"
  | "distribution-point-ug"
  | "distribution-point-oh"
  | "chamber"
  | "street-cab"
  | "data-centre"
  | "exchange"
  | "duct"
  | "cable"
  | "area"
  | "measure"
  | "drive-to-location"
  | "pick-location";

type Props = {
  visible: boolean;
  x: number;
  y: number;
  onSelect: (action: MapContextAction) => void;
  onClose: () => void;
};

type SubmenuKey = "assets" | "draw" | "tools" | null;
type AssetSubmenuKey = "joints" | "poles" | "dps" | null;

export default function MapContextMenu({
  visible,
  x,
  y,
  onSelect,
  onClose,
}: Props) {
  const [openSubmenu, setOpenSubmenu] = useState<SubmenuKey>(null);
  const [openAssetSubmenu, setOpenAssetSubmenu] = useState<AssetSubmenuKey>(null);

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

        <MenuRow
          label="Map Tools"
          hasSubmenu
          active={openSubmenu === "tools"}
          onMouseEnter={() => setOpenSubmenu("tools")}
        />

        <Divider />

        <MenuRow label="Cancel" danger onClick={onClose} />

        {openSubmenu === "assets" && (
          <Submenu top={4}>
            <MenuRow
              label="Joints"
              hasSubmenu
              active={openAssetSubmenu === "joints"}
              onMouseEnter={() => setOpenAssetSubmenu("joints")}
            />
            <MenuRow
              label="Poles"
              hasSubmenu
              active={openAssetSubmenu === "poles"}
              onMouseEnter={() => setOpenAssetSubmenu("poles")}
            />
            <MenuRow
              label="DPs"
              hasSubmenu
              active={openAssetSubmenu === "dps"}
              onMouseEnter={() => setOpenAssetSubmenu("dps")}
            />
            <MenuRow label="Create Chamber" onClick={() => select("chamber")} />
            <MenuRow label="Create Street Cab" onClick={() => select("street-cab")} />
            <MenuRow label="Create Data Centre" onClick={() => select("data-centre")} />
            <MenuRow label="Create Exchange" onClick={() => select("exchange")} />
          </Submenu>
        )}

        {openSubmenu === "assets" && openAssetSubmenu === "joints" && (
          <Submenu left={346} top={4}>
            <MenuRow label="LMJ Joint" onClick={() => select("joint-lmj")} />
            <MenuRow label="CMJ Joint" onClick={() => select("joint-cmj")} />
            <MenuRow label="MMJ Joint" onClick={() => select("joint-mmj")} />
            <MenuRow label="MidJ Joint" onClick={() => select("joint-midj")} />
            <Divider />
            <MenuRow label="UG Joint" onClick={() => select("joint-ug")} />
            <MenuRow label="Overhead Joint" onClick={() => select("joint-oh")} />
          </Submenu>
        )}

        {openSubmenu === "assets" && openAssetSubmenu === "poles" && (
          <Submenu left={346} top={32}>
            <MenuRow label="OR Pole" onClick={() => select("pole-or")} />
            <MenuRow label="New Pole" onClick={() => select("pole-new")} />
          </Submenu>
        )}

        {openSubmenu === "assets" && openAssetSubmenu === "dps" && (
          <Submenu left={346} top={60}>
            <MenuRow label="UG Joint / DP" onClick={() => select("distribution-point-ug")} />
            <MenuRow label="Overhead Joint / DP" onClick={() => select("distribution-point-oh")} />
          </Submenu>
        )}

        {openSubmenu === "draw" && (
          <Submenu top={34}>
            <MenuRow label="Create Duct" onClick={() => select("duct")} />
            <MenuRow label="Create Cable" onClick={() => select("cable")} />
            <MenuRow label="Create Polygon / Area" onClick={() => select("area")} />
          </Submenu>
        )}

        {openSubmenu === "tools" && (
          <Submenu top={64}>
            <MenuRow label="Measure Distance" onClick={() => select("measure")} />
            <MenuRow label="Drive To Location" onClick={() => select("drive-to-location")} />
            <MenuRow label="Pick Location" onClick={() => select("pick-location")} />
          </Submenu>
        )}
      </div>
    </>
  );
}

function Submenu({
  children,
  top,
  left = 168,
}: {
  children: React.ReactNode;
  top: number;
  left?: number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left,
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
