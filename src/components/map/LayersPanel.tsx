import React, { useState } from "react";
import { formatDistance } from "../../utils/mapMeasure";
import { PIA_QA_LAYER_GROUP } from "./pia/piaQaLayerGroup";

type BasemapType = "street" | "satellite" | "hybrid" | "dark";

type Props = {
  qaMode?: "qa" | "piaQa";
  visibleLayers: Record<string, boolean>;
  setVisibleLayers: React.Dispatch<React.SetStateAction<any>>;
  basemap: BasemapType;
  setBasemap: React.Dispatch<React.SetStateAction<BasemapType>>;
  roadOverlayVisible: boolean;
  setRoadOverlayVisible: React.Dispatch<React.SetStateAction<boolean>>;
  snapEnabled: boolean;
  setSnapEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  layerCounts?: Record<string, number>;
  measurementDistance?: number;
  measurementPointCount?: number;
  isMeasuring?: boolean;
  isDrivingToLocation?: boolean;
  onStartMeasurement?: () => void;
  onStopMeasurement?: () => void;
  onUndoMeasurementPoint?: () => void;
  onClearMeasurements?: () => void;
  onStartDriveToLocation?: () => void;
  onStopDriveToLocation?: () => void;
};

type LayerOption = { label: string; key: string };
type LayerGroup = { id: string; title: string; options: LayerOption[] };

const layerGroups: LayerGroup[] = [
  {
    id: "polygons",
    title: "Polygons",
    options: [
      { label: "All Polygons", key: "areas" },
      { label: "L0", key: "l0" },
      { label: "L1", key: "l1" },
      { label: "L2", key: "l2" },
      { label: "L3", key: "l3" },
    ],
  },
  {
  id: "joints",
  title: "Joints",
  options: [
    { label: "All Joints", key: "agJoints" },
    { label: "CMJs", key: "cmjJoints" },
    { label: "MidJs", key: "midjJoints" },
    { label: "MMJs", key: "mmjJoints" },
    { label: "LMJs", key: "lmjJoints" },
  ],
},
  {
    id: "streetCabs",
    title: "Street Cabs",
    options: [{ label: "Street Cabs", key: "streetCabs" }],
  },
  {
    id: "poles",
    title: "Poles",
    options: [
      { label: "All Poles", key: "poles" },
      { label: "NP / New Poles", key: "newPoles" },
      { label: "OR Poles", key: "orPoles" },
      { label: "Suggested Poles", key: "suggestedPoles" },
    ],
  },
  {
    id: "chambers",
    title: "Chambers",
    options: [
      { label: "All Chambers", key: "chambers" },
      { label: "OR Chambers", key: "orChambers" },
      { label: "Suggested Chambers", key: "suggestedChambers" },
      { label: "FW2", key: "fw2" },
      { label: "FW4", key: "fw4" },
      { label: "FW6", key: "fw6" },
      { label: "FW10", key: "fw10" },
    ],
  },
  {
    id: "homes",
    title: "Homes",
    options: [
      { label: "All Homes", key: "homes" },
      { label: "Connected Homes", key: "homesConnected" },
      { label: "Unconnected Homes", key: "homesUnconnected" },
      { label: "Live Homes", key: "homesLive" },
      { label: "SDU", key: "homesSdu" },
      { label: "MDU", key: "homesMdu" },
      { label: "Flats", key: "homesFlats" },
    ],
  },
  {
    id: "cables",
    title: "Cables / UG Routes",
    options: [
      { label: "All Cables / UG Routes", key: "cables" },
      { label: "Feeders", key: "feeders" },
      { label: "Links", key: "links" },
      { label: "Drop Cables / UG Routes", key: "dropCables" },
      { label: "96 ULW", key: "ulw96" },
      { label: "48 ULW", key: "ulw48" },
      { label: "36 ULW", key: "ulw36" },
      { label: "24 ULW", key: "ulw24" },
      { label: "12 ULW", key: "ulw12" },
      { label: "OR Ducts", key: "orDucts" },
      { label: "Suggested Ducts", key: "suggestedDucts" },
    ],
  },
  {
    id: "distributionPoints",
    title: "DPs",
    options: [
      { label: "All DPs", key: "distributionPoints" },
      { label: "OH Joints", key: "ohDpJoints" },
      { label: "UG Joints", key: "ugDpJoints" },
    ],
  },
  {
    id: "status",
    title: "Status",
    options: [
      { label: "Live", key: "live" },
      { label: "BWIP", key: "bwip" },
      { label: "Unserviceable", key: "unserviceable" },
      { label: "Live not ready", key: "liveNotReady" },
    ],
  },
  {
    id: "fieldUsers",
    title: "Field Users",
    options: [{ label: "Live Field Users", key: "liveUsers" }],
  },
  PIA_QA_LAYER_GROUP,
  {
    id: "measurements",
    title: "Measurements",
    options: [
      { label: "Measurements", key: "measurements" },
      { label: "Cable distances", key: "cableDistances" },
      { label: "OR Labels", key: "orLabels" },
    ],
  },
];

