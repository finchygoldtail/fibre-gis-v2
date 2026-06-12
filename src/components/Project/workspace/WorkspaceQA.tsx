import React, { useMemo, useState } from "react";
import DuplicateHomeResolutionPanel from "./DuplicateHomeResolutionPanel";
import type { SavedMapAsset } from "../../map/types";

type Props = {
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: SavedMapAsset[];
  projectArea?: any;
  auditIssues?: any[];
  disconnectedAssets?: any[];
  networkGraph?: any;
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenJointEditor?: (asset: SavedMapAsset) => void;
  onResolveDuplicateHomes?: (request: any) => void;
};

type QaSeverity = "high" | "medium" | "low";
type QaViewMode = "navigator" | "list";

type QaCategoryGroup = {
  key: string;
  label: string;
  issues: any[];
};

const panel: React.CSSProperties = { background: "#0f1b2d", border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: 10, padding: 16, minHeight: 190 };
const wide: React.CSSProperties = { ...panel, gridColumn: "span 2" };
const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#e5e7eb" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const tile: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(148,163,184,0.14)", borderRadius: 10, padding: 12 };
const button: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", background: "#111827", color: "#f8fafc", borderRadius: 8, padding: "10px 12px", fontWeight: 800, cursor: "pointer" };
const severityGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 };
const stickyHeader: React.CSSProperties = { position: "sticky", top: 0, zIndex: 10, display: "grid", gap: 10, background: "#0f1b2d", paddingBottom: 10 };
const severityCard: React.CSSProperties = { borderRadius: 10, padding: 12, minHeight: 74, color: "#fff", border: "1px solid rgba(255,255,255,0.12)", textAlign: "left", cursor: "pointer" };
const toolbar: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, background: "#111827", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 10, padding: "10px 12px" };
const modeButton: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", background: "#020617", color: "#cbd5e1", borderRadius: 999, padding: "7px 10px", fontSize: 12, fontWeight: 900, cursor: "pointer" };
const modeButtonActive: React.CSSProperties = { background: "#1d4ed8", color: "#fff", borderColor: "rgba(147,197,253,0.65)" };
const categoryGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 };
const categoryCard: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111827", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 10, color: "#e5e7eb", padding: "10px 12px", textAlign: "left", cursor: "pointer", fontWeight: 900 };
const categoryCardActive: React.CSSProperties = { borderColor: "rgba(147,197,253,0.85)", boxShadow: "0 0 0 2px rgba(59,130,246,0.25)", background: "rgba(30,58,138,0.6)" };
const navigatorPanel: React.CSSProperties = { display: "grid", gap: 10, background: "#111827", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 12, padding: 14 };
const compactList: React.CSSProperties = { display: "grid", gap: 6, maxHeight: 360, overflow: "auto" };
const compactRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "90px 160px 220px 1fr", alignItems: "center", gap: 10, background: "#111827", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 8, padding: "8px 10px", color: "#e5e7eb", textAlign: "left" };
const navActions: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 };
const empty: React.CSSProperties = { color: "#94a3b8", background: "#111827", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 10, padding: 14 };

function n(value: any): string {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num.toLocaleString() : "0";
}

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={tile}><div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 900 }}>{value}</div></div>;
}

function normaliseSeverity(value: unknown): QaSeverity | null {
  const text = String(value || "").trim().toLowerCase();
  if (text === "high" || text === "medium" || text === "low") return text;
  return null;
}

