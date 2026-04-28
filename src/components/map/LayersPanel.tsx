import React, { useState } from "react";

type BasemapType = "street" | "satellite" | "hybrid" | "dark";

type Props = {
  visibleLayers: Record<string, boolean>;
  setVisibleLayers: React.Dispatch<React.SetStateAction<any>>;
  basemap: BasemapType;
  setBasemap: React.Dispatch<React.SetStateAction<BasemapType>>;
  roadOverlayVisible: boolean;
  setRoadOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  snapEnabled: boolean;
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
};

type LayerOption = { label: string; key: string };
type LayerGroup = { id: string; title: string; options: LayerOption[] };

const layerGroups: LayerGroup[] = [
  { id: "polygons", title: "Polygons", options: [{ label: "All Polygons", key: "areas" }, { label: "L0", key: "l0" }, { label: "L1", key: "l1" }, { label: "L2", key: "l2" }, { label: "L3", key: "l3" }] },
  { id: "streetCabs", title: "Street Cabs", options: [{ label: "Street Cabs", key: "streetCabs" }] },
  { id: "poles", title: "Poles", options: [{ label: "All Poles", key: "poles" }, { label: "New Poles", key: "newPoles" }, { label: "OR Poles", key: "orPoles" }] },
  { id: "chambers", title: "Chambers", options: [{ label: "All Chambers", key: "chambers" }, { label: "FW2", key: "fw2" }, { label: "FW4", key: "fw4" }, { label: "FW6", key: "fw6" }, { label: "FW10", key: "fw10" }] },
  { id: "homes", title: "Homes", options: [{ label: "All Homes", key: "homes" }, { label: "SDU", key: "homesSdu" }, { label: "MDU", key: "homesMdu" }, { label: "Flats", key: "homesFlats" }] },
  { id: "cables", title: "Cables", options: [{ label: "All Cables", key: "cables" }, { label: "Feeders", key: "feeders" }, { label: "Links", key: "links" }, { label: "48 ULW", key: "ulw48" }, { label: "36 ULW", key: "ulw36" }, { label: "24 ULW", key: "ulw24" }, { label: "12 ULW", key: "ulw12" }] },
  { id: "distributionPoints", title: "DPs", options: [{ label: "Distribution Points", key: "distributionPoints" }] },
  { id: "status", title: "Status", options: [{ label: "Live", key: "live" }, { label: "BWIP", key: "bwip" }, { label: "Unserviceable", key: "unserviceable" }, { label: "Live not ready", key: "liveNotReady" }] },
  { id: "measurements", title: "Measurements", options: [{ label: "Measurements", key: "measurements" }] },
];

const panel: React.CSSProperties = { width: 260, maxWidth: "78vw", height: "100vh", color: "white", display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", padding: "10px 8px", boxSizing: "border-box" };
const card: React.CSSProperties = { background: "#374151", borderRadius: 8 };
const label: React.CSSProperties = { fontSize: "0.8rem", fontWeight: 700 };
const btnPrimary: React.CSSProperties = { background: "#2563eb", color: "white", padding: "0.42rem", borderRadius: 6, cursor: "pointer", border: "none", fontWeight: 700, fontSize: "0.82rem" };
const btnSecondary: React.CSSProperties = { background: "#374151", color: "white", padding: "0.42rem", borderRadius: 6, cursor: "pointer", border: "1px solid #4b5563", fontWeight: 700, fontSize: "0.82rem" };
const layerGroupCard: React.CSSProperties = { background: "#374151", borderRadius: 8, overflow: "hidden" };
const layerButton: React.CSSProperties = { width: "100%", background: "transparent", color: "#f9fafb", border: "none", cursor: "pointer", padding: "0.62rem 0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.82rem", fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.3 };
const dropdown: React.CSSProperties = { borderTop: "1px solid rgba(255,255,255,0.12)", padding: "0.5rem 0.75rem 0.65rem", display: "flex", flexDirection: "column", gap: 7, background: "rgba(15,23,42,0.22)" };
const layerRow: React.CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: "0.82rem", lineHeight: 1.2, whiteSpace: "normal" };

function LayerCheckbox({ labelText, layerKey, visibleLayers, onToggle }: { labelText: string; layerKey: string; visibleLayers: Record<string, boolean>; onToggle: (key: string) => void }) {
  return <label style={layerRow}><input type="checkbox" checked={visibleLayers[layerKey] !== false} onChange={() => onToggle(layerKey)} /><span>{labelText}</span></label>;
}

export default function LayersPanel({ visibleLayers, setVisibleLayers, basemap, setBasemap, roadOverlayVisible, setRoadOverlayVisible, snapEnabled, setSnapEnabled }: Props) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleLayer = (key: string) => setVisibleLayers((prev: Record<string, boolean>) => ({ ...prev, [key]: prev[key] === false }));
  const toggleGroup = (id: string) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={panel}>
      <h3 style={{ margin: 0, fontSize: "0.95rem" }}>Map View</h3>
      <div style={{ ...card, padding: "0.7rem" }}>
        <div style={label}>Basemap</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 7 }}>
          <button type="button" onClick={() => setBasemap("street")} style={basemap === "street" ? btnPrimary : btnSecondary}>Street</button>
          <button type="button" onClick={() => setBasemap("satellite")} style={basemap === "satellite" ? btnPrimary : btnSecondary}>Satellite</button>
          <button type="button" onClick={() => setBasemap("hybrid")} style={basemap === "hybrid" ? btnPrimary : btnSecondary}>Hybrid</button>
          <button type="button" onClick={() => setBasemap("dark")} style={basemap === "dark" ? btnPrimary : btnSecondary}>Dark</button>
        </div>
        <label style={{ ...layerRow, marginTop: 8 }}><input type="checkbox" checked={roadOverlayVisible} onChange={() => setRoadOverlayVisible((v) => !v)} disabled={basemap === "hybrid"} /><span>Road Overlay {basemap === "hybrid" ? "(included)" : ""}</span></label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {layerGroups.map((group) => {
          const isOpen = !!openGroups[group.id];
          return <div key={group.id} style={layerGroupCard}><button type="button" onClick={() => toggleGroup(group.id)} style={layerButton} aria-expanded={isOpen}><span>{group.title}</span><span aria-hidden="true" style={{ fontSize: "0.85rem", lineHeight: 1 }}>{isOpen ? "▲" : "▼"}</span></button>{isOpen && <div style={dropdown}>{group.options.map((option) => <LayerCheckbox key={option.key} labelText={option.label} layerKey={option.key} visibleLayers={visibleLayers} onToggle={toggleLayer} />)}</div>}</div>;
        })}
      </div>
      <div style={{ ...card, padding: "0.7rem" }}><div style={label}>Snapping</div><label style={{ ...layerRow, marginTop: 7 }}><input type="checkbox" checked={snapEnabled} onChange={() => setSnapEnabled((v) => !v)} /><span>Enable Snap</span></label></div>
    </div>
  );
}
