import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "../../map/types";

type ManagerPoint = { lat: number; lng: number };

type BulkDpStatus = "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
type DpTypeFilter = "ALL" | "CBT" | "AFN" | "MDU" | "MDU_SPLITTER";

type Props = {
  projectAssets: SavedMapAsset[];
  projectArea?: SavedMapAsset | null;
  drawnAreaPoints?: ManagerPoint[];
  isDrawingArea?: boolean;
  onStartDrawingArea?: () => void;
  onStopDrawingArea?: () => void;
  onClearDrawingArea?: () => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    status: BulkDpStatus;
    note: string;
  }) => void;
};

const STATUS_OPTIONS: BulkDpStatus[] = [
  "Live",
  "BWIP",
  "Unserviceable",
  "Live not ready for service",
];

const DP_FILTERS: { value: DpTypeFilter; label: string }[] = [
  { value: "ALL", label: "All DPs" },
  { value: "CBT", label: "CBT only" },
  { value: "AFN", label: "AFN only" },
  { value: "MDU", label: "MDU only" },
  { value: "MDU_SPLITTER", label: "MDU_SPLITTER only" },
];

function assetTitle(asset: any): string {
  return String(asset?.name || asset?.label || asset?.assetId || asset?.id || "Unnamed DP");
}

function getPoint(asset: any): ManagerPoint | null {
  if (typeof asset?.lat === "number" && typeof asset?.lng === "number") {
    return { lat: asset.lat, lng: asset.lng };
  }

  if (asset?.geometry?.type === "Point" && Array.isArray(asset.geometry.coordinates)) {
    const [lat, lng] = asset.geometry.coordinates;
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
      return { lat: nextLat, lng: nextLng };
    }
  }

  return null;
}