function readIssueText(issue: any, keys: string[]): string {
  for (const key of keys) {
    const value = issue?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return "";
}

function issueAssetLabel(issue: any): string {
  return readIssueText(issue, ["assetName", "assetLabel", "name", "label", "assetId", "id"]) || "Unknown asset";
}

function issueDescription(issue: any): string {
  return readIssueText(issue, ["issue", "message", "description", "title", "detail", "warning"]) || "QA issue";
}

function classifyIssue(issue: any): { key: string; label: string } {
  const explicit = readIssueText(issue, ["category", "type", "issueType"]);
  const text = `${explicit} ${issueDescription(issue)} ${issueAssetLabel(issue)}`.toLowerCase();

  if (text.includes("capacity") || text.includes("over capacity") || text.includes("near capacity")) return { key: "capacity", label: "Capacity" };
  if (text.includes("68") || text.includes("drop distance") || text.includes("too far") || text.includes("distance")) return { key: "drop-distance", label: "Drop Distance" };
  if (text.includes("missing feed") || text.includes("unfed") || text.includes("not fed") || text.includes("feed")) return { key: "feed", label: "Feed / Fed State" };
  if (text.includes("disconnected") || text.includes("orphan") || text.includes("isolated")) return { key: "disconnected", label: "Disconnected / Orphan" };
  if (text.includes("topology") || text.includes("trace") || text.includes("upstream") || text.includes("downstream")) return { key: "topology", label: "Topology" };
  if (text.includes("duplicate") || text.includes("stacked")) return { key: "duplicates", label: "Duplicates / Stacked" };
  if (text.includes("fibre") || text.includes("fiber") || text.includes("splice") || text.includes("tray")) return { key: "fibre", label: "Fibre / Splicing" };
  if (text.includes("name") || text.includes("naming") || text.includes("id")) return { key: "naming", label: "Naming / IDs" };
  if (text.includes("metadata") || text.includes("missing") || text.includes("blank")) return { key: "metadata", label: "Missing Metadata" };

  if (explicit) {
    const label = explicit.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
    return { key: explicit.toLowerCase().replace(/\s+/g, "-"), label };
  }

  return { key: "other", label: "Other" };
}

function groupIssues(issues: any[]): QaCategoryGroup[] {
  const map = new Map<string, QaCategoryGroup>();
  issues.forEach((issue) => {
    const category = classifyIssue(issue);
    const group = map.get(category.key) || { key: category.key, label: category.label, issues: [] };
    group.issues.push(issue);
    map.set(category.key, group);
  });
  return Array.from(map.values()).sort((a, b) => b.issues.length - a.issues.length || a.label.localeCompare(b.label));
}

function findAssetForIssue(issue: any, assets: SavedMapAsset[]): SavedMapAsset | null {
  const keys = [issue?.assetId, issue?.id, issue?.assetName, issue?.assetLabel]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (!keys.length) return null;

  return assets.find((asset) => {
    const item = asset as any;
    const assetKeys = [asset.id, item.name, item.jointName, item.label, item.cableId]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return keys.some((key) => assetKeys.includes(key));
  }) || null;
}

function SeverityCard({ label, value, tone, active, onClick }: { label: string; value: number; tone: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" style={{ ...severityCard, background: tone, border: active ? "2px solid #93c5fd" : severityCard.border }} onClick={onClick}>
      <div style={{ fontSize: 12, opacity: 0.9 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900 }}>{n(value)}</div>
      <small style={{ opacity: 0.75 }}>Open assets</small>
    </button>
  );
}

export default function WorkspaceQA({ auditIssues = [], stats, projectAssets, onOpenQA, onSelectAsset, onOpenJointEditor, onResolveDuplicateHomes }: Props) {
  const [activeSeverity, setActiveSeverity] = useState<QaSeverity | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<QaViewMode>("navigator");
  const [issueIndex, setIssueIndex] = useState(0);

  const buckets = useMemo(() => ({
    high: auditIssues.filter((issue) => normaliseSeverity(issue?.severity) === "high"),
    medium: auditIssues.filter((issue) => normaliseSeverity(issue?.severity) === "medium"),
    low: auditIssues.filter((issue) => normaliseSeverity(issue?.severity) === "low"),
  }), [auditIssues]);

  const selectedSeverity = activeSeverity || (buckets.high.length ? "high" : buckets.medium.length ? "medium" : buckets.low.length ? "low" : null);
  const severityIssues = selectedSeverity ? buckets[selectedSeverity] : auditIssues;
  const categoryGroups = useMemo(() => groupIssues(severityIssues), [severityIssues]);
  const selectedCategoryKey = activeCategory && categoryGroups.some((group) => group.key === activeCategory) ? activeCategory : categoryGroups[0]?.key || null;
  const selectedGroup = categoryGroups.find((group) => group.key === selectedCategoryKey) || null;
  const selectedIssues = selectedGroup?.issues || [];
  const selectedIssue = selectedIssues.length ? selectedIssues[Math.min(issueIndex, selectedIssues.length - 1)] : null;

  const selectIssue = (issue: any) => {
    const asset = findAssetForIssue(issue, projectAssets || []);
    if (asset) {
      onSelectAsset?.(asset);
      return;
    }
    onOpenQA?.();
  };

  const move = (direction: -1 | 1) => {
    if (!selectedIssues.length) return;
    setIssueIndex((current) => {
      const next = current + direction;
      if (next < 0) return selectedIssues.length - 1;
      if (next >= selectedIssues.length) return 0;
      return next;
    });
  };

  const setSeverity = (severity: QaSeverity) => {
    setActiveSeverity(severity);
    setActiveCategory(null);
    setIssueIndex(0);
  };

  return <>
    <section style={panel}>
      <h3 style={title}>QA Status</h3>
      <div style={grid}>
        <Tile label="Total Issues" value={n(auditIssues.length || stats?.issueCount)} />
        <Tile label="High" value={n(buckets.high.length)} />
        <Tile label="Medium" value={n(buckets.medium.length)} />
      </div>
      <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 12 }}>
        Use the navigator below to step through issues and zoom/select the asset.
      </div>
    </section>

    <section style={wide}>
      <h3 style={title}>QA Navigator</h3>
      <div style={stickyHeader}>
        <div style={severityGrid}>
          <SeverityCard label="High" value={buckets.high.length} tone="#7f1d1d" active={selectedSeverity === "high"} onClick={() => setSeverity("high")} />
          <SeverityCard label="Medium" value={buckets.medium.length} tone="#78350f" active={selectedSeverity === "medium"} onClick={() => setSeverity("medium")} />
          <SeverityCard label="Low" value={buckets.low.length} tone="#1e3a8a" active={selectedSeverity === "low"} onClick={() => setSeverity("low")} />
        </div>
        <div style={toolbar}>
          <strong style={{ color: "#cbd5e1" }}>{selectedSeverity ? `${selectedSeverity.toUpperCase()} issues — ${n(severityIssues.length)}` : "No QA issues"}</strong>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" style={{ ...modeButton, ...(viewMode === "navigator" ? modeButtonActive : {}) }} onClick={() => setViewMode("navigator")}>Navigator View</button>
            <button type="button" style={{ ...modeButton, ...(viewMode === "list" ? modeButtonActive : {}) }} onClick={() => setViewMode("list")}>List View</button>
          </div>
        </div>
      </div>

      {auditIssues.length === 0 ? <p style={empty}>No QA issues found for this project area.</p> : <>
        <div style={categoryGrid}>
          {categoryGroups.map((group) => (
            <button key={group.key} type="button" style={{ ...categoryCard, ...(selectedCategoryKey === group.key ? categoryCardActive : {}) }} onClick={() => { setActiveCategory(group.key); setIssueIndex(0); if (group.issues[0]) selectIssue(group.issues[0]); }}>
              <span>{group.label}</span>
              <strong>{n(group.issues.length)}</strong>
            </button>
          ))}
        </div>

        {viewMode === "navigator" ? (
          <div style={{ ...navigatorPanel, marginTop: 10 }}>
            {selectedIssue ? <>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "#93c5fd", fontSize: 12, fontWeight: 900 }}>
                <span>{selectedGroup?.label || "QA Issue"} — Issue {Math.min(issueIndex + 1, selectedIssues.length)} of {selectedIssues.length}</span>
                <span>{String(selectedIssue?.severity || selectedSeverity || "issue").toUpperCase()}</span>
              </div>
              <div style={{ color: "#f8fafc", fontSize: 20, fontWeight: 900 }}>{issueAssetLabel(selectedIssue)}</div>
              <div style={{ color: "#cbd5e1", lineHeight: 1.45 }}>{issueDescription(selectedIssue)}</div>
              <div style={navActions}>
                <button type="button" style={button} onClick={() => move(-1)}>◀ Previous</button>
                <button type="button" style={{ ...button, background: "#1d4ed8" }} onClick={() => selectIssue(selectedIssue)}>Zoom / Select Asset</button>
                <button type="button" style={button} onClick={() => move(1)}>Next ▶</button>
              </div>
            </> : <div style={empty}>Select a category to start reviewing issues.</div>}
          </div>
        ) : (
          <div style={{ ...compactList, marginTop: 10 }}>
            {selectedIssues.slice(0, 120).map((issue, index) => {
              const category = classifyIssue(issue);
              return <button key={`${issue?.assetId || "issue"}-${index}`} type="button" style={compactRow} onClick={() => selectIssue(issue)}>
                <strong>{String(issue?.severity || selectedSeverity || "issue").toUpperCase()}</strong>
                <span>{category.label}</span>
                <span>{issueAssetLabel(issue)}</span>
                <small>{issueDescription(issue)}</small>
              </button>;
            })}
          </div>
        )}
      </>}
    </section>

    <DuplicateHomeResolutionPanel
      projectAssets={projectAssets || []}
      onSelectAsset={onSelectAsset}
      onOpenAsset={(asset) => {
        onSelectAsset?.(asset);
        onOpenJointEditor?.(asset);
      }}
      onResolveDuplicateHomes={onResolveDuplicateHomes}
    />
  </>;
}
