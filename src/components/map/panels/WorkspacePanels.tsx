import { mobileButtonBase, responsiveSafeArea, mobilePanelChrome } from "../responsive/responsiveUiTokens";
import React from "react";
import ProjectWorkspace from "../../Project/ProjectWorkspace";
import type { SavedMapAsset } from "../types";

type WorkspacePanelsProps = {
  isLoading: boolean;
  isOpen: boolean;
  isMobile: boolean;
  activeProjectArea: SavedMapAsset;
  projectWorkspaceStats: any;
  visibleProjectAssets: SavedMapAsset[];
  visibleOpenreachAssets?: SavedMapAsset[];
  projectAreas: SavedMapAsset[];
  activeProjectId: string | null;
  onSelectProject: (projectId: string) => void;
  onBackToMap: () => void;
  onOpenTrace: () => void;
  onOpenQA: () => void;
  onOpenFibreTopology: () => void;
  onOpenJointEditor: (asset: SavedMapAsset) => void;
  onOpenDistributionPointEditor?: (asset: SavedMapAsset) => void;
  onOpenAudit?: (asset: SavedMapAsset) => void;
  onBulkUpdateDpStatus: (args: {
    assetIds: string[];
    assetRefs?: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateCablePiaNoi: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateJointInstallMethod: (args: {
    assetIds: string[];
    installMethod: "Underground" | "Overhead";
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateWorkStatus: (args: {
    assetIds: string[];
    status: "planned" | "assigned" | "in-progress" | "complete" | "blocked";
    assignedTeam?: string;
    note: string;
  }) => void | Promise<void>;
  onRecordDailyProgress: (args: {
    assetIds: string[];
    team: "civils" | "cabling" | "splicing";
    date: string;
    meters?: number;
    spliceCount?: number;
    crewName?: string;
    note: string;
  }) => void | Promise<void>;
  onUpdateDpStatus: (args: {
    assetId: string;
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onClearDpFibreAllocations: (args: { assetIds: string[]; note: string }) => void;
  onApplyAddressSheetAssignments: (request: any) => void | Promise<void>;
  onApplySbRouteAssignments: (request: any) => void | Promise<void>;
  onAutoSpreadStackedHomes: () => void | Promise<void>;
  onExport: () => void;
  onUpdateWorkspaceAsset?: (asset: SavedMapAsset) => void;
};

export default function WorkspacePanels({
  isLoading,
  isOpen,
  isMobile,
  activeProjectArea,
  projectWorkspaceStats,
  visibleProjectAssets,
  visibleOpenreachAssets = [],
  projectAreas,
  activeProjectId,
  onSelectProject,
  onBackToMap,
  onOpenTrace,
  onOpenQA,
  onOpenFibreTopology,
  onOpenJointEditor,
  onOpenDistributionPointEditor,
  onOpenAudit,
  onBulkUpdateDpStatus,
  onBulkUpdateCablePiaNoi,
  onBulkUpdateJointInstallMethod,
  onBulkUpdateWorkStatus,
  onRecordDailyProgress,
  onUpdateDpStatus,
  onClearDpFibreAllocations,
  onApplyAddressSheetAssignments,
  onApplySbRouteAssignments,
  onAutoSpreadStackedHomes,
  onExport,
  onUpdateWorkspaceAsset,
}: WorkspacePanelsProps) {
  const projectName = activeProjectArea.name || "Selected Project";

  if (isLoading) {
    return (
      <div style={projectWorkspaceLoadingOverlay}>
        <div style={projectWorkspaceLoadingCard}>
          <div style={{ fontSize: 13, color: "#93c5fd", fontWeight: 800 }}>
            Opening Project
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, marginTop: 8 }}>
            {projectName}
          </div>
          <div style={{ color: "#cbd5e1", marginTop: 8 }}>
            Loading area assets, topology, QA status and fibre continuity…
          </div>
          <div style={projectWorkspaceProgressTrack}>
            <div style={projectWorkspaceProgressBar} />
          </div>
        </div>
      </div>
    );
  }

  if (!isOpen) return null;

  const workspace = (
    <ProjectWorkspace
      projectName={projectName}
      status="Build Phase"
      stats={projectWorkspaceStats}
      projectArea={activeProjectArea}
      projectAssets={visibleProjectAssets}
      openreachAssets={visibleOpenreachAssets}
      projectAreas={projectAreas}
      activeProjectId={activeProjectId}
      onSelectProject={onSelectProject}
      onBackToMap={onBackToMap}
      onOpenTrace={onOpenTrace}
      onOpenQA={onOpenQA}
      onOpenFibreTopology={onOpenFibreTopology}
      onOpenJointEditor={onOpenJointEditor}
      onOpenDistributionPointEditor={onOpenDistributionPointEditor}
      onOpenAudit={onOpenAudit}
      onBulkUpdateDpStatus={onBulkUpdateDpStatus}
      onBulkUpdateCablePiaNoi={onBulkUpdateCablePiaNoi}
      onBulkUpdateJointInstallMethod={onBulkUpdateJointInstallMethod}
      onBulkUpdateWorkStatus={onBulkUpdateWorkStatus}
      onRecordDailyProgress={onRecordDailyProgress}
      onUpdateDpStatus={onUpdateDpStatus}
      onClearDpFibreAllocations={onClearDpFibreAllocations}
      onApplyAddressSheetAssignments={onApplyAddressSheetAssignments}
      onApplySbRouteAssignments={onApplySbRouteAssignments}
      onAutoSpreadStackedHomes={onAutoSpreadStackedHomes}
      onExport={onExport}
      onUpdateWorkspaceAsset={onUpdateWorkspaceAsset}
    />
  );

  if (isMobile) {
    return (
      <div style={mobileWorkspaceOverlayStyle}>
        <div style={mobileWorkspaceHeaderStyle}>
          <div>
            <strong>{projectName}</strong>
            <span>Field workspace</span>
          </div>
          <button type="button" onClick={onBackToMap} style={mobileWorkspaceCloseStyle}>
            Map
          </button>
        </div>
        <div style={mobileWorkspaceBodyStyle}>{workspace}</div>
      </div>
    );
  }

  return workspace;
}

const projectWorkspaceLoadingOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  background:
    "radial-gradient(circle at 60% 40%, rgba(37, 99, 235, 0.22), transparent 36%), #020617",
  color: "white",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  boxSizing: "border-box",
};

const projectWorkspaceLoadingCard: React.CSSProperties = {
  width: "min(620px, calc(100vw - 48px))",
  background: "rgba(15, 23, 42, 0.94)",
  border: "1px solid rgba(96, 165, 250, 0.35)",
  borderRadius: 20,
  padding: 28,
  boxShadow: "0 24px 80px rgba(0,0,0,0.55)",
};

const projectWorkspaceProgressTrack: React.CSSProperties = {
  height: 8,
  background: "rgba(148, 163, 184, 0.22)",
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 22,
};

const projectWorkspaceProgressBar: React.CSSProperties = {
  height: "100%",
  width: "72%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #2563eb, #22c55e)",
};

const mobileWorkspaceOverlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9800,
  background: "#020617",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
};

const mobileWorkspaceHeaderStyle: React.CSSProperties = {
  minHeight: 62,
  padding: `calc(10px + ${responsiveSafeArea.top}) 12px 10px`,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  ...mobilePanelChrome,
  borderTop: "none",
  borderLeft: "none",
  borderRight: "none",
};

const mobileWorkspaceCloseStyle: React.CSSProperties = {
  minWidth: 58,
  height: 42,
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#2563eb",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
  ...mobileButtonBase,
};

const mobileWorkspaceBodyStyle: React.CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  paddingBottom: responsiveSafeArea.bottom,
  WebkitOverflowScrolling: "touch",
};
