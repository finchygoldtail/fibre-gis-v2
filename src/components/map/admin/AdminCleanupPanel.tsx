import React from "react";
import type { SavedMapAsset } from "../types";

type AdminCleanupPanelProps = {
  card: React.CSSProperties;
  sectionSummary: React.CSSProperties;
  sectionBody: React.CSSProperties;
  btnSecondary: React.CSSProperties;
  btnDanger: React.CSSProperties;
  activeProjectArea: SavedMapAsset | null;
  currentEditingAsset: SavedMapAsset | null;
  polygonBulkSelectEnabled: boolean;
  selectedPolygonCount: number;
  isPolygonAreaAsset: (asset: any) => boolean;
  onTogglePolygonBulkSelect: () => void;
  onSelectVisiblePolygons: () => void;
  onSelectImportedPolygons: () => void;
  onSelectAllPolygons: () => void;
  onClearPolygonSelection: () => void;
  onRemoveImportedAreas: () => void | Promise<void>;
  onRemoveSelectedPolygons: () => void | Promise<void>;
  onRemoveSelectedPolygon: () => void | Promise<void>;
  onRemoveAllPolygons: () => void | Promise<void>;
  onRemoveImportedDistributionPoints: () => void | Promise<void>;
  onRemoveImportedCables: () => void | Promise<void>;
  onRemoveAllJoints: () => void | Promise<void>;
  onSetAllPolygonsToL3: () => void | Promise<void>;
  onRepairAreaStamps: () => void | Promise<void>;
  onDeletePiaOverlayForActiveProject: () => void | Promise<void>;
  onDeleteAllOrReferenceAssets: () => void | Promise<void>;
};