function isDistributionPoint(asset: any): boolean {
  const text = [
    asset?.assetType,
    asset?.type,
    asset?.jointType,
    asset?.dpType,
    asset?.distributionPointType,
    asset?.dpDetails?.closureType,
    asset?.name,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  return (
    asset?.assetType === "distribution-point" ||
    text.includes("distribution-point") ||
    text.includes("distribution point") ||
    text.includes("cbt") ||
    text.includes("afn") ||
    text.includes("mdu") ||
    text.includes("dp")
  );
}

function getClosureType(asset: any): DpTypeFilter {
  const raw = String(
    asset?.dpDetails?.closureType ||
      asset?.dpDetails?.networkArchitecture ||
      asset?.closureType ||
      asset?.dpType ||
      asset?.distributionPointType ||
      asset?.jointType ||
      "",
  ).toUpperCase();

  if (raw.includes("MDU_SPLITTER")) return "MDU_SPLITTER";
  if (raw.includes("MDU")) return "MDU";
  if (raw.includes("AFN")) return "AFN";
  return "CBT";
}

function pointInPolygon(point: ManagerPoint, polygon: ManagerPoint[]): boolean {
  if (polygon.length < 3) return false;

  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 0.0000001) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function getProjectPolygon(projectArea?: SavedMapAsset | null): ManagerPoint[] {
  if (!projectArea || projectArea.geometry?.type !== "Polygon") return [];

  const ring = projectArea.geometry.coordinates?.[0] || [];
  return ring
    .map(([lat, lng]) => ({ lat: Number(lat), lng: Number(lng) }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function statusBadgeStyle(status: string): React.CSSProperties {
  const lower = status.toLowerCase();
  if (lower.includes("live") && !lower.includes("not")) return livePill;
  if (lower.includes("bwip")) return bwipPill;
  if (lower.includes("unserviceable")) return badPill;
  return neutralPill;
}

export default function AreaBulkStatusPanel({
  projectAssets,
  projectArea,
  drawnAreaPoints = [],
  isDrawingArea = false,
  onStartDrawingArea,
  onStopDrawingArea,
  onClearDrawingArea,
  onBulkUpdateDpStatus,
}: Props) {
  const [scope, setScope] = useState<"PROJECT" | "DRAWN">("PROJECT");
  const [dpFilter, setDpFilter] = useState<DpTypeFilter>("ALL");
  const [status, setStatus] = useState<BulkDpStatus>("Live");
  const [note, setNote] = useState("");

  const projectPolygon = useMemo(() => getProjectPolygon(projectArea), [projectArea]);
  const activePolygon = scope === "DRAWN" ? drawnAreaPoints : projectPolygon;

  const affectedDps = useMemo(() => {
    const canUsePolygon = activePolygon.length >= 3;

    return projectAssets
      .filter(isDistributionPoint)
      .filter((asset) => {
        if (dpFilter === "ALL") return true;
        return getClosureType(asset) === dpFilter;
      })
      .filter((asset) => {
        if (scope === "PROJECT") return true;
        if (!canUsePolygon) return false;
        const point = getPoint(asset);
        return point ? pointInPolygon(point, activePolygon) : false;
      })
      .sort((a, b) => assetTitle(a).localeCompare(assetTitle(b)));
  }, [projectAssets, dpFilter, activePolygon, scope]);

  const canApply =
    affectedDps.length > 0 &&
    note.trim().length >= 3 &&
    (scope === "PROJECT" || drawnAreaPoints.length >= 3);

  const apply = () => {
    if (!canApply) {
      alert("Select an area, preview affected DPs, and enter a manager note before applying.");
      return;
    }

    const ok = window.confirm(
      `Update ${affectedDps.length} DP${affectedDps.length === 1 ? "" : "s"} to "${status}"?\n\nFilter: ${
        dpFilter === "ALL" ? "All DPs" : dpFilter
      }\nScope: ${scope === "PROJECT" ? "Current project area" : "Drawn area"}\n\nManager note: ${note.trim()}`,
    );

    if (!ok) return;

    onBulkUpdateDpStatus?.({
      assetIds: affectedDps.map((asset) => String(asset.id)),
      status,
      note: note.trim(),
    });
  };

  return (
    <section style={panel}>
      <div style={headerRow}>
        <div>
          <h3 style={title}>Manager Bulk DP Status</h3>
          <p style={subtitle}>
            Update DP build status across the current project area or a drawn manager area.
          </p>
        </div>
        <div style={countCard}>
          <span style={{ color: "#94a3b8", fontSize: 11 }}>Preview</span>
          <strong>{affectedDps.length}</strong>
          <span style={{ color: "#cbd5e1", fontSize: 11 }}>DPs affected</span>
        </div>
      </div>

      <div style={controlsGrid}>
        <label style={label}>
          Area scope
          <select
            value={scope}
            onChange={(event) => setScope(event.target.value as "PROJECT" | "DRAWN")}
            style={select}
          >
            <option value="PROJECT">Current project area</option>
            <option value="DRAWN">Drawn manager area</option>
          </select>
        </label>

        <label style={label}>
          DP filter
          <select value={dpFilter} onChange={(event) => setDpFilter(event.target.value as DpTypeFilter)} style={select}>
            {DP_FILTERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label style={label}>
          New status
          <select value={status} onChange={(event) => setStatus(event.target.value as BulkDpStatus)} style={select}>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      </div>

      {scope === "DRAWN" ? (
        <div style={drawBox}>
          <div>
            <strong>Drawn area</strong>
            <div style={{ color: "#cbd5e1", fontSize: 12 }}>
              Click the workspace map to place polygon points. Three or more points are needed.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" style={button} onClick={isDrawingArea ? onStopDrawingArea : onStartDrawingArea}>
              {isDrawingArea ? "Stop Drawing" : "Draw Area"}
            </button>
            <button type="button" style={button} onClick={onClearDrawingArea}>
              Clear
            </button>
          </div>
          <div style={drawMeta}>
            Points: <strong>{drawnAreaPoints.length}</strong>
            {drawnAreaPoints.length >= 3 ? " • area ready" : " • keep clicking map"}
          </div>
        </div>
      ) : null}

      <label style={label}>
        Manager note / audit reason
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Example: Baildon South AFNs released after testing and signoff."
          style={textarea}
        />
      </label>

      <div style={previewHeader}>
        <div>
          <strong>Affected DPs</strong>
          <span style={{ color: "#94a3b8", fontSize: 12, marginLeft: 8 }}>
            {dpFilter === "ALL" ? "All closure types" : dpFilter}
          </span>
        </div>
        <button type="button" style={applyButton} onClick={apply}>
          Apply Status
        </button>
      </div>

      <div style={previewList}>
        {affectedDps.length === 0 ? (
          <div style={empty}>
            No DPs match this scope/filter yet.
          </div>
        ) : (
          affectedDps.slice(0, 80).map((asset: any) => {
            const closure = getClosureType(asset);
            const currentStatus = String(asset?.dpDetails?.buildStatus || asset?.status || "Not set");

            return (
              <div key={String(asset.id)} style={previewRow}>
                <div>
                  <strong>{assetTitle(asset)}</strong>
                  <div style={{ color: "#94a3b8", fontSize: 12 }}>{closure}</div>
                </div>
                <span style={statusBadgeStyle(currentStatus)}>{currentStatus}</span>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

const panel: React.CSSProperties = {
  gridColumn: "1 / -1",
  width: "100%",
  boxSizing: "border-box",
  background: "#0f1b2d",
  border: "1px solid rgba(96, 165, 250, 0.28)",
  borderRadius: 12,
  padding: 16,
  minHeight: 260,
};

const headerRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
};

const title: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 18,
  fontWeight: 950,
  color: "#e5e7eb",
};

const subtitle: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  fontSize: 13,
};

const countCard: React.CSSProperties = {
  minWidth: 110,
  background: "#020617",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 3,
  textAlign: "center",
};

const controlsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 6,
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 800,
};

const select: React.CSSProperties = {
  background: "#020617",
  color: "#e5e7eb",
  border: "1px solid #334155",
  borderRadius: 9,
  padding: "10px 11px",
  outline: "none",
};

const textarea: React.CSSProperties = {
  minHeight: 76,
  background: "#020617",
  color: "#e5e7eb",
  border: "1px solid #334155",
  borderRadius: 9,
  padding: 11,
  resize: "vertical",
  outline: "none",
  marginTop: 12,
};

const drawBox: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 8,
  background: "rgba(2, 6, 23, 0.56)",
  border: "1px dashed rgba(96, 165, 250, 0.5)",
  borderRadius: 12,
  padding: 12,
};

const drawMeta: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
};

const previewHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  marginTop: 14,
};

const previewList: React.CSSProperties = {
  marginTop: 10,
  display: "grid",
  gap: 7,
  maxHeight: 260,
  overflow: "auto",
};

const previewRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "center",
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  borderRadius: 10,
  padding: "9px 11px",
  color: "#e5e7eb",
};

const empty: React.CSSProperties = {
  background: "#111827",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  borderRadius: 10,
  padding: 14,
  color: "#cbd5e1",
};

const button: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#111827",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "9px 11px",
  fontWeight: 800,
  cursor: "pointer",
};

const applyButton: React.CSSProperties = {
  ...button,
  background: "#2563eb",
  borderColor: "rgba(147,197,253,0.45)",
};

const neutralPill: React.CSSProperties = {
  borderRadius: 999,
  padding: "5px 9px",
  background: "#334155",
  color: "#e5e7eb",
  fontSize: 11,
  fontWeight: 900,
};

const livePill: React.CSSProperties = {
  ...neutralPill,
  background: "rgba(34,197,94,0.18)",
  color: "#86efac",
};

const bwipPill: React.CSSProperties = {
  ...neutralPill,
  background: "rgba(251,191,36,0.18)",
  color: "#fde68a",
};

const badPill: React.CSSProperties = {
  ...neutralPill,
  background: "rgba(248,113,113,0.18)",
  color: "#fecaca",
};
