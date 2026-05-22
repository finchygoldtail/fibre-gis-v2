import React, { useMemo, useState } from "react";
import type { SavedMapAsset } from "../../map/types";
import {
  buildDuplicateHomeSummary,
  type DuplicateHomeGroup,
} from "./duplicateHomeResolution";

// =====================================================
// FILE: DuplicateHomeResolutionPanel.tsx
// PURPOSE: Workspace QA panel for duplicate / stacked home cleanup.
//          This panel does NOT write to Firestore directly. It sends a
//          resolution request up to ProjectWorkspace / JointMapManager so
//          the existing audited map save/chunk path stays authoritative.
// =====================================================

export type DuplicateHomeResolutionRequest = {
  groupId: string;
  canonicalHomeId: string;
  duplicateHomeIds: string[];
  note: string;
};

type Props = {
  projectAssets: SavedMapAsset[];
  onSelectAsset?: (asset: SavedMapAsset) => void;
  onOpenAsset?: (asset: SavedMapAsset) => void;
  onResolveDuplicateHomes?: (request: DuplicateHomeResolutionRequest) => void;
};

const panel: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 10,
  padding: 16,
  minHeight: 190,
  gridColumn: "span 2",
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#e5e7eb",
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
};

const statGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const statTile: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
};

const groupBox: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 10,
  padding: 12,
  marginTop: 10,
};

const candidateRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1.5fr) 90px 100px 100px 150px",
  gap: 8,
  alignItems: "center",
  padding: "8px 0",
  borderBottom: "1px solid rgba(148,163,184,0.10)",
  color: "#cbd5e1",
  fontSize: 12,
};

const button: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#111827",
  color: "#f8fafc",
  borderRadius: 8,
  padding: "8px 10px",
  fontWeight: 800,
  cursor: "pointer",
};

const dangerButton: React.CSSProperties = {
  ...button,
  background: "#7f1d1d",
  borderColor: "rgba(248,113,113,0.45)",
};

const keepPill: React.CSSProperties = {
  display: "inline-flex",
  justifyContent: "center",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 900,
  color: "#86efac",
  background: "rgba(34,197,94,0.16)",
  border: "1px solid rgba(34,197,94,0.35)",
};

const removePill: React.CSSProperties = {
  ...keepPill,
  color: "#fecaca",
  background: "rgba(239,68,68,0.16)",
  border: "1px solid rgba(239,68,68,0.35)",
};

function n(value: number): string {
  return Number(value || 0).toLocaleString("en-GB");
}

function candidateTitle(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(item.address || item.fullAddress || item.name || item.label || item.uprn || item.UPRN || item.id || "Home");
}

function defaultNote(group: DuplicateHomeGroup, duplicateCount: number): string {
  return `Resolve duplicate home group ${group.reason}: keep canonical home and remove ${duplicateCount} duplicate home${duplicateCount === 1 ? "" : "s"}`;
}