export default function AdminCleanupPanel({
  card,
  sectionSummary,
  sectionBody,
  btnSecondary,
  btnDanger,
  activeProjectArea,
  currentEditingAsset,
  polygonBulkSelectEnabled,
  selectedPolygonCount,
  isPolygonAreaAsset,
  onTogglePolygonBulkSelect,
  onSelectVisiblePolygons,
  onSelectImportedPolygons,
  onSelectAllPolygons,
  onClearPolygonSelection,
  onRemoveImportedAreas,
  onRemoveSelectedPolygons,
  onRemoveSelectedPolygon,
  onRemoveAllPolygons,
  onRemoveImportedDistributionPoints,
  onRemoveImportedCables,
  onRemoveAllJoints,
  onSetAllPolygonsToL3,
  onRepairAreaStamps,
  onDeletePiaOverlayForActiveProject,
  onDeleteAllOrReferenceAssets,
}: AdminCleanupPanelProps) {
  const canRemoveCurrentPolygon =
    Boolean(currentEditingAsset) && isPolygonAreaAsset(currentEditingAsset);

  return (
    <details style={card}>
      <summary style={sectionSummary}>Administration</summary>
      <div style={sectionBody}>
        <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.45 }}>
          Admin-only cleanup tools. These are hidden from Super Users, Build,
          Survey and Maintenance users. Use typed confirmations before any
          destructive cleanup.
        </div>

        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: "1px solid #475569",
            borderRadius: 10,
            background: "#0f172a",
          }}
        >
          <div style={{ fontSize: 12, color: "#e5e7eb", fontWeight: 800 }}>
            Polygon bulk selection
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 11,
              color: "#94a3b8",
              lineHeight: 1.4,
            }}
          >
            {polygonBulkSelectEnabled
              ? `Bulk select is ON. Click polygons on the map to add/remove them. Selected: ${selectedPolygonCount}`
              : `Bulk select is OFF. Selected: ${selectedPolygonCount}`}
          </div>

          <button
            type="button"
            onClick={onTogglePolygonBulkSelect}
            style={{
              ...btnSecondary,
              width: "100%",
              marginTop: 8,
              background: polygonBulkSelectEnabled ? "#14532d" : "#1f2937",
            }}
          >
            {polygonBulkSelectEnabled
              ? "Polygon Bulk Select: ON"
              : "Polygon Bulk Select: OFF"}
          </button>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
              marginTop: 8,
            }}
          >
            <button type="button" onClick={onSelectVisiblePolygons} style={btnSecondary}>
              Select Visible
            </button>
            <button type="button" onClick={onSelectImportedPolygons} style={btnSecondary}>
              Select Imported
            </button>
            <button type="button" onClick={onSelectAllPolygons} style={btnSecondary}>
              Select All
            </button>
            <button type="button" onClick={onClearPolygonSelection} style={btnSecondary}>
              Clear Selection
            </button>
          </div>
        </div>

        <button type="button" onClick={onRemoveImportedAreas} style={btnDanger}>
          Remove Imported Area Polygons
        </button>

        <button
          type="button"
          onClick={onRemoveSelectedPolygons}
          style={btnDanger}
          disabled={selectedPolygonCount === 0}
          title={
            selectedPolygonCount > 0
              ? "Remove the selected polygon set"
              : "Use Polygon Bulk Select or Select Visible/Imported/All first"
          }
        >
          Remove Selected Polygons ({selectedPolygonCount})
        </button>

        <button
          type="button"
          onClick={onRemoveSelectedPolygon}
          style={btnDanger}
          disabled={!canRemoveCurrentPolygon}
          title={
            canRemoveCurrentPolygon
              ? "Remove the currently selected polygon only"
              : "Select a polygon first"
          }
        >
          Remove Current Polygon
        </button>

        <button type="button" onClick={onRemoveAllPolygons} style={btnDanger}>
          Remove ALL Polygons
        </button>

        <button
          type="button"
          onClick={onRemoveImportedDistributionPoints}
          style={btnDanger}
          title="Remove QGIS/GeoJSON imported Distribution Points / SBs before re-importing them"
        >
          Remove Imported DPs / SBs
        </button>

        <button
          type="button"
          onClick={onRemoveImportedCables}
          style={btnDanger}
          title="Remove QGIS/GeoJSON imported cable LineStrings before re-importing them"
        >
          Remove Imported Cables
        </button>

        <button
          type="button"
          onClick={onRemoveAllJoints}
          style={btnDanger}
          title="Remove all AG joint assets such as LMJ, CMJ, MMJ and MidJ"
        >
          Remove ALL Joints
        </button>

        <button
          type="button"
          onClick={onSetAllPolygonsToL3}
          style={{
            ...btnSecondary,
            width: "100%",
            marginTop: 8,
            background: "#14532d",
            borderColor: "#22c55e",
          }}
          title="Change every loaded polygon area level to L3 and save it to Firebase."
        >
          Set All Polygons to L3
        </button>

        <button
          type="button"
          onClick={onRepairAreaStamps}
          style={{
            ...btnSecondary,
            width: "100%",
            marginTop: 8,
            background: activeProjectArea ? "#14532d" : "#1f2937",
            borderColor: activeProjectArea ? "#22c55e" : "#475569",
          }}
          disabled={!activeProjectArea}
          title={
            activeProjectArea
              ? "Restamp operational assets inside the selected polygon back to this area"
              : "Select an area polygon first"
          }
        >
          Repair Area Stamps for Selected Area
        </button>

        <button
          type="button"
          onClick={onDeletePiaOverlayForActiveProject}
          style={btnDanger}
          disabled={!activeProjectArea}
          title={
            activeProjectArea
              ? "Delete OR / PIA overlay only inside the selected area"
              : "Select an area first"
          }
        >
          Delete OR / PIA in Selected Area
        </button>

        <button type="button" onClick={onDeleteAllOrReferenceAssets} style={btnDanger}>
          Delete ALL OR / PIA Reference Layers
        </button>

        <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
          Imported area cleanup removes polygons from the map state first; press
          Save Map afterwards to persist that cleanup. OR / PIA cleanup writes
          directly to OR reference storage.
        </div>
      </div>
    </details>
  );
}
