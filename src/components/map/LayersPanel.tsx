import React from "react";

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

const card: React.CSSProperties = {
  background: "#374151",
  padding: "1rem",
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const sectionTitle: React.CSSProperties = {
  fontSize: "0.95rem",
  fontWeight: 800,
  marginBottom: 2,
  color: "#f9fafb",
  textTransform: "uppercase",
  letterSpacing: 0.4,
};

const label: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
  fontWeight: 700,
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
  fontWeight: 700,
};

const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: "0.95rem",
};

function LayerCheckbox({
  labelText,
  layerKey,
  visibleLayers,
  onToggle,
}: {
  labelText: string;
  layerKey: string;
  visibleLayers: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <label style={layerRow}>
      <input
        type="checkbox"
        checked={visibleLayers[layerKey] !== false}
        onChange={() => onToggle(layerKey)}
      />
      <span>{labelText}</span>
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={card}>
      <div style={sectionTitle}>{title}</div>
      {children}
    </div>
  );
}

export default function LayersPanel({
  visibleLayers,
  setVisibleLayers,
  basemap,
  setBasemap,
  roadOverlayVisible,
  setRoadOverlayVisible,
  snapEnabled,
  setSnapEnabled,
}: Props) {
  const toggleLayer = (key: string) => {
    setVisibleLayers((prev: Record<string, boolean>) => ({
      ...prev,
      [key]: prev[key] === false,
    }));
  };

  return (
    <div
      style={{
        position: "absolute",
        top: 60,
        right: 16,
        width: 320,
        zIndex: 1000,
        background: "#1f2937",
        color: "white",
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        border: "1px solid #374151",
        borderRadius: 12,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
      }}
    >
      <h3 style={{ margin: 0 }}>Map View</h3>

      <div style={card}>
        <div style={label}>Basemap</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button onClick={() => setBasemap("street")} style={basemap === "street" ? btnPrimary : btnSecondary}>Street</button>
          <button onClick={() => setBasemap("satellite")} style={basemap === "satellite" ? btnPrimary : btnSecondary}>Satellite</button>
          <button onClick={() => setBasemap("hybrid")} style={basemap === "hybrid" ? btnPrimary : btnSecondary}>Hybrid</button>
          <button onClick={() => setBasemap("dark")} style={basemap === "dark" ? btnPrimary : btnSecondary}>Dark</button>
        </div>

        <label style={{ ...layerRow, marginTop: 10 }}>
          <input
            type="checkbox"
            checked={roadOverlayVisible}
            onChange={() => setRoadOverlayVisible((v) => !v)}
            disabled={basemap === "hybrid"}
          />
          <span>Road Overlay {basemap === "hybrid" ? "(included)" : ""}</span>
        </label>
      </div>

      <h3 style={{ margin: 0 }}>Layers</h3>

      <Section title="Polygons">
        <LayerCheckbox labelText="L0" layerKey="l0" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="L1" layerKey="l1" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="L2" layerKey="l2" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="L3" layerKey="l3" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Street Cabs">
        <LayerCheckbox labelText="STREET CABS" layerKey="streetCabs" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Poles">
        <LayerCheckbox labelText="New Poles" layerKey="newPoles" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="OR Poles" layerKey="orPoles" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Chambers">
        <LayerCheckbox labelText="FW2" layerKey="fw2" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="FW4" layerKey="fw4" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="FW6" layerKey="fw6" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="FW10" layerKey="fw10" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Homes">
        <LayerCheckbox labelText="SDU" layerKey="homesSdu" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="MDU" layerKey="homesMdu" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="Flats" layerKey="homesFlats" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Cables">
        <LayerCheckbox labelText="Feeders" layerKey="feeders" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="Links" layerKey="links" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="48 ULW" layerKey="ulw48" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="36 ULW" layerKey="ulw36" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="24 ULW" layerKey="ulw24" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="12 ULW" layerKey="ulw12" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Distribution Points">
        <LayerCheckbox labelText="Distribution Points" layerKey="distributionPoints" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <Section title="Status">
        <LayerCheckbox labelText="Live" layerKey="live" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="BWIP" layerKey="bwip" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="Unserviceable" layerKey="unserviceable" visibleLayers={visibleLayers} onToggle={toggleLayer} />
        <LayerCheckbox labelText="Live not ready for service" layerKey="liveNotReady" visibleLayers={visibleLayers} onToggle={toggleLayer} />
      </Section>

      <div style={card}>
        <div style={label}>Snapping</div>
        <label style={layerRow}>
          <input type="checkbox" checked={snapEnabled} onChange={() => setSnapEnabled((v) => !v)} />
          <span>Enable Snap</span>
        </label>
      </div>
    </div>
  );
}