export default function DuplicateHomeResolutionPanel({
  projectAssets,
  onSelectAsset,
  onOpenAsset,
  onResolveDuplicateHomes,
}: Props) {
  const summary = useMemo(
    () => buildDuplicateHomeSummary(projectAssets || []),
    [projectAssets],
  );

  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(
    summary.groups[0]?.id || null,
  );
  const [canonicalByGroup, setCanonicalByGroup] = useState<Record<string, string>>({});

  const expandedGroup = summary.groups.find((group) => group.id === expandedGroupId) || summary.groups[0] || null;

  const resolveGroup = (group: DuplicateHomeGroup) => {
    const canonicalHomeId = canonicalByGroup[group.id] || group.canonical.id;
    const duplicateHomeIds = group.candidates
      .map((candidate) => candidate.id)
      .filter((id) => id && id !== canonicalHomeId);

    if (!canonicalHomeId || duplicateHomeIds.length === 0) {
      alert("Choose one canonical home and at least one duplicate to remove.");
      return;
    }

    const note = window.prompt(
      `Audit note required: resolve ${duplicateHomeIds.length} duplicate home${duplicateHomeIds.length === 1 ? "" : "s"}?`,
      defaultNote(group, duplicateHomeIds.length),
    );

    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      alert("An audit note is required before resolving duplicate homes.");
      return;
    }

    const ok = window.confirm(
      `Keep canonical home:\n${canonicalHomeId}\n\nRemove duplicate home${duplicateHomeIds.length === 1 ? "" : "s"}:\n${duplicateHomeIds.join("\n")}\n\nRelated drop cables for removed duplicates will also be removed. DPs, feeder/link cables, OR assets and project polygons are not touched.`,
    );

    if (!ok) return;

    onResolveDuplicateHomes?.({
      groupId: group.id,
      canonicalHomeId,
      duplicateHomeIds,
      note: trimmed,
    });
  };

  return (
    <section style={panel}>
      <h3 style={title}>Duplicate Home Resolution</h3>
      <p style={{ ...muted, marginTop: -4 }}>
        Detects duplicate UPRNs, duplicated home IDs, repeated addresses and stacked homes. Resolution is routed through the existing audited map save path.
      </p>

      <div style={statGrid}>
        <div style={statTile}><div style={muted}>Duplicate groups</div><div style={{ fontSize: 24, fontWeight: 900 }}>{n(summary.duplicateGroups)}</div></div>
        <div style={statTile}><div style={muted}>Duplicate assets</div><div style={{ fontSize: 24, fontWeight: 900 }}>{n(summary.duplicateAssets)}</div></div>
        <div style={statTile}><div style={muted}>Remove candidates</div><div style={{ fontSize: 24, fontWeight: 900 }}>{n(summary.removalCandidates)}</div></div>
      </div>

      {!summary.groups.length ? (
        <div style={groupBox}>
          <strong style={{ color: "#86efac" }}>No duplicate home groups found in this workspace area.</strong>
          <div style={muted}>This only checks the assets currently scoped to the selected polygon.</div>
        </div>
      ) : null}

      {summary.groups.slice(0, 20).map((group) => {
        const isOpen = expandedGroup?.id === group.id;
        const chosenCanonicalId = canonicalByGroup[group.id] || group.canonical.id;
        return (
          <div key={group.id} style={groupBox}>
            <button
              type="button"
              style={{ ...button, width: "100%", textAlign: "left", background: isOpen ? "#1e3a5f" : "#111827" }}
              onClick={() => setExpandedGroupId(isOpen ? null : group.id)}
            >
              {group.reason} — {group.warning}
            </button>

            {isOpen ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...candidateRow, color: "#93c5fd", fontWeight: 900 }}>
                  <span>Home</span><span>Decision</span><span>Status</span><span>Drop</span><span>Actions</span>
                </div>
                {group.candidates.map((candidate) => {
                  const selected = candidate.id === chosenCanonicalId;
                  return (
                    <div key={candidate.id} style={candidateRow}>
                      <div>
                        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                          <input
                            type="radio"
                            name={`canonical-${group.id}`}
                            checked={selected}
                            onChange={() => setCanonicalByGroup((prev) => ({ ...prev, [group.id]: candidate.id }))}
                          />
                          <span>
                            <strong style={{ color: "#f8fafc" }}>{candidateTitle(candidate.asset)}</strong>
                            <div style={muted}>{candidate.uprn || candidate.id}</div>
                            {candidate.connectedDpId ? <div style={muted}>DP: {candidate.connectedDpId}</div> : null}
                          </span>
                        </label>
                      </div>
                      <span style={selected ? keepPill : removePill}>{selected ? "KEEP" : "REMOVE"}</span>
                      <span>{candidate.status || "—"}</span>
                      <span>{candidate.hasDrop ? "Yes" : "No"}</span>
                      <span style={{ display: "flex", gap: 6 }}>
                        <button type="button" style={button} onClick={() => onSelectAsset?.(candidate.asset)}>Select</button>
                        <button type="button" style={button} onClick={() => onOpenAsset?.(candidate.asset)}>Open</button>
                      </span>
                    </div>
                  );
                })}

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginTop: 12 }}>
                  <div style={muted}>Pick the home to keep, then resolve the group. Duplicate homes and their duplicate drop cables are removed only through the parent audited handler.</div>
                  <button type="button" style={dangerButton} onClick={() => resolveGroup(group)} disabled={!onResolveDuplicateHomes}>
                    Resolve Group
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
