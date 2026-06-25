// =====================================================
// FILE: src/components/audits/AuditCommercialDashboard.tsx
// PURPOSE: Area/project level failed audit and payment blocker dashboard.
//          Can be dropped into Workspace Maintenance or Reports later.
// =====================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  loadAllCommercialBlockers,
  loadCommercialBlockersForAssets,
  type CommercialAuditBlocker,
} from "../../services/auditCommercialStatus";

type Props = {
  onSelectAssetId?: (assetId: string) => void;
  refreshKey?: number;
  projectAssets?: Array<{ id?: string; assetId?: string; name?: string; label?: string }>;
  assetIds?: string[];
  /**
   * When true, the dashboard must stay scoped to the current workspace.
   * If the workspace has no assets, show an empty commercial state instead
   * of falling back to global blockers from other project areas.
   */
  scopedToProject?: boolean;
};

const panel: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 10,
  padding: 16,
  minHeight: 190,
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 15,
  fontWeight: 900,
  color: "#e5e7eb",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const tile: React.CSSProperties = {
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
};

const rowButton: React.CSSProperties = {
  width: "100%",
  textAlign: "left",
  background: "#111827",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 10,
  padding: 12,
  color: "#e5e7eb",
  cursor: "pointer",
};

function n(value: number): string {
  return Number(value || 0).toLocaleString();
}

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function daysOpen(value?: string): number {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  const diffMs = Date.now() - date.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function contractorName(blocker: CommercialAuditBlocker): string {
  const item = blocker as any;
  return String(
    item.contractor ||
      item.latestAudit?.after?.contractor ||
      item.latestAudit?.after?.answers?.contractor ||
      item.changedByName ||
      item.changedByEmail ||
      "Unknown contractor",
  ).trim();
}




const subPanel: React.CSSProperties = {
  marginTop: 14,
  background: "#0b1424",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 12,
};

const subTitle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 13,
  fontWeight: 900,
  color: "#e5e7eb",
  letterSpacing: 0.2,
};

const table: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};

const th: React.CSSProperties = {
  color: "#94a3b8",
  textAlign: "left",
  padding: "8px 6px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
  fontWeight: 900,
};

const td: React.CSSProperties = {
  color: "#e5e7eb",
  padding: "8px 6px",
  borderBottom: "1px solid rgba(148,163,184,0.08)",
  verticalAlign: "top",
};

const emptyText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
};

function Tile({ label, value }: { label: string; value: React.ReactNode }) {
  return <div style={tile}><div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div><div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: "#f8fafc" }}>{value}</div></div>;
}

export default function AuditCommercialDashboard({
  onSelectAssetId,
  refreshKey = 0,
  projectAssets = [],
  assetIds = [],
  scopedToProject = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [blockers, setBlockers] = useState<CommercialAuditBlocker[]>([]);

  const assetDependencyKey = useMemo(
    () =>
      JSON.stringify(
        (projectAssets || []).map((a: any) => a?.id || a?.assetId).sort()
      ) + "|" + JSON.stringify((assetIds || []).slice().sort()),
    [projectAssets, assetIds]
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const scopedAssets = projectAssets.length ? projectAssets : assetIds;

        // Project Workspace must never fall back to the global commercial
        // register. If a selected area has no scoped assets yet, return an
        // empty dashboard rather than showing blockers from another AG.
        if (scopedToProject && !scopedAssets.length) {
          if (!cancelled) setBlockers([]);
          return;
        }

        const next = scopedAssets.length
          ? await loadCommercialBlockersForAssets(scopedAssets, 750)
          : await loadAllCommercialBlockers(500);
        if (!cancelled) setBlockers(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, assetDependencyKey, scopedToProject]);

  const blocked = blockers.filter((item) => item.paymentStatus === "blocked");
  const review = blockers.filter((item) => item.paymentStatus === "review");

  const reAuditQueue = blocked
    .slice()
    .sort((a, b) => daysOpen(b.changedAt) - daysOpen(a.changedAt));

  return (
    <section style={panel}>
      <h3 style={title}>Commercial Payment Blockers</h3>
      <div style={grid}>
        <Tile label="Blocked" value={n(blocked.length)} />
        <Tile label="Advisory Review" value={n(review.length)} />
        <Tile label="Open Re-Audits" value={n(reAuditQueue.length)} />
        <Tile label="Total Holds" value={n(blockers.length)} />
      </div>


      <div style={subPanel}>
        <h4 style={subTitle}>Re-Audit Queue</h4>
        {reAuditQueue.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={table}>
              <thead>
                <tr>
                  <th style={th}>Asset</th>
                  <th style={th}>Audit</th>
                  <th style={th}>Contractor</th>
                  <th style={th}>Failed On</th>
                  <th style={th}>Days Open</th>
                </tr>
              </thead>
              <tbody>
                {reAuditQueue.slice(0, 60).map((blocker) => (
                  <tr key={`reaudit-${blocker.assetId}-${blocker.auditId}`}>
                    <td style={td}>
                      <button
                        type="button"
                        onClick={() => onSelectAssetId?.(blocker.assetId)}
                        style={{
                          border: 0,
                          background: "transparent",
                          color: "#bfdbfe",
                          cursor: "pointer",
                          padding: 0,
                          fontWeight: 900,
                          textAlign: "left",
                        }}
                      >
                        {blocker.assetName || blocker.assetId}
                      </button>
                    </td>
                    <td style={td}>{blocker.auditTitle || blocker.auditType || "Audit"}</td>
                    <td style={td}>{contractorName(blocker)}</td>
                    <td style={td}>{formatDate(blocker.changedAt)}</td>
                    <td style={td}><strong>{daysOpen(blocker.changedAt)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={emptyText}>No failed audits are waiting for re-audit.</div>
        )}
      </div>

      <h4 style={{ ...subTitle, marginTop: 14 }}>Payment Hold Register</h4>

      <div style={{ display: "grid", gap: 8, marginTop: 12, maxHeight: 420, overflow: "auto" }}>
        {loading ? <div style={{ color: "#94a3b8" }}>Loading commercial blockers…</div> : null}
        {!loading && !blockers.length ? (
          <div style={{ color: "#94a3b8" }}>
            No failed/advisory audit blockers found for the loaded workspace assets.
          </div>
        ) : null}

        {blockers.slice(0, 120).map((blocker) => (
          <button key={`${blocker.assetId}-${blocker.auditId}`} type="button" style={rowButton} onClick={() => onSelectAssetId?.(blocker.assetId)}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <strong>{blocker.assetName || blocker.assetId}</strong>
              <span style={{ color: blocker.paymentStatus === "blocked" ? "#fca5a5" : "#fbbf24", fontWeight: 900 }}>
                {blocker.paymentStatus.toUpperCase()}
              </span>
            </div>
            <div style={{ color: "#cbd5e1", marginTop: 4 }}>
              {blocker.auditTitle || blocker.auditType || "Audit"} · {blocker.qualityStatus.toUpperCase()} · {formatDate(blocker.changedAt)}
            </div>
            <div style={{ color: "#93c5fd", marginTop: 4, fontWeight: 800 }}>
              Contractor: {contractorName(blocker)}
            </div>
            {blocker.comment ? <div style={{ color: "#94a3b8", marginTop: 4 }}>{blocker.comment}</div> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