const panel: React.CSSProperties = {
  width: 260,
  maxWidth: "78vw",
  height: "100vh",
  color: "white",
  display: "flex",
  flexDirection: "column",
  gap: 8,
  overflowY: "auto",
  padding: "10px 8px",
  boxSizing: "border-box",
  background: "#0b1220",
  borderLeft: "1px solid rgba(96,165,250,0.28)",
};

const card: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #2563eb",
  borderRadius: 12,
  boxShadow: "0 10px 26px rgba(15,23,42,0.35)",
};
const label: React.CSSProperties = {
  fontSize: "0.8rem",
  fontWeight: 800,
  color: "#bfdbfe",
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "0.42rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
  fontWeight: 700,
  fontSize: "0.82rem",
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.42rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
  fontWeight: 700,
  fontSize: "0.82rem",
};

const btnDanger: React.CSSProperties = {
  background: "#dc2626",
  color: "white",
  padding: "0.42rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
  fontWeight: 800,
  fontSize: "0.82rem",
};

const layerGroupCard: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(37,99,235,0.6)",
  borderRadius: 12,
  overflow: "hidden",
  boxShadow: "0 8px 20px rgba(15,23,42,0.28)",
};

const layerButton: React.CSSProperties = {
  width: "100%",
  background: "transparent",
  color: "#f9fafb",
  border: "none",
  cursor: "pointer",
  padding: "0.62rem 0.75rem",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  fontSize: "0.82rem",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const dropdown: React.CSSProperties = {
  borderTop: "1px solid rgba(255,255,255,0.12)",
  padding: "0.5rem 0.75rem 0.65rem",
  display: "flex",
  flexDirection: "column",
  gap: 7,
  background: "rgba(15,23,42,0.22)",
};

const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: "0.82rem",
  lineHeight: 1.2,
  whiteSpace: "normal",
};

