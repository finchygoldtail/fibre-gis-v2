import React from "react";
import DuplicateHomeResolutionPanel from "./DuplicateHomeResolutionPanel";
import AddressSheetImportPanel from "./AddressSheetImportPanel";
import FasSbRouteImportPanel from "./FasSbRouteImportPanel";
import RouteProgressViewer from "./RouteProgressViewer";
import type { DailyProgressTeam, SavedMapAsset } from "../../map/types";
import type { WorkStatus } from "../../map/types";
import {
  dailyProgressRangeOverlaps,
  getAssetTypeLabel,
  getAssetWorkStatus,
  getDailyProgressHistory,
  getTodayIsoDate,
} from "./workspaceOperations";

type ManagerPoint = { lat: number; lng: number };
type JointInstallFilter = "ALL" | "AG_JOINTS" | "DPS" | "LMJ" | "CMJ" | "MMJ" | "MIDJ";

type Props = {
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: SavedMapAsset[];
  projectArea?: SavedMapAsset | null;
  isBackhaulWorkspace?: boolean;
  auditIssues?: any[];
  disconnectedAssets?: any[];
  networkGraph?: any;
  managerAreaPoints?: ManagerPoint[];
  isManagerAreaDrawing?: boolean;
  areaDistributionPoints?: SavedMapAsset[];
  onStartManagerAreaDrawing?: () => void;
  onStopManagerAreaDrawing?: () => void;
  onClearManagerAreaDrawing?: () => void;
  onClearDpFibreAllocations?: () => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    assetRefs?: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateCablePiaNoi?: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateJointInstallMethod?: (args: {
    assetIds: string[];
    installMethod: "Underground" | "Overhead";
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateWorkStatus?: (args: {
    assetIds: string[];
    status: WorkStatus;
    assignedTeam?: string;
    note: string;
  }) => void | Promise<void>;
  onRecordDailyProgress?: (args: {
    assetIds: string[];
    team: DailyProgressTeam;
    date: string;
    meters?: number;
    startMeter?: number;
    endMeter?: number;
    spliceCount?: number;
    crewName?: string;
    progressNote?: string;
    issueNote?: string;
    permitNumber?: string;
    permitStartDate?: string;
    permitEndDate?: string;
    note: string;
  }) => void | Promise<void>;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenJointEditor?: (asset: SavedMapAsset) => void;
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
  onResolveDuplicateHomes?: (request: any) => void;
  onAutoSpreadStackedHomes?: () => void | Promise<void>;
  onApplyAddressSheetAssignments?: (request: any) => void | Promise<void>;
  onApplySbRouteAssignments?: (request: any) => void | Promise<void>;
};

const panel: React.CSSProperties = { background: "transparent", border: "1px solid #ddd8cf", borderRadius: 10, padding: 16, minHeight: 190 };
const wide: React.CSSProperties = { ...panel, gridColumn: "span 2" };
const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#1f2933" };
const tile: React.CSSProperties = { background: "#ffffff", border: "1px solid #ddd8cf", borderRadius: 10, padding: 12 };
const button: React.CSSProperties = { border: "1px solid #ddd8cf", background: "#ffffff", color: "#1f2933", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" };
const readinessBox: React.CSSProperties = { background: "#ffffff", border: "1px solid #d8d2c8", borderRadius: 10, padding: 12, color: "#64748b" };

const getInstallAssetText = (asset: any) =>
  [
    asset?.assetType,
    asset?.type,
    asset?.jointType,
    asset?.name,
    asset?.label,
    asset?.id,
    asset?.dpType,
    asset?.distributionPointType,
    asset?.splitterBox,
    asset?.splitterBoxName,
    asset?.dpDetails?.closureType,
    asset?.dpDetails?.name,
    asset?.properties?.dpType,
    asset?.properties?.distributionPointType,
    asset?.properties?.splitterBox,
    asset?.properties?.splitterBoxName,
    asset?.properties?.dpDetails?.closureType,
  ]
    .map((value) => String(value ?? "").toUpperCase())
    .join(" ");

const isAgJointInstallAsset = (asset: any) => {
  const text = getInstallAssetText(asset);
  return asset?.assetType === "ag-joint" || /(?:LMJ|CMJ|MMJ|MIDJ|JOINT)/.test(text);
};

const isDpInstallAsset = (asset: any) => {
  const text = getInstallAssetText(asset);
  return (
    asset?.assetType === "distribution-point" ||
    text.includes("DISTRIBUTION POINT") ||
    text.includes("DP") ||
    text.includes("AFN") ||
    text.includes("CBT") ||
    text.includes("MDU") ||
    /(^|[-_\s])SB\s*\d+/i.test(text)
  );
};

const matchesJointInstallFilter = (asset: any, filter: JointInstallFilter) => {
  const text = getInstallAssetText(asset);
  if (filter === "ALL") return true;
  if (filter === "AG_JOINTS") return isAgJointInstallAsset(asset);
  if (filter === "DPS") return isDpInstallAsset(asset);
  return text.includes(filter);
};

const getInstallMethodLabel = (asset: any) =>
  asset?.installMethod ||
  asset?.dpDetails?.installMethod ||
  asset?.properties?.installMethod ||
  asset?.properties?.dpDetails?.installMethod ||
  "Not set";

const getNormalisedInstallMethod = (asset: any): "Underground" | "Overhead" | "" => {
  const values = [
    asset?.installMethod,
    asset?.dpDetails?.installMethod,
    asset?.properties?.installMethod,
    asset?.properties?.dpDetails?.installMethod,
  ];

  for (const value of values) {
    const normalised = String(value ?? "").trim().toLowerCase();
    if (!normalised) continue;
    if (normalised === "oh" || normalised.includes("overhead")) return "Overhead";
    if (normalised === "ug" || normalised.includes("underground")) return "Underground";
  }

  return "";
};

const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d8d2c8",
  background: "#ffffff",
  color: "#1f2933",
  borderRadius: 9,
  padding: "10px 11px",
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#64748b",
  fontSize: 12,
  fontWeight: 800,
};

const cablePreviewBox: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #ddd8cf",
  borderRadius: 10,
  padding: 12,
  maxHeight: 220,
  overflow: "auto",
};

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={tile}><div style={{ color: "#64748b", fontSize: 12 }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{value}</div></div>;
}

type BuildToolKey =
  | "fas"
  | "address"
  | "homes"
  | "joints"
  | "pia"
  | "routes"
  | "daily"
  | "status"
  | "reset"
  | "actions";

const toolGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

function ToolButton({
  label,
  description,
  active,
  tone = "default",
  hidden = false,
  onClick,
}: {
  label: string;
  description: string;
  active: boolean;
  tone?: "default" | "warn" | "danger" | "good";
  hidden?: boolean;
  onClick: () => void;
}) {
  if (hidden) return null;

  const activeBorder =
    tone === "danger"
      ? "rgba(248,113,113,0.7)"
      : tone === "warn"
        ? "rgba(251,191,36,0.7)"
        : tone === "good"
          ? "rgba(52,211,153,0.7)"
          : "rgba(96,165,250,0.75)";

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...tile,
        textAlign: "left",
        cursor: "pointer",
        minHeight: 86,
        border: active
          ? `1px solid ${activeBorder}`
          : "1px solid #ddd8cf",
        background: active ? "#eff6ff" : "#ffffff",
        boxShadow: active ? "0 0 0 1px rgba(96,165,250,0.16) inset" : "none",
      }}
    >
      <div style={{ color: "#1f2933", fontWeight: 900, fontSize: 15 }}>
        {label}
      </div>
      <div style={{ color: "#64748b", fontSize: 12, marginTop: 7, lineHeight: 1.35 }}>
        {description}
      </div>
    </button>
  );
}

