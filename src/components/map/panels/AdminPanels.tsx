import React from "react";
import AdminCleanupPanel from "../admin/AdminCleanupPanel";
import { isPolygonAreaAsset } from "../admin/usePolygonAdminTools";
import type { SavedMapAsset } from "../types";

type Style = React.CSSProperties;

type AdminPanelsProps = {
  isAdmin: boolean;
  card: Style;
  sectionSummary: Style;
  sectionBody: Style;
  btnSecondary: Style;
  btnDanger: Style;
  activeProjectArea: SavedMapAsset | null;
  currentEditingAsset: SavedMapAsset | null;
  polygonBulkSelectEnabled: boolean;
  selectedPolygonCount: number;
  onTogglePolygonBulkSelect: () => void;
  onSelectVisiblePolygons: () => void;
  onSelectImportedPolygons: () => void;
  onSelectAllPolygons: () => void;
  onClearPolygonSelection: () => void;
  onRemoveImportedAreas: (reason?: string) => void | Promise<void>;
  onRemoveSelectedPolygons: (reason?: string) => void | Promise<void>;
  onRemoveSelectedPolygon: (reason?: string) => void | Promise<void>;
  onRemoveAllPolygons: (reason?: string) => void | Promise<void>;
  onRemoveImportedDistributionPoints: (reason?: string) => void | Promise<void>;
  onRemoveImportedCables: (reason?: string) => void | Promise<void>;
  onSetAllPolygonsToL3: (reason?: string) => void | Promise<void>;
  onRepairAreaStamps: (reason?: string) => void | Promise<void>;
  onDeletePiaOverlayForActiveProject: (reason?: string) => void | Promise<void>;
  onDeleteAllOrReferenceAssets: (reason?: string) => void | Promise<void>;
};

export default function AdminPanels({
  isAdmin,
  card,
  sectionSummary,
  sectionBody,
  btnSecondary,
  btnDanger,
  activeProjectArea,
  currentEditingAsset,
  polygonBulkSelectEnabled,
  selectedPolygonCount,
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
  onSetAllPolygonsToL3,
  onRepairAreaStamps,
  onDeletePiaOverlayForActiveProject,
  onDeleteAllOrReferenceAssets,
}: AdminPanelsProps) {
  if (!isAdmin) return null;

  return (
    <AdminCleanupPanel
      card={card}
      sectionSummary={sectionSummary}
      sectionBody={sectionBody}
      btnSecondary={btnSecondary}
      btnDanger={btnDanger}
      activeProjectArea={activeProjectArea}
      currentEditingAsset={currentEditingAsset}
      polygonBulkSelectEnabled={polygonBulkSelectEnabled}
      selectedPolygonCount={selectedPolygonCount}
      isPolygonAreaAsset={isPolygonAreaAsset}
      onTogglePolygonBulkSelect={onTogglePolygonBulkSelect}
      onSelectVisiblePolygons={onSelectVisiblePolygons}
      onSelectImportedPolygons={onSelectImportedPolygons}
      onSelectAllPolygons={onSelectAllPolygons}
      onClearPolygonSelection={onClearPolygonSelection}
      onRemoveImportedAreas={onRemoveImportedAreas}
      onRemoveSelectedPolygons={onRemoveSelectedPolygons}
      onRemoveSelectedPolygon={onRemoveSelectedPolygon}
      onRemoveAllPolygons={onRemoveAllPolygons}
      onRemoveImportedDistributionPoints={onRemoveImportedDistributionPoints}
      onRemoveImportedCables={onRemoveImportedCables}
      onSetAllPolygonsToL3={onSetAllPolygonsToL3}
      onRepairAreaStamps={onRepairAreaStamps}
      onDeletePiaOverlayForActiveProject={onDeletePiaOverlayForActiveProject}
      onDeleteAllOrReferenceAssets={onDeleteAllOrReferenceAssets}
    />
  );
}
