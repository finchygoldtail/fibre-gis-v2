// =====================================================
// FILE: src/components/audits/AuditCommercialDashboard.tsx
// PURPOSE: Area/project level failed audit and payment blocker dashboard.
//          Can be dropped into Workspace Maintenance or Reports later.
// =====================================================

import React, { useEffect, useMemo, useState } from "react";
import {
  loadAllCommercialStatuses,
  loadCommercialStatusesForAssets,
  type CommercialAuditBlocker,
  type CommercialAuditStatus,
} from "../../services/auditCommercialStatus";
import { useUserRole } from "../../context/UserRoleContext";
import CommercialDocumentRegister, { type CommercialRegisterValues } from "../commercial/CommercialDocumentRegister";
import CommercialApprovalWorkflow from "../commercial/CommercialApprovalWorkflow";

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
  piaRequiredTotal?: number;
  piaPassed?: number;
  piaGatePassed?: boolean;
  walkOffStatus?: string;
  areaKey?: string;
  areaName?: string;
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

function normaliseRoleText(value?: string): string {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
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

function commercialValue(blocker: CommercialAuditBlocker): number {
  const item = blocker as any;
  const raw =
    item.blockedValue ??
    item.value ??
    item.commercialValue ??
    item.paymentValue ??
    item.latestAudit?.after?.blockedValue ??
    item.latestAudit?.after?.value ??
    item.latestAudit?.after?.commercialValue ??
    item.latestAudit?.after?.answers?.blockedValue ??
    item.latestAudit?.after?.answers?.value;
  const value = typeof raw === "number" ? raw : Number(String(raw || "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function money(value: number): string {
  return value.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
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

const securityPanel: React.CSSProperties = {
  margin: "0 0 14px",
  background: "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.94))",
  border: "1px solid rgba(96,165,250,0.28)",
  borderRadius: 12,
  padding: 14,
};

const badge: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.3,
};

function Tile({ label, value, good }: { label: string; value: React.ReactNode; good?: boolean }) {
  return (
    <div style={{ ...tile, borderColor: good ? "rgba(34,197,94,0.35)" : tile.border }}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 6, fontSize: 24, fontWeight: 900, color: good ? "#86efac" : "#f8fafc" }}>{value}</div>
    </div>
  );
}

export default function AuditCommercialDashboard({
  onSelectAssetId,
  refreshKey = 0,
  projectAssets = [],
  assetIds = [],
  scopedToProject = false,
  piaRequiredTotal = 0,
  piaPassed = 0,
  piaGatePassed = true,
  walkOffStatus = "Pending",
  areaKey = "",
  areaName = "Current area",
}: Props) {
  const { profile, isAdmin, isSuperUser } = useUserRole();
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<CommercialAuditStatus[]>([]);
  const [documentValues, setDocumentValues] = useState<CommercialRegisterValues | null>(null);

  // Commercial security gate. Existing roles are preserved; no
  // Firestore schema/backend change is required. Sensitive money values are
  // only exposed to build managers / higher-ups, represented in the current
  // role model by Super User and Administrator accounts. Build Partner, Survey
  // and Maintenance users can still see the operational blockers they need to
  // fix, but not internal budget/payment value.
  const canViewCommercialMoney = isAdmin || isSuperUser;
  const commercialAccessLabel = canViewCommercialMoney
    ? "Management commercial view"
    : "Operational view - financials hidden";
  const roleLabel = profile?.role ? normaliseRoleText(profile.role) : "Loading role";

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
          if (!cancelled) setStatuses([]);
          return;
        }

        const next = scopedAssets.length
          ? await loadCommercialStatusesForAssets(scopedAssets, 750)
          : await loadAllCommercialStatuses(500);
        if (!cancelled) setStatuses(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [refreshKey, assetDependencyKey, scopedToProject]);

  const blockers = statuses.filter(
    (item): item is CommercialAuditBlocker => item.qualityStatus === "fail" || item.qualityStatus === "advisory",
  );
  const passed = statuses.filter((item) => item.qualityStatus === "pass");
  const blocked = blockers.filter((item) => item.paymentStatus === "blocked");
  const review = blockers.filter((item) => item.paymentStatus === "review");
  const auditBlockedValue = blocked.reduce((total, item) => total + commercialValue(item), 0);
  const blockedValue = documentValues?.heldValue || auditBlockedValue;
  const commercialReadyPercent = projectAssets.length
    ? Math.round((passed.length / Math.max(1, projectAssets.length)) * 100)
    : statuses.length
      ? Math.round((passed.length / Math.max(1, statuses.length)) * 100)
      : 0;
  const walkOffProgress = walkOffStatus === "Approved" ? 100 : piaGatePassed ? 50 : 0;

  const reAuditQueue = blocked
    .slice()
    .sort((a, b) => daysOpen(b.changedAt) - daysOpen(a.changedAt));

  return (
    <section style={panel}>
      <h3 style={title}>Commercial Reporting Dashboard</h3>

      <div style={securityPanel}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ color: "#bfdbfe", fontSize: 12, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Commercial Security
            </div>
            <div style={{ color: "#e5e7eb", marginTop: 5, fontWeight: 900 }}>
              {commercialAccessLabel}
            </div>
            <div style={{ color: "#94a3b8", marginTop: 4, fontSize: 12, lineHeight: 1.4 }}>
              Current role: {roleLabel}. Build partners can see operational blockers, QA actions and walk-off readiness only.
              Budget, contract value and payment value stay hidden unless the user is a build manager or higher.
            </div>
          </div>
          <span
            style={{
              ...badge,
              color: canViewCommercialMoney ? "#bbf7d0" : "#fde68a",
              background: canViewCommercialMoney ? "rgba(22,163,74,0.16)" : "rgba(245,158,11,0.14)",
              border: canViewCommercialMoney ? "1px solid rgba(34,197,94,0.35)" : "1px solid rgba(245,158,11,0.35)",
            }}
          >
            {canViewCommercialMoney ? "£ VALUES VISIBLE" : "£ VALUES LOCKED"}
          </span>
        </div>
      </div>

      <div style={grid}>
        <Tile label="Assets Audited" value={n(statuses.length)} />
        <Tile label="Assets Passed" value={n(passed.length)} good={passed.length > 0 && blocked.length === 0} />
        <Tile label="Assets Failed" value={n(blocked.length)} />
        <Tile label="Outstanding Advisories" value={n(review.length)} />
        <Tile label="Blocked Payments" value={n(blocked.length)} />
        <Tile label="Blocked Value" value={canViewCommercialMoney ? money(blockedValue) : "Locked"} good={canViewCommercialMoney && blockedValue === 0 && blocked.length === 0} />
        <Tile label="Walk-Off Progress" value={`${walkOffProgress}%`} good={walkOffProgress === 100} />
        <Tile label="Commercial Readiness" value={`${commercialReadyPercent}%`} good={commercialReadyPercent >= 85 && blocked.length === 0 && piaGatePassed} />
        <Tile label="PIA Gate" value={piaGatePassed ? "Passed" : `${n(piaPassed)} / ${n(piaRequiredTotal)}`} good={piaGatePassed} />
      </div>

      {!piaGatePassed ? (
        <div style={{ ...subPanel, borderColor: "rgba(251,191,36,0.35)", color: "#fde68a" }}>
          <strong>Walk-Off locked:</strong> PIA must be fully passed before commercial walk-off can start.
        </div>
      ) : null}

      <CommercialDocumentRegister
        areaKey={areaKey || areaName}
        areaName={areaName}
        canViewCommercialMoney={canViewCommercialMoney}
        canManageCommercialDocuments={canViewCommercialMoney}
        currentUserLabel={profile?.displayName || profile?.email || roleLabel}
        onValuesChange={setDocumentValues}
      />

      <CommercialApprovalWorkflow
        areaKey={areaKey || areaName}
        areaName={areaName}
        currentUserLabel={profile?.displayName || profile?.email || roleLabel}
        canApproveCommercial={canViewCommercialMoney}
        canViewCommercialMoney={canViewCommercialMoney}
        projectAssetCount={projectAssets.length}
        auditedCount={statuses.length}
        passedCount={passed.length}
        failedCount={blocked.length}
        advisoryCount={review.length}
        piaRequiredTotal={piaRequiredTotal}
        piaPassed={piaPassed}
        piaGatePassed={piaGatePassed}
        walkOffStatus={walkOffStatus}
        documentValues={documentValues}
        blockers={blockers}
      />

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
            {canViewCommercialMoney ? (
              <div style={{ color: "#bbf7d0", marginTop: 4, fontWeight: 900 }}>
                Blocked value: {commercialValue(blocker) ? money(commercialValue(blocker)) : "Not set"}
              </div>
            ) : (
              <div style={{ color: "#fde68a", marginTop: 4, fontWeight: 800 }}>
                Financial value hidden from this role
              </div>
            )}
            {blocker.comment ? <div style={{ color: "#94a3b8", marginTop: 4 }}>{blocker.comment}</div> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