export default function WorkspaceBuild({
  stats,
  projectAssets,
  areaDistributionPoints = [],
  onBulkUpdateCablePiaNoi,
  onBulkUpdateJointInstallMethod,
  onBulkUpdateWorkStatus,
  onRecordDailyProgress,
  onClearDpFibreAllocations,
  onSelectAsset,
  onOpenJointEditor,
  onBackToMap,
  onResolveDuplicateHomes,
  onAutoSpreadStackedHomes,
  onApplyAddressSheetAssignments,
  onApplySbRouteAssignments,
  isBackhaulWorkspace = false,
}: Props) {
  const [activeTool, setActiveTool] = React.useState<BuildToolKey | null>(null);
  const [piaNoiNumber, setPiaNoiNumber] = React.useState("");
  const [piaCableFilter, setPiaCableFilter] = React.useState("");
  const [piaAuditNote, setPiaAuditNote] = React.useState("Bulk apply PIA NOI to project design cables");
  const [jointInstallMethod, setJointInstallMethod] = React.useState<"Underground" | "Overhead">("Underground");
  const [jointSubtypeFilter, setJointSubtypeFilter] = React.useState<JointInstallFilter>("ALL");
  const [jointInstallAuditNote, setJointInstallAuditNote] = React.useState("Bulk set existing joints / DPs to Underground");
  const [workStatus, setWorkStatus] = React.useState<WorkStatus>("in-progress");
  const [workStatusAssetFilter, setWorkStatusAssetFilter] = React.useState("all");
  const [workStatusTeam, setWorkStatusTeam] = React.useState("");
  const [workStatusNote, setWorkStatusNote] = React.useState("Bulk update production status from workspace");
  const [dailyTeam, setDailyTeam] = React.useState<DailyProgressTeam>("civils");
  const [dailyDate, setDailyDate] = React.useState(getTodayIsoDate());
  const [dailyMeters, setDailyMeters] = React.useState(0);
  const [dailyStartMeter, setDailyStartMeter] = React.useState(0);
  const [dailyEndMeter, setDailyEndMeter] = React.useState(0);
  const [dailySpliceCount, setDailySpliceCount] = React.useState(0);
  const [dailyCrewName, setDailyCrewName] = React.useState("");
  const [dailyNote, setDailyNote] = React.useState("Daily production update");
  const [dailyProgressNote, setDailyProgressNote] = React.useState("");
  const [dailyIssueNote, setDailyIssueNote] = React.useState("");
  const [dailyPermitNumber, setDailyPermitNumber] = React.useState("");
  const [dailyPermitStartDate, setDailyPermitStartDate] = React.useState("");
  const [dailyPermitEndDate, setDailyPermitEndDate] = React.useState("");
  const [selectedDailyAssetIds, setSelectedDailyAssetIds] = React.useState<Set<string>>(new Set());
  const [selectedWorkAssetIds, setSelectedWorkAssetIds] = React.useState<Set<string>>(new Set());
  const [selectedInstallAssetIds, setSelectedInstallAssetIds] = React.useState<Set<string>>(new Set());
  const readiness = stats?.operationalReadiness;
  const blockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
  const nextActions = Array.isArray(readiness?.nextActions) ? readiness.nextActions : [];
  const hiddenBackhaulTools = React.useMemo(
    () => new Set<BuildToolKey>(["fas", "address", "homes", "joints", "reset"]),
    [],
  );

  React.useEffect(() => {
    if (activeTool && isBackhaulWorkspace && hiddenBackhaulTools.has(activeTool)) {
      setActiveTool(null);
    }
  }, [activeTool, hiddenBackhaulTools, isBackhaulWorkspace]);

  React.useEffect(() => {
    if (
      isBackhaulWorkspace &&
      (workStatusAssetFilter === "dp" || workStatusAssetFilter === "street cab")
    ) {
      setWorkStatusAssetFilter("all");
    }
  }, [isBackhaulWorkspace, workStatusAssetFilter]);

  const designCables = React.useMemo(
    () =>
      (projectAssets || []).filter((asset: any) => {
        const raw = String(asset?.assetType || asset?.type || asset?.cableType || asset?.name || "").toLowerCase();
        const isCable = asset?.geometry?.type === "LineString" || raw.includes("cable") || raw.includes("ulw") || raw.includes("fulw") || raw.includes("feeder") || raw.includes("link");
        const isDrop = String(asset?.cableType || asset?.name || asset?.generatedBy || "").toLowerCase().includes("drop") || asset?.isDropCable === true || asset?.isHomeDrop === true || asset?.generatedDrop === true || asset?.autoGeneratedDrop === true;
        return isCable && !isDrop;
      }),
    [projectAssets],
  );

  const filteredPiaCables = React.useMemo(() => {
    const filter = piaCableFilter.trim().toLowerCase();
    if (!filter) return designCables;

    return designCables.filter((asset: any) => {
      const haystack = [
        asset.name,
        asset.cableId,
        asset.cableName,
        asset.label,
        asset.id,
        asset.piaNoiNumber,
        asset.properties?.piaNoiNumber,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");

      return haystack.includes(filter);
    });
  }, [designCables, piaCableFilter]);

  const installMethodAssets = React.useMemo(
    () =>
      (projectAssets || [])
        .filter((asset: any) => {
          return asset?.geometry?.type === "Point" && (isAgJointInstallAsset(asset) || isDpInstallAsset(asset));
        })
        .filter((asset: any) => matchesJointInstallFilter(asset, jointSubtypeFilter))
        .filter((asset: any) => getNormalisedInstallMethod(asset) !== jointInstallMethod)
        .sort((a: any, b: any) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true })),
    [projectAssets, jointSubtypeFilter, jointInstallMethod],
  );
  const workStatusAssets = React.useMemo(() => {
    const filter = workStatusAssetFilter;
    return (projectAssets || [])
      .filter((asset: any) => {
        if (asset?.assetType === "home" || asset?.assetType === "area") return false;
        const type = getAssetTypeLabel(asset).toLowerCase();
        if (isBackhaulWorkspace && (type === "dp" || type === "street cab")) return false;
        if (filter === "all") return type !== "asset";
        return type === filter;
      })
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true }));
  }, [isBackhaulWorkspace, projectAssets, workStatusAssetFilter]);
  const workStatusAssetIds = React.useMemo(
    () => workStatusAssets.map((asset: any) => String(asset.id || "")),
    [workStatusAssets],
  );
  const selectedWorkStatusAssets = React.useMemo(
    () => workStatusAssets.filter((asset: any) => selectedWorkAssetIds.has(String(asset.id || ""))),
    [selectedWorkAssetIds, workStatusAssets],
  );
  const dailyProgressAssets = React.useMemo(() => {
    const routeTeam = dailyTeam === "civils" || dailyTeam === "cabling";
    return (projectAssets || [])
      .filter((asset: any) => {
        const type = getAssetTypeLabel(asset).toLowerCase();
        if (routeTeam) return asset?.geometry?.type === "LineString" && (type === "duct" || type === "cable");
        if (isBackhaulWorkspace) return ["joint", "chamber", "data centre"].includes(type);
        return ["joint", "dp", "chamber"].includes(type);
      })
      .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id), undefined, { numeric: true }));
  }, [dailyTeam, isBackhaulWorkspace, projectAssets]);
  const dailyProgressAssetIds = React.useMemo(
    () => dailyProgressAssets.map((asset: any) => String(asset.id || "")),
    [dailyProgressAssets],
  );
  const selectedDailyProgressAssets = React.useMemo(
    () => dailyProgressAssets.filter((asset: any) => selectedDailyAssetIds.has(String(asset.id || ""))),
    [dailyProgressAssets, selectedDailyAssetIds],
  );
  const dailyRoutePreview = React.useMemo(() => {
    const routeTeam = dailyTeam === "civils" || dailyTeam === "cabling";
    const startMeter = Math.max(0, Number(dailyStartMeter || 0));
    const endMeter = Math.max(0, Number(dailyEndMeter || 0));

    return selectedDailyProgressAssets.map((asset: SavedMapAsset) => {
      const entries = getDailyProgressHistory(asset).filter((entry) => {
        if (entry.team !== dailyTeam) return false;
        if (!routeTeam) return true;
        return typeof entry.startMeter === "number" && typeof entry.endMeter === "number";
      });
      const overlaps =
        routeTeam && endMeter > startMeter
          ? entries.filter((entry) =>
              dailyProgressRangeOverlaps(entry, dailyTeam, null, startMeter, endMeter),
            )
          : [];

      return { asset, entries, overlaps };
    });
  }, [dailyEndMeter, dailyStartMeter, dailyTeam, selectedDailyProgressAssets]);
  const dailyProgressRangeHasOverlap = dailyRoutePreview.some((item) => item.overlaps.length > 0);
  const installMethodAssetIds = React.useMemo(
    () => installMethodAssets.map((asset: any) => String(asset.id || "")),
    [installMethodAssets],
  );
  const selectedInstallMethodAssets = React.useMemo(
    () => installMethodAssets.filter((asset: any) => selectedInstallAssetIds.has(String(asset.id || ""))),
    [installMethodAssets, selectedInstallAssetIds],
  );

  React.useEffect(() => {
    setSelectedInstallAssetIds((previous) => {
      const validIds = new Set(installMethodAssetIds);
      const kept = Array.from(previous).filter((id) => validIds.has(id));
      return new Set(kept.length ? kept : installMethodAssetIds);
    });
  }, [installMethodAssetIds.join("|")]);

  React.useEffect(() => {
    setSelectedWorkAssetIds((previous) => {
      const validIds = new Set(workStatusAssetIds);
      const kept = Array.from(previous).filter((id) => validIds.has(id));
      return new Set(kept.length ? kept : workStatusAssetIds);
    });
  }, [workStatusAssetIds.join("|")]);

  React.useEffect(() => {
    setSelectedDailyAssetIds((previous) => {
      const validIds = new Set(dailyProgressAssetIds);
      const kept = Array.from(previous).filter((id) => validIds.has(id));
      return new Set(kept);
    });
  }, [dailyProgressAssetIds.join("|")]);

  const toggleInstallAssetSelection = (assetId: string) => {
    setSelectedInstallAssetIds((previous) => {
      const next = new Set(previous);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const selectAllInstallAssets = () => {
    setSelectedInstallAssetIds(new Set(installMethodAssetIds));
  };

  const clearInstallAssetSelection = () => {
    setSelectedInstallAssetIds(new Set());
  };

  const toggleWorkAssetSelection = (assetId: string) => {
    setSelectedWorkAssetIds((previous) => {
      const next = new Set(previous);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const applyBulkWorkStatus = async () => {
    if (!onBulkUpdateWorkStatus) return;
    const note = workStatusNote.trim();
    if (!note) {
      alert("An audit note is required before applying a production status update.");
      return;
    }
    if (!selectedWorkStatusAssets.length) {
      alert("Select at least one asset before applying a production status.");
      return;
    }
    const confirmed = window.confirm(
      `Set ${selectedWorkStatusAssets.length} selected asset${selectedWorkStatusAssets.length === 1 ? "" : "s"} to ${workStatus}?`,
    );
    if (!confirmed) return;

    await onBulkUpdateWorkStatus({
      assetIds: selectedWorkStatusAssets.map((asset) => asset.id),
      status: workStatus,
      assignedTeam: workStatusTeam.trim() || undefined,
      note,
    });
  };

  const toggleDailyAssetSelection = (assetId: string) => {
    setSelectedDailyAssetIds((previous) => {
      const next = new Set(previous);
      if (next.has(assetId)) next.delete(assetId);
      else next.add(assetId);
      return next;
    });
  };

  const applyDailyProgress = async () => {
    if (!onRecordDailyProgress) return;
    const note = dailyNote.trim();
    if (!note) {
      alert("A note is required before saving daily production.");
      return;
    }
    if (!selectedDailyProgressAssets.length) {
      alert("Select at least one route or splice asset.");
      return;
    }
    const routeTeam = dailyTeam === "civils" || dailyTeam === "cabling";
    const startMeter = Math.max(0, Number(dailyStartMeter || 0));
    const endMeter = Math.max(0, Number(dailyEndMeter || 0));
    const meters = routeTeam ? Math.max(0, endMeter - startMeter) : Math.max(0, Number(dailyMeters || 0));
    const spliceCount = Math.max(0, Math.round(Number(dailySpliceCount || 0)));
    if (routeTeam && endMeter <= startMeter) {
      alert("Enter a To metre that is greater than the From metre.");
      return;
    }
    if (routeTeam && dailyProgressRangeHasOverlap) {
      alert("That metre range overlaps existing daily production on one or more selected assets.");
      return;
    }
    if (!routeTeam && !spliceCount) {
      alert("Enter splice count done today.");
      return;
    }

    await onRecordDailyProgress({
      assetIds: selectedDailyProgressAssets.map((asset) => asset.id),
      team: dailyTeam,
      date: dailyDate || getTodayIsoDate(),
      meters: routeTeam ? meters : undefined,
      startMeter: routeTeam ? startMeter : undefined,
      endMeter: routeTeam ? endMeter : undefined,
      spliceCount: routeTeam ? undefined : spliceCount,
      crewName: dailyCrewName.trim() || undefined,
      progressNote: dailyProgressNote.trim() || undefined,
      issueNote: dailyIssueNote.trim() || undefined,
      permitNumber: dailyPermitNumber.trim() || undefined,
      permitStartDate: dailyPermitStartDate || undefined,
      permitEndDate: dailyPermitEndDate || undefined,
      note,
    });
  };

  const canApplyBulkJointInstallMethod =
    selectedInstallMethodAssets.length > 0 &&
    Boolean(onBulkUpdateJointInstallMethod) &&
    Boolean(jointInstallAuditNote.trim());
  const bulkJointInstallDisabledReason = !onBulkUpdateJointInstallMethod
    ? "Bulk install updates are not available from this workspace view."
    : !selectedInstallMethodAssets.length
      ? "Select at least one joint or DP before applying."
      : !jointInstallAuditNote.trim()
        ? "Enter an audit note before applying."
        : "";

  const applyBuildBulkPiaNoi = async () => {
    if (!onBulkUpdateCablePiaNoi) {
      return;
    }

    if (!designCables.length) {
      alert("No design cables found in this project.");
      return;
    }

    if (!filteredPiaCables.length) {
      alert("No cables match the current filter.");
      return;
    }

    const trimmedPiaNoi = piaNoiNumber.trim();
    if (!trimmedPiaNoi) {
      alert("Enter a PIA NOI number before applying.");
      return;
    }

    const trimmedNote = piaAuditNote.trim();
    if (!trimmedNote) {
      alert("An audit note is required before applying a bulk PIA NOI update.");
      return;
    }

    const confirmed = window.confirm(
      `Apply PIA NOI ${trimmedPiaNoi} to ${filteredPiaCables.length} cable${filteredPiaCables.length === 1 ? "" : "s"}?`,
    );
    if (!confirmed) return;

    await onBulkUpdateCablePiaNoi({
      assetIds: filteredPiaCables.map((asset) => asset.id),
      piaNoiNumber: trimmedPiaNoi,
      note: trimmedNote,
    });
  };

  const applyBulkJointInstallMethod = async () => {
    if (!onBulkUpdateJointInstallMethod) return;
    const trimmedNote = jointInstallAuditNote.trim();
    if (!trimmedNote) {
      alert("An audit note is required before applying a bulk joint install update.");
      return;
    }
    if (!installMethodAssets.length) {
      alert(`No joints or DPs need changing to ${jointInstallMethod} with the current filter.`);
      return;
    }
    if (!selectedInstallMethodAssets.length) {
      alert("Select at least one joint or DP before applying the install method.");
      return;
    }

    const confirmed = window.confirm(
      `Set ${selectedInstallMethodAssets.length} selected joint / DP asset${selectedInstallMethodAssets.length === 1 ? "" : "s"} to ${jointInstallMethod}?\n\nFilter: ${jointSubtypeFilter}\n\nAudit note: ${trimmedNote}`,
    );
    if (!confirmed) return;

    await onBulkUpdateJointInstallMethod({
      assetIds: selectedInstallMethodAssets.map((asset) => asset.id),
      installMethod: jointInstallMethod,
      note: trimmedNote,
    });
  };

  return <>
    <section style={wide}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <h3 style={title}>Build Operations</h3>
          <p style={{ color: "#64748b", margin: 0, fontSize: 13 }}>
            Pick one build tool below. DP status and live home checks now live in the side Focus panel.
          </p>
        </div>
        {activeTool ? (
          <button type="button" style={button} onClick={() => setActiveTool(null)}>
            Close Tool
          </button>
        ) : null}
      </div>

      <div style={toolGrid}>
        <ToolButton
          label="FAS Route Import"
          description="Import SB → SB fibre routes from the FAS."
          active={activeTool === "fas"}
          hidden={isBackhaulWorkspace}
          onClick={() => setActiveTool((value) => value === "fas" ? null : "fas")}
        />
        <ToolButton
          label="Address Sheet Matcher"
          description="Match UPRNs to map homes and group by SB."
          active={activeTool === "address"}
          hidden={isBackhaulWorkspace}
          onClick={() => setActiveTool((value) => value === "address" ? null : "address")}
        />
        <ToolButton
          label="Home Tools"
          description="Duplicates, stacked homes and home clean-up."
          active={activeTool === "homes"}
          hidden={isBackhaulWorkspace}
          tone="good"
          onClick={() => setActiveTool((value) => value === "homes" ? null : "homes")}
        />
        <ToolButton
          label="Bulk Joint / DP Install"
          description="Mark existing joints and DPs as UG or OH in one pass."
          active={activeTool === "joints"}
          hidden={isBackhaulWorkspace}
          tone="good"
          onClick={() => setActiveTool((value) => value === "joints" ? null : "joints")}
        />
        <ToolButton
          label="Bulk PIA NOI"
          description="Apply one PIA NOI number to project design cables."
          active={activeTool === "pia"}
          tone="good"
          onClick={() => setActiveTool((value) => value === "pia" ? null : "pia")}
        />
        <ToolButton
          label="Route Progress"
          description="View completed duct and cable metre ranges with green section progress."
          active={activeTool === "routes"}
          tone="good"
          onClick={() => setActiveTool((value) => value === "routes" ? null : "routes")}
        />
        <ToolButton
          label="Daily Production"
          description="Record metres or splices done today and highlight them on the map."
          active={activeTool === "daily"}
          tone="good"
          onClick={() => setActiveTool((value) => value === "daily" ? null : "daily")}
        />
        <ToolButton
          label="Production Status"
          description="Assign, start, complete or block build assets."
          active={activeTool === "status"}
          tone="good"
          onClick={() => setActiveTool((value) => value === "status" ? null : "status")}
        />
        <ToolButton
          label="Fibre Reset"
          description="Clear DP fibre allocations in this area."
          active={activeTool === "reset"}
          hidden={isBackhaulWorkspace}
          tone="danger"
          onClick={() => setActiveTool((value) => value === "reset" ? null : "reset")}
        />
        <ToolButton
          label="Build Actions"
          description="Blockers, next actions and back to map."
          active={activeTool === "actions"}
          tone="warn"
          onClick={() => setActiveTool((value) => value === "actions" ? null : "actions")}
        />
      </div>
    </section>

    {activeTool === "routes" ? (
      <RouteProgressViewer
        projectAssets={projectAssets}
        onSelectAsset={onSelectAsset}
      />
    ) : null}

    {activeTool === "fas" ? (
      <FasSbRouteImportPanel
        projectAssets={projectAssets}
        onApplySbRouteAssignments={onApplySbRouteAssignments}
      />
    ) : null}

    {activeTool === "address" ? (
      <AddressSheetImportPanel
        projectAssets={projectAssets}
        onSelectAsset={onSelectAsset}
        onOpenAsset={(asset) => {
          onSelectAsset?.(asset);
          onOpenJointEditor?.(asset);
        }}
        onApplyAssignments={onApplyAddressSheetAssignments}
      />
    ) : null}

    {activeTool === "homes" ? (
      <>
        <DuplicateHomeResolutionPanel
          projectAssets={projectAssets}
          onSelectAsset={onSelectAsset}
          onOpenAsset={(asset) => {
            onSelectAsset?.(asset);
            onOpenJointEditor?.(asset);
          }}
          onResolveDuplicateHomes={onResolveDuplicateHomes}
        />

        <section style={wide}>
          <h3 style={title}>Stacked Home Tools</h3>
          <p style={{ color: "#64748b", marginTop: 0 }}>
            Automatically spreads homes stacked within 1.75m. No homes are deleted,
            UPRNs are preserved and the current project homes are saved back to the area.
          </p>
          <button
            type="button"
            style={{
              ...button,
              background: "#15803d",
              borderColor: "rgba(52,211,153,0.35)",
            }}
            onClick={onAutoSpreadStackedHomes}
            disabled={!onAutoSpreadStackedHomes}
          >
            Auto Spread All Stacked Homes
          </button>
          <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
            Keeps the first home in each stack in place and moves the others into a small
            2.5m circle so they can be selected and connected individually.
          </div>
        </section>
      </>
    ) : null}

    {activeTool === "pia" ? (
      <section style={wide}>
        <h3 style={title}>Bulk Cable PIA NOI</h3>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Apply the same PIA NOI number to multiple project design cables. Drop cables are ignored.
          Use the filter to target a cable group such as 96FULW, 48FULW, FULW01 or AG1.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Design cables" value={n(designCables.length)} />
          <Tile label="Matched cables" value={n(filteredPiaCables.length)} />
          <Tile label="Action" value="PIA NOI" />
        </div>

        <div style={formGrid}>
          <label style={labelStyle}>
            PIA NOI Number
            <input
              value={piaNoiNumber}
              onChange={(event) => setPiaNoiNumber(event.target.value)}
              placeholder="Example: NOI-123456"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Optional Cable Filter
            <input
              value={piaCableFilter}
              onChange={(event) => setPiaCableFilter(event.target.value)}
              placeholder="Example: 96FULW, 48FULW, FULW01 or AG1"
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Audit Note
            <input
              value={piaAuditNote}
              onChange={(event) => setPiaAuditNote(event.target.value)}
              placeholder="Reason for this bulk update"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={cablePreviewBox}>
          <div style={{ color: "#1f2933", fontWeight: 900, marginBottom: 8 }}>
            Preview Matched Cables
          </div>
          {filteredPiaCables.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {filteredPiaCables.slice(0, 40).map((asset: any) => (
                <div
                  key={asset.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    borderBottom: "1px solid #e2ded7",
                    paddingBottom: 6,
                    color: "#64748b",
                    fontSize: 12,
                  }}
                >
                  <span>{asset.name || asset.cableId || asset.label || asset.id}</span>
                  <span style={{ color: "#64748b" }}>
                    Current: {asset.piaNoiNumber || asset.properties?.piaNoiNumber || "None"}
                  </span>
                </div>
              ))}
              {filteredPiaCables.length > 40 ? (
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  Showing first 40 of {n(filteredPiaCables.length)} matched cables.
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ color: "#fb7185", fontSize: 12 }}>
              No cables match the current filter.
            </div>
          )}
        </div>

        <button
          type="button"
          style={{
            ...button,
            background: "#15803d",
            borderColor: "rgba(74,222,128,0.42)",
            marginTop: 12,
            cursor:
              filteredPiaCables.length &&
              onBulkUpdateCablePiaNoi &&
              piaNoiNumber.trim() &&
              piaAuditNote.trim()
                ? "pointer"
                : "not-allowed",
            opacity:
              filteredPiaCables.length &&
              onBulkUpdateCablePiaNoi &&
              piaNoiNumber.trim() &&
              piaAuditNote.trim()
                ? 1
                : 0.55,
          }}
          onClick={applyBuildBulkPiaNoi}
          disabled={!filteredPiaCables.length || !onBulkUpdateCablePiaNoi || !piaNoiNumber.trim() || !piaAuditNote.trim()}
        >
          Apply PIA NOI To {n(filteredPiaCables.length)} Cable{filteredPiaCables.length === 1 ? "" : "s"}
        </button>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
          This updates piaNoiNumber on the cable and inside properties.piaNoiNumber so older panels can read it.
        </div>
      </section>
    ) : null}

    {activeTool === "daily" ? (
      <section style={wide}>
        <h3 style={title}>Daily Production</h3>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {isBackhaulWorkspace
            ? "Record what was completed today. Civils and cabling use metres on duct/cable routes; splicing uses splice counts on joints, chambers or data centres."
            : "Record what was completed today. Civils and cabling use metres on duct/cable routes; splicing uses splice counts on joints, DPs or chambers."}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Matched assets" value={n(dailyProgressAssets.length)} />
          <Tile label="Selected assets" value={n(selectedDailyProgressAssets.length)} />
          <Tile label="Team" value={dailyTeam === "civils" ? "Civils" : dailyTeam === "cabling" ? "Cabling" : "Splicing"} />
        </div>

        <div style={formGrid}>
          <label style={labelStyle}>
            Team
            <select value={dailyTeam} onChange={(event) => setDailyTeam(event.target.value as DailyProgressTeam)} style={inputStyle}>
              <option value="civils">Civils</option>
              <option value="cabling">Cabling</option>
              <option value="splicing">Splicing</option>
            </select>
          </label>
          <label style={labelStyle}>
            Date
            <input type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} style={inputStyle} />
          </label>
          {dailyTeam === "splicing" ? (
            <label style={labelStyle}>
              Splices done
              <input type="number" min={0} value={dailySpliceCount} onChange={(event) => setDailySpliceCount(Number(event.target.value))} style={inputStyle} />
            </label>
          ) : (
            <>
              <label style={labelStyle}>
                From metre
                <input type="number" min={0} step={0.1} value={dailyStartMeter} onChange={(event) => setDailyStartMeter(Number(event.target.value))} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                To metre
                <input type="number" min={0} step={0.1} value={dailyEndMeter} onChange={(event) => setDailyEndMeter(Number(event.target.value))} style={inputStyle} />
              </label>
            </>
          )}
          <label style={labelStyle}>
            Team / gang
            <input value={dailyCrewName} onChange={(event) => setDailyCrewName(event.target.value)} placeholder="Optional" style={inputStyle} />
          </label>
          {isBackhaulWorkspace ? (
            <>
              <label style={labelStyle}>
                Permit number
                <input value={dailyPermitNumber} onChange={(event) => setDailyPermitNumber(event.target.value)} placeholder="Street Manager ref" style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Permit start
                <input type="date" value={dailyPermitStartDate} onChange={(event) => setDailyPermitStartDate(event.target.value)} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Permit end
                <input type="date" value={dailyPermitEndDate} onChange={(event) => setDailyPermitEndDate(event.target.value)} style={inputStyle} />
              </label>
            </>
          ) : null}
          <label style={labelStyle}>
            Note
            <input value={dailyNote} onChange={(event) => setDailyNote(event.target.value)} style={inputStyle} />
          </label>
          {isBackhaulWorkspace ? (
            <>
              <label style={labelStyle}>
                Progress
                <textarea value={dailyProgressNote} onChange={(event) => setDailyProgressNote(event.target.value)} placeholder="What progressed today" style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} />
              </label>
              <label style={labelStyle}>
                Issues
                <textarea value={dailyIssueNote} onChange={(event) => setDailyIssueNote(event.target.value)} placeholder="Blocks, permit issues, traffic management or access issues" style={{ ...inputStyle, minHeight: 64, resize: "vertical" }} />
              </label>
            </>
          ) : null}
        </div>

        <div style={{ ...cablePreviewBox, marginBottom: 12 }}>
          <div style={{ color: "#1f2933", fontWeight: 900, marginBottom: 8 }}>
            Existing progress ranges
          </div>
          {!selectedDailyProgressAssets.length ? (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              Select a duct, cable or splice asset to see what has already been logged.
            </div>
          ) : dailyRoutePreview.every((item) => !item.entries.length) ? (
            <div style={{ color: "#64748b", fontSize: 12 }}>
              No previous production is logged against the selected asset{selectedDailyProgressAssets.length === 1 ? "" : "s"}.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {dailyRoutePreview.map(({ asset, entries, overlaps }) => {
                if (!entries.length) return null;
                return (
                  <div
                    key={String(asset.id)}
                    style={{
                      border: overlaps.length
                        ? "1px solid rgba(248,113,113,0.45)"
                        : "1px solid #ddd8cf",
                      background: overlaps.length ? "rgba(127,29,29,0.24)" : "transparent",
                      borderRadius: 9,
                      padding: 10,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong style={{ color: "#1f2933" }}>{asset.name || asset.label || asset.id}</strong>
                      {overlaps.length ? (
                        <span style={{ color: "#dc2626", fontWeight: 900 }}>
                          Overlaps selected range
                        </span>
                      ) : null}
                    </div>
                    <div style={{ display: "grid", gap: 5, marginTop: 8 }}>
                      {entries.slice(0, 8).map((entry: any, index) => {
                        const from = typeof entry.startMeter === "number" ? Math.min(entry.startMeter, entry.endMeter).toFixed(0) : "";
                        const to = typeof entry.endMeter === "number" ? Math.max(entry.startMeter, entry.endMeter).toFixed(0) : "";
                        const output = dailyTeam === "splicing"
                          ? `${Number(entry.spliceCount || 0).toLocaleString()} splice${Number(entry.spliceCount || 0) === 1 ? "" : "s"}`
                          : `${from}m to ${to}m`;
                        return (
                          <div
                            key={`${entry.id || index}`}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "90px minmax(90px, 130px) minmax(120px, 1fr)",
                              gap: 8,
                              color: "#64748b",
                              fontSize: 12,
                            }}
                          >
                            <span>{entry.date || "-"}</span>
                            <span style={{ color: "#2563eb", fontWeight: 850 }}>{output}</span>
                            <span>{entry.issueNote || entry.progressNote || entry.note || entry.crewName || "-"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div style={cablePreviewBox}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <div style={{ color: "#1f2933", fontWeight: 900 }}>Select Map Assets</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setSelectedDailyAssetIds(new Set(dailyProgressAssetIds))} style={{ ...button, padding: "6px 9px", fontSize: 12 }}>
                Select All
              </button>
              <button type="button" onClick={() => setSelectedDailyAssetIds(new Set())} style={{ ...button, padding: "6px 9px", fontSize: 12 }}>
                Clear
              </button>
            </div>
          </div>
          {dailyProgressAssets.slice(0, 180).map((asset: any) => {
            const assetId = String(asset.id || "");
            const selected = selectedDailyAssetIds.has(assetId);
            return (
              <label key={assetId} style={{ display: "grid", gridTemplateColumns: "22px minmax(160px, 1fr) auto", alignItems: "center", gap: 10, borderBottom: "1px solid #e2ded7", padding: "4px 0 7px", color: selected ? "#1f2933" : "#64748b", fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={selected} onChange={() => toggleDailyAssetSelection(assetId)} />
                <span style={{ fontWeight: selected ? 850 : 600 }}>{asset.name || asset.label || asset.id}</span>
                <span style={{ color: "#64748b" }}>{getAssetTypeLabel(asset)}</span>
              </label>
            );
          })}
          {dailyProgressAssets.length > 180 ? (
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
              Showing first 180 of {n(dailyProgressAssets.length)} matching assets.
            </div>
          ) : null}
        </div>

        <button
          type="button"
          style={{ ...button, background: "#15803d", borderColor: "rgba(74,222,128,0.42)", marginTop: 12 }}
          onClick={applyDailyProgress}
          disabled={!onRecordDailyProgress || !selectedDailyProgressAssets.length || !dailyNote.trim()}
        >
          Save Today&apos;s Production To {n(selectedDailyProgressAssets.length)} Asset{selectedDailyProgressAssets.length === 1 ? "" : "s"}
        </button>
      </section>
    ) : null}

    {activeTool === "status" ? (
      <section style={wide}>
        <h3 style={title}>Production Status</h3>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          {isBackhaulWorkspace
            ? "Update build state for ducts, cables, joints, chambers, poles and data centres. This feeds the overview, blockers and closeout exports."
            : "Update build state for ducts, cables, DPs, chambers, poles, cabinets and joints. This feeds the overview, blockers and closeout exports."}
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Matched assets" value={n(workStatusAssets.length)} />
          <Tile label="Selected assets" value={n(selectedWorkStatusAssets.length)} />
          <Tile label="New status" value={workStatus} />
        </div>

        <div style={formGrid}>
          <label style={labelStyle}>
            Asset type
            <select value={workStatusAssetFilter} onChange={(event) => setWorkStatusAssetFilter(event.target.value)} style={inputStyle}>
              <option value="all">All build assets</option>
              <option value="duct">Ducts</option>
              <option value="cable">Cables</option>
              {!isBackhaulWorkspace ? <option value="dp">DPs</option> : null}
              <option value="chamber">Chambers</option>
              <option value="pole">Poles</option>
              <option value="joint">Joints</option>
              {!isBackhaulWorkspace ? <option value="street cab">Street cabs</option> : null}
              {isBackhaulWorkspace ? <option value="data centre">Data Centres</option> : null}
            </select>
          </label>
          <label style={labelStyle}>
            Work status
            <select value={workStatus} onChange={(event) => setWorkStatus(event.target.value as WorkStatus)} style={inputStyle}>
              <option value="planned">Planned</option>
              <option value="assigned">Assigned</option>
              <option value="in-progress">In progress</option>
              <option value="complete">Complete</option>
              <option value="blocked">Blocked</option>
            </select>
          </label>
          <label style={labelStyle}>
            Team / gang
            <input value={workStatusTeam} onChange={(event) => setWorkStatusTeam(event.target.value)} placeholder="Optional" style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Audit note
            <input value={workStatusNote} onChange={(event) => setWorkStatusNote(event.target.value)} style={inputStyle} />
          </label>
        </div>

        <div style={cablePreviewBox}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <div style={{ color: "#1f2933", fontWeight: 900 }}>Select Assets</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setSelectedWorkAssetIds(new Set(workStatusAssetIds))} style={{ ...button, padding: "6px 9px", fontSize: 12 }}>
                Select All
              </button>
              <button type="button" onClick={() => setSelectedWorkAssetIds(new Set())} style={{ ...button, padding: "6px 9px", fontSize: 12 }}>
                Clear
              </button>
            </div>
          </div>
          {workStatusAssets.slice(0, 160).map((asset: any) => {
            const assetId = String(asset.id || "");
            const selected = selectedWorkAssetIds.has(assetId);
            return (
              <label key={assetId} style={{ display: "grid", gridTemplateColumns: "22px minmax(160px, 1fr) auto auto", alignItems: "center", gap: 10, borderBottom: "1px solid #e2ded7", padding: "4px 0 7px", color: selected ? "#1f2933" : "#64748b", fontSize: 12, cursor: "pointer" }}>
                <input type="checkbox" checked={selected} onChange={() => toggleWorkAssetSelection(assetId)} />
                <span style={{ fontWeight: selected ? 850 : 600 }}>{asset.name || asset.label || asset.id}</span>
                <span style={{ color: "#64748b" }}>{getAssetTypeLabel(asset)}</span>
                <span style={{ color: "#64748b" }}>{getAssetWorkStatus(asset)}</span>
              </label>
            );
          })}
          {workStatusAssets.length > 160 ? (
            <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
              Showing first 160 of {n(workStatusAssets.length)} assets. Use the type filter to narrow the list before applying.
            </div>
          ) : null}
        </div>

        <button
          type="button"
          style={{ ...button, background: "#15803d", borderColor: "rgba(74,222,128,0.42)", marginTop: 12 }}
          onClick={applyBulkWorkStatus}
          disabled={!onBulkUpdateWorkStatus || !selectedWorkStatusAssets.length || !workStatusNote.trim()}
        >
          Apply Status To {n(selectedWorkStatusAssets.length)} Asset{selectedWorkStatusAssets.length === 1 ? "" : "s"}
        </button>
      </section>
    ) : null}

    {activeTool === "joints" ? (
      <section style={wide}>
        <h3 style={title}>Bulk Joint / DP Install Method</h3>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Mark existing AG joints and SBs/DPs as Underground or Overhead. Assets already set to the selected method are hidden from this change list.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Needs update" value={n(installMethodAssets.length)} />
          <Tile label="Selected assets" value={n(selectedInstallMethodAssets.length)} />
          <Tile label="Install method" value={jointInstallMethod} />
        </div>

        <div style={formGrid}>
          <label style={labelStyle}>
            Asset filter
            <select value={jointSubtypeFilter} onChange={(event) => setJointSubtypeFilter(event.target.value as any)} style={inputStyle}>
              <option value="ALL">All joints and DPs</option>
              <option value="AG_JOINTS">AG joints only</option>
              <option value="DPS">SBs / DPs only</option>
              <option value="LMJ">LMJ only</option>
              <option value="CMJ">CMJ only</option>
              <option value="MMJ">MMJ only</option>
              <option value="MIDJ">MidJ only</option>
            </select>
          </label>

          <label style={labelStyle}>
            Set install method
            <select
              value={jointInstallMethod}
              onChange={(event) => {
                const nextMethod = event.target.value as "Underground" | "Overhead";
                setJointInstallMethod(nextMethod);
                setJointInstallAuditNote(`Bulk set existing joints / DPs to ${nextMethod}`);
              }}
              style={inputStyle}
            >
              <option>Underground</option>
              <option>Overhead</option>
            </select>
          </label>

          <label style={labelStyle}>
            Audit Note
            <input
              value={jointInstallAuditNote}
              onChange={(event) => setJointInstallAuditNote(event.target.value)}
              placeholder="Reason for this bulk update"
              style={inputStyle}
            />
          </label>
        </div>

        <div style={cablePreviewBox}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 8 }}>
            <div style={{ color: "#1f2933", fontWeight: 900 }}>
              Select Joints / DPs To Change
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={selectAllInstallAssets} style={{ ...button, padding: "6px 9px", fontSize: 12 }}>
                Select All
              </button>
              <button type="button" onClick={clearInstallAssetSelection} style={{ ...button, padding: "6px 9px", fontSize: 12 }}>
                Clear
              </button>
            </div>
          </div>
          {installMethodAssets.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {installMethodAssets.slice(0, 120).map((asset: any) => {
                const assetId = String(asset.id || "");
                const selected = selectedInstallAssetIds.has(assetId);
                return (
                  <label
                    key={asset.id}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "22px minmax(160px, 1fr) auto",
                      alignItems: "center",
                      gap: 10,
                      borderBottom: "1px solid #e2ded7",
                      padding: "4px 0 7px",
                      color: selected ? "#1f2933" : "#64748b",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleInstallAssetSelection(assetId)}
                    />
                    <span style={{ fontWeight: selected ? 850 : 600 }}>
                      {asset.name || asset.label || asset.id}
                    </span>
                    <span style={{ color: "#64748b" }}>
                      Current: {getInstallMethodLabel(asset)}
                    </span>
                  </label>
                );
              })}
              {installMethodAssets.length > 120 ? (
                <div style={{ color: "#64748b", fontSize: 12 }}>
                  Showing first 120 of {n(installMethodAssets.length)} matched assets. Use the filter to narrow the list before selecting.
                </div>
              ) : null}
            </div>
          ) : (
            <div style={{ color: "#15803d", fontSize: 12 }}>
              No joints or DPs need changing to {jointInstallMethod} with this filter.
            </div>
          )}
        </div>

        <button
          type="button"
          style={{
            ...button,
            background: canApplyBulkJointInstallMethod ? "#15803d" : "#14532d",
            borderColor: canApplyBulkJointInstallMethod ? "rgba(134,239,172,0.72)" : "rgba(74,222,128,0.24)",
            color: canApplyBulkJointInstallMethod ? "#ffffff" : "#9ca3af",
            marginTop: 12,
            opacity: canApplyBulkJointInstallMethod ? 1 : 0.62,
            cursor: canApplyBulkJointInstallMethod ? "pointer" : "not-allowed",
            boxShadow: canApplyBulkJointInstallMethod ? "0 0 0 1px rgba(34,197,94,0.22), 0 8px 18px rgba(21,128,61,0.22)" : "none",
          }}
          onClick={applyBulkJointInstallMethod}
          disabled={!canApplyBulkJointInstallMethod}
        >
          Set {n(selectedInstallMethodAssets.length)} Selected Asset{selectedInstallMethodAssets.length === 1 ? "" : "s"} To {jointInstallMethod}
        </button>
        {bulkJointInstallDisabledReason ? (
          <div style={{ color: "#fbbf24", fontSize: 12, marginTop: 8 }}>
            {bulkJointInstallDisabledReason}
          </div>
        ) : (
          <div style={{ color: "#15803d", fontSize: 12, marginTop: 8 }}>
            Ready to update {n(selectedInstallMethodAssets.length)} selected asset{selectedInstallMethodAssets.length === 1 ? "" : "s"}.
          </div>
        )}
      </section>
    ) : null}

    {activeTool === "reset" ? (
      <section style={wide}>
        <h3 style={title}>DP Fibre Allocation Reset</h3>
        <p style={{ color: "#64748b", marginTop: 0 }}>
          Clears only fibre allocation/routing state from every DP in this selected polygon.
          DP names, closure types, homes, notes, photos, statuses and selected through-cables are kept.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 12 }}>
          <Tile label="Area DPs" value={n(areaDistributionPoints.length)} />
          <Tile label="Action" value="Clear fibres" />
        </div>
        <button
          type="button"
          style={{
            ...button,
            background: "#dc2626",
            borderColor: "rgba(248,113,113,0.42)",
          }}
          onClick={onClearDpFibreAllocations}
          disabled={!areaDistributionPoints.length || !onClearDpFibreAllocations}
        >
          Clear DP Fibre Allocations In Area
        </button>
        <div style={{ color: "#64748b", fontSize: 12, marginTop: 8 }}>
          Use this before Rebuild Chain when old manual fibre allocations need wiping clean across the fibrehood.
        </div>
      </section>
    ) : null}

    {activeTool === "actions" ? (
      <section style={wide}>
        <h3 style={title}>Build Actions</h3>
        <p style={{ color: "#64748b" }}>
          Asset creation still lives on the main map so the existing right-click creation,
          snapping, cable drawing and save logic stays protected.
        </p>
        {blockers.length > 0 ? (
          <div style={readinessBox}>
            <strong style={{ color: "#fb7185" }}>Readiness blockers</strong>
            <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {blockers.map((blocker: string) => <li key={blocker}>{blocker}</li>)}
            </ul>
          </div>
        ) : null}
        <div style={readinessBox}>
          <strong style={{ color: "#2563eb" }}>Next actions</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {nextActions.map((action: string) => <li key={action}>{action}</li>)}
          </ul>
        </div>
        <button type="button" style={button} onClick={onBackToMap}>Back To Map To Build</button>
      </section>
    ) : null}
  </>;
}