function LayerCheckbox({
  labelText,
  layerKey,
  visibleLayers,
  onToggle,
  count,
}: {
  labelText: string;
  layerKey: string;
  visibleLayers: Record<string, boolean>;
  onToggle: (key: string) => void;
  count?: number;
}) {
  return (
    <label style={layerRow}>
      <input
        type="checkbox"
        checked={visibleLayers[layerKey] !== false}
        onChange={() => onToggle(layerKey)}
      />
      <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span>{labelText}</span>
        {typeof count === "number" ? (
          <span
            style={{
              color: "#93c5fd",
              fontSize: "0.75rem",
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            ({count})
          </span>
        ) : null}
      </span>
    </label>
  );
}

export default function LayersPanel({
  qaMode = "qa",
  visibleLayers,
  setVisibleLayers,
  basemap,
  setBasemap,
  roadOverlayVisible,
  setRoadOverlayVisible,
  snapEnabled,
  setSnapEnabled,
  layerCounts = {},
  measurementDistance = 0,
  measurementPointCount = 0,
  isMeasuring = false,
  isDrivingToLocation = false,
  onStartMeasurement,
  onStopMeasurement,
  onUndoMeasurementPoint,
  onClearMeasurements,
  onStartDriveToLocation,
  onStopDriveToLocation,
}: Props) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    openreachReference: true,
  });
  const [measurementToolsOpen, setMeasurementToolsOpen] = useState(false);

  const displayedLayerGroups =
    qaMode === "piaQa"
      ? layerGroups.filter((group) =>
          ["poles", "chambers", "cables", "piaQa", "measurements"].includes(
            group.id,
          ),
        )
      : layerGroups.filter((group) => group.id !== "piaQa");

  const toggleLayer = (key: string) =>
    setVisibleLayers((prev: Record<string, boolean>) => {
      const next = !(prev[key] !== false);

      if (key === "areas") {
        return {
          ...prev,
          areas: next,
          l0: next,
          l1: next,
          l2: next,
          l3: next,
        };
      }

      if (key === "poles") {
        return {
          ...prev,
          poles: next,
          newPoles: next,
          orPoles: next,
          suggestedPoles: next,
        };
      }

      if (key === "chambers") {
        return {
          ...prev,
          chambers: next,
          orChambers: next,
          suggestedChambers: next,
          fw2: next,
          fw4: next,
          fw6: next,
          fw10: next,
        };
      }

      if (key === "homes") {
        return {
          ...prev,
          homes: next,
          homesConnected: next,
          homesUnconnected: next,
          homesLive: next,
          homesSdu: next,
          homesMdu: next,
          homesFlats: next,
        };
      }

      if (key === "cables") {
        return {
          ...prev,
          cables: next,
          feeders: next,
          links: next,
          dropCables: next,
          ulw96: next,
          ulw48: next,
          ulw36: next,
          ulw24: next,
          ulw12: next,
          orDucts: next,
          suggestedDucts: next,
        };
      }

      if (key === "agJoints") {
        return {
          ...prev,
          agJoints: next,
          cmjJoints: next,
          midjJoints: next,
          mmjJoints: next,
          lmjJoints: next,
        };
      }

      if (key === "distributionPoints") {
        return {
          ...prev,
          distributionPoints: next,
          ohDpJoints: next,
          ugDpJoints: next,
        };
      }

      if (key === "piaContractorView" || key === "piaQaView") {
        return {
          ...prev,
          [key]: next,
          poles: next ? true : prev.poles,
          chambers: next ? true : prev.chambers,
        };
      }

      return {
        ...prev,
        [key]: next,
      };
    });

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div style={panel}>
      <h3
        style={{
          margin: 0,
          fontSize: "0.95rem",
          color: "#60a5fa",
          fontWeight: 900,
          letterSpacing: 0.3,
        }}
      >
        {qaMode === "piaQa" ? "PIA QA View" : "QA Map View"}
      </h3>

      <div style={{ ...card, padding: "0.7rem" }}>
        <div style={label}>Basemap</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            marginTop: 7,
          }}
        >
          <button
            type="button"
            onClick={() => setBasemap("street")}
            style={basemap === "street" ? btnPrimary : btnSecondary}
          >
            Street
          </button>
          <button
            type="button"
            onClick={() => setBasemap("satellite")}
            style={basemap === "satellite" ? btnPrimary : btnSecondary}
          >
            Satellite
          </button>
          <button
            type="button"
            onClick={() => setBasemap("hybrid")}
            style={basemap === "hybrid" ? btnPrimary : btnSecondary}
          >
            Hybrid
          </button>
          <button
            type="button"
            onClick={() => setBasemap("dark")}
            style={basemap === "dark" ? btnPrimary : btnSecondary}
          >
            Dark
          </button>
        </div>

        <label style={{ ...layerRow, marginTop: 8 }}>
          <input
            type="checkbox"
            checked={roadOverlayVisible}
            onChange={() => setRoadOverlayVisible((v) => !v)}
            disabled={basemap === "hybrid"}
          />
          <span>Road Overlay {basemap === "hybrid" ? "(included)" : ""}</span>
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {displayedLayerGroups.map((group) => {
          const isOpen = !!openGroups[group.id];

          return (
            <div key={group.id} style={layerGroupCard}>
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                style={layerButton}
                aria-expanded={isOpen}
              >
                <span>{group.title}</span>
                <span aria-hidden="true" style={{ fontSize: "0.85rem", lineHeight: 1 }}>
                  {isOpen ? "▲" : "▼"}
                </span>
              </button>

              {isOpen && (
                <div style={dropdown}>
                  {group.options.map((option) => (
                    <LayerCheckbox
                      key={option.key}
                      labelText={option.label}
                      layerKey={option.key}
                      visibleLayers={visibleLayers}
                      onToggle={toggleLayer}
                      count={layerCounts[option.key]}
                    />
                  ))}

                  {group.id === "measurements" && (
                    <button
                      type="button"
                      onClick={onClearMeasurements}
                      style={btnDanger}
                      disabled={!onClearMeasurements || measurementPointCount === 0}
                    >
                      Clear Measurements
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ ...card, padding: "0.7rem" }}>
        <div style={label}>Map Tools</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr auto",
            gap: 6,
            marginTop: 7,
          }}
        >
          <button
            type="button"
            onClick={onStartDriveToLocation}
            style={isDrivingToLocation ? btnPrimary : btnSecondary}
            disabled={!onStartDriveToLocation}
          >
            Drive To Location
          </button>

          <button
            type="button"
            onClick={onStopDriveToLocation}
            style={btnSecondary}
            disabled={!onStopDriveToLocation || !isDrivingToLocation}
          >
            Stop
          </button>
        </div>

        {isDrivingToLocation ? (
          <div style={{ marginTop: 8, color: "#cbd5e1", fontSize: "0.82rem" }}>
            Click a point on the map to open Google Maps directions.
          </div>
        ) : null}
      </div>

      <div style={{ ...card, padding: "0.7rem" }}>
        <button
          type="button"
          onClick={() => setMeasurementToolsOpen((value) => !value)}
          style={layerButton}
          aria-expanded={measurementToolsOpen}
        >
          <span>Measure Distance</span>
          <span aria-hidden="true" style={{ fontSize: "0.85rem", lineHeight: 1 }}>
            {measurementToolsOpen ? "▲" : "▼"}
          </span>
        </button>

        {measurementToolsOpen && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginTop: 7,
              }}
            >
              <button
                type="button"
                onClick={onStartMeasurement}
                style={isMeasuring ? btnPrimary : btnSecondary}
                disabled={!onStartMeasurement}
              >
                {isMeasuring ? "Measuring" : "Start"}
              </button>

              <button
                type="button"
                onClick={onStopMeasurement}
                style={btnSecondary}
                disabled={!onStopMeasurement || !isMeasuring}
              >
                Stop
              </button>
            </div>

            <div style={{ marginTop: 8, color: "#cbd5e1", fontSize: "0.82rem" }}>
              Click points on the map to measure distance.
            </div>

            <div
              style={{
                marginTop: 8,
                fontWeight: 800,
                color: "#93c5fd",
                fontSize: "0.88rem",
              }}
            >
              Total: {formatDistance(measurementDistance)}
            </div>

            <div style={{ marginTop: 3, color: "#cbd5e1", fontSize: "0.8rem" }}>
              Points: {measurementPointCount}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginTop: 9,
              }}
            >
              <button
                type="button"
                onClick={onUndoMeasurementPoint}
                style={btnSecondary}
                disabled={!onUndoMeasurementPoint || measurementPointCount === 0}
              >
                Undo
              </button>

              <button
                type="button"
                onClick={onClearMeasurements}
                style={btnDanger}
                disabled={!onClearMeasurements || measurementPointCount === 0}
              >
                Clear
              </button>
            </div>
          </>
        )}
      </div>

      <div style={{ ...card, padding: "0.7rem" }}>
        <div style={label}>Snapping</div>
        <label style={{ ...layerRow, marginTop: 7 }}>
          <input
            type="checkbox"
            checked={snapEnabled}
            onChange={() => setSnapEnabled((v) => !v)}
          />
          <span>Enable Snap</span>
        </label>
      </div>
    </div>
  );
}
