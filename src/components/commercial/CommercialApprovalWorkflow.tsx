import React, { useEffect, useMemo, useState } from "react";
import type { CommercialRegisterValues } from "./CommercialDocumentRegister";
import type { CommercialAuditBlocker } from "../../services/auditCommercialStatus";

export type CommercialApprovalState = {
  approved: boolean;
  approvedAt?: string;
  approvedBy?: string;
  comments?: string;
  history: CommercialApprovalHistoryItem[];
};

export type CommercialApprovalHistoryItem = {
  id: string;
  at: string;
  by: string;
  action: string;
  notes?: string;
};

type Props = {
  areaKey: string;
  areaName: string;
  currentUserLabel: string;
  canApproveCommercial: boolean;
  canViewCommercialMoney: boolean;
  projectAssetCount: number;
  auditedCount: number;
  passedCount: number;
  failedCount: number;
  advisoryCount: number;
  piaRequiredTotal: number;
  piaPassed: number;
  piaGatePassed: boolean;
  walkOffStatus: string;
  documentValues: CommercialRegisterValues | null;
  blockers: CommercialAuditBlocker[];
  onApprovalChange?: (state: CommercialApprovalState) => void;
};

type ChecklistItem = {
  key: string;
  label: string;
  complete: boolean;
  owner: string;
  reason: string;
  stage: string;
};

const emptyApproval: CommercialApprovalState = {
  approved: false,
  history: [],
};

const panel: React.CSSProperties = {
  marginTop: 14,
  background: "#08111f",
  border: "1px solid rgba(96,165,250,0.22)",
  borderRadius: 12,
  padding: 14,
};

const title: React.CSSProperties = {
  margin: 0,
  color: "#e5e7eb",
  fontSize: 14,
  fontWeight: 900,
};

const hint: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 6,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginTop: 12,
};

const card: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 10,
};

const smallButton: React.CSSProperties = {
  border: "1px solid rgba(34,197,94,0.38)",
  background: "rgba(22,163,74,0.16)",
  color: "#bbf7d0",
  borderRadius: 9,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const disabledButton: React.CSSProperties = {
  ...smallButton,
  opacity: 0.48,
  cursor: "not-allowed",
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

function cleanKey(value: string): string {
  return String(value || "commercial-area")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "commercial-area";
}

function storageKey(areaKey: string): string {
  return `alistra-commercial-approval-v1:${cleanKey(areaKey)}`;
}

function n(value: number): string {
  return Number(value || 0).toLocaleString();
}

function money(value: number): string {
  return Number(value || 0).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });
}

function pct(value: number): string {
  return `${Math.max(0, Math.min(100, Math.round(value || 0)))}%`;
}

function dateTime(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function stageColour(complete: boolean, blocked: boolean): string {
  if (complete) return "#86efac";
  if (blocked) return "#fca5a5";
  return "#fde68a";
}

function StagePill({ label, complete, blocked }: { label: string; complete: boolean; blocked: boolean }) {
  return (
    <div
      style={{
        background: complete ? "rgba(22,163,74,0.14)" : blocked ? "rgba(239,68,68,0.14)" : "rgba(245,158,11,0.13)",
        border: complete ? "1px solid rgba(34,197,94,0.32)" : blocked ? "1px solid rgba(248,113,113,0.34)" : "1px solid rgba(245,158,11,0.32)",
        color: stageColour(complete, blocked),
        borderRadius: 999,
        padding: "7px 9px",
        fontSize: 11,
        fontWeight: 900,
        textAlign: "center",
        whiteSpace: "nowrap",
      }}
    >
      {complete ? "✓" : blocked ? "🔒" : "○"} {label}
    </div>
  );
}

function ScoreCard({ label, value, detail, good }: { label: string; value: React.ReactNode; detail?: string; good?: boolean }) {
  return (
    <div style={{ ...card, borderColor: good ? "rgba(34,197,94,0.35)" : card.border }}>
      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 800 }}>{label}</div>
      <div style={{ color: good ? "#86efac" : "#f8fafc", fontSize: 22, fontWeight: 900, marginTop: 5 }}>{value}</div>
      {detail ? <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 4 }}>{detail}</div> : null}
    </div>
  );
}

export default function CommercialApprovalWorkflow({
  areaKey,
  areaName,
  currentUserLabel,
  canApproveCommercial,
  canViewCommercialMoney,
  projectAssetCount,
  auditedCount,
  passedCount,
  failedCount,
  advisoryCount,
  piaRequiredTotal,
  piaPassed,
  piaGatePassed,
  walkOffStatus,
  documentValues,
  blockers,
  onApprovalChange,
}: Props) {
  const [approval, setApproval] = useState<CommercialApprovalState>(emptyApproval);
  const [comments, setComments] = useState("");
  const key = useMemo(() => storageKey(areaKey || areaName), [areaKey, areaName]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      const parsed = stored ? JSON.parse(stored) : emptyApproval;
      setApproval({ ...emptyApproval, ...parsed, history: Array.isArray(parsed?.history) ? parsed.history : [] });
    } catch (err) {
      console.warn("Failed to load commercial approval", err);
      setApproval(emptyApproval);
    }
  }, [key]);

  useEffect(() => {
    onApprovalChange?.(approval);
  }, [approval, onApprovalChange]);

  function save(next: CommercialApprovalState) {
    setApproval(next);
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch (err) {
      console.warn("Failed to save commercial approval", err);
    }
  }

  const documentsUploaded = Boolean(documentValues && (
    documentValues.currentContractValue > 0 ||
    documentValues.originalContractValue > 0 ||
    documentValues.readyForPayment > 0 ||
    documentValues.heldValue > 0
  ));
  const qaComplete = auditedCount > 0 && failedCount === 0 && advisoryCount === 0;
  const walkOffComplete = String(walkOffStatus || "").toLowerCase() === "approved";
  const contractRegistered = Boolean(documentValues && documentValues.currentContractValue > 0);
  const variationsReviewed = Boolean(documentValues) && (documentValues?.approvedVariations || 0) >= 0;
  const paymentHoldsCleared = blockers.length === 0 && (documentValues?.heldValue || 0) === 0;
  const surveyComplete = projectAssetCount > 0;
  const buildComplete = projectAssetCount > 0;

  const checklist: ChecklistItem[] = [
    {
      key: "survey",
      label: "Survey Complete",
      complete: surveyComplete,
      owner: "Survey Team",
      stage: "Survey",
      reason: surveyComplete ? "Workspace assets are loaded." : "No workspace assets loaded yet.",
    },
    {
      key: "build",
      label: "Build Complete",
      complete: buildComplete,
      owner: "Build Partner",
      stage: "Build",
      reason: buildComplete ? `${n(projectAssetCount)} workspace assets available.` : "Build assets are not available yet.",
    },
    {
      key: "pia",
      label: "PIA Passed",
      complete: piaGatePassed,
      owner: "PIA Team",
      stage: "PIA",
      reason: piaGatePassed ? "PIA has passed in full." : `${n(piaPassed)} / ${n(piaRequiredTotal)} PIA items passed.`,
    },
    {
      key: "qa",
      label: "QA Passed",
      complete: qaComplete,
      owner: "QA Team",
      stage: "QA",
      reason: qaComplete ? "No failed/advisory audits are outstanding." : `${n(failedCount)} fails and ${n(advisoryCount)} advisories outstanding.`,
    },
    {
      key: "walkoff",
      label: "Walk-Off Complete",
      complete: walkOffComplete,
      owner: "Delivery Manager",
      stage: "Walk-Off",
      reason: walkOffComplete ? "Walk-Off is approved." : `Walk-Off status is ${walkOffStatus || "Pending"}.`,
    },
    {
      key: "documents",
      label: "Commercial Documents Uploaded",
      complete: documentsUploaded,
      owner: "Commercial Team",
      stage: "Commercial",
      reason: documentsUploaded ? "Commercial register has an uploaded value document." : "Upload the commercial template/document register for this area.",
    },
    {
      key: "contract",
      label: "Contract Registered",
      complete: contractRegistered,
      owner: "Commercial Manager",
      stage: "Commercial",
      reason: contractRegistered ? "Contract/current value is registered." : "Contract value has not been imported yet.",
    },
    {
      key: "variations",
      label: "Variations Reviewed",
      complete: variationsReviewed,
      owner: "Commercial Manager",
      stage: "Commercial",
      reason: variationsReviewed ? "Variation field has been reviewed." : "Upload the commercial template before approval.",
    },
    {
      key: "paymentHold",
      label: "Payment Holds Cleared",
      complete: paymentHoldsCleared,
      owner: "Commercial Team",
      stage: "Commercial",
      reason: paymentHoldsCleared ? "No payment blockers remain." : `${n(blockers.length)} audit blockers or ${canViewCommercialMoney ? money(documentValues?.heldValue || 0) : "locked value"} held remain.`,
    },
  ];

  const completeCount = checklist.filter((item) => item.complete).length;
  const commercialReadiness = Math.round((completeCount / Math.max(1, checklist.length)) * 100);
  const readinessToLive = approval.approved ? Math.min(100, commercialReadiness + 5) : commercialReadiness;
  const blockedItems = checklist.filter((item) => !item.complete);
  const canApproveNow = canApproveCommercial && blockedItems.length === 0;

  function approve() {
    if (!canApproveNow) return;
    const now = new Date().toISOString();
    const notes = comments.trim() || "Commercial approval completed.";
    const historyItem: CommercialApprovalHistoryItem = {
      id: `commercial-approval-${Date.now()}`,
      at: now,
      by: currentUserLabel,
      action: "Commercial Approved",
      notes,
    };
    save({
      approved: true,
      approvedAt: now,
      approvedBy: currentUserLabel,
      comments: notes,
      history: [historyItem, ...(approval.history || [])],
    });
    setComments("");
  }

  function resetApproval() {
    if (!canApproveCommercial) return;
    const now = new Date().toISOString();
    const historyItem: CommercialApprovalHistoryItem = {
      id: `commercial-reset-${Date.now()}`,
      at: now,
      by: currentUserLabel,
      action: "Commercial Approval Reset",
      notes: comments.trim() || "Approval reset for review.",
    };
    save({
      approved: false,
      history: [historyItem, ...(approval.history || [])],
    });
    setComments("");
  }

  return (
    <section style={panel}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <h4 style={title}>Commercial Approval Workflow</h4>
          <div style={hint}>
            Controlled sign-off from QA and Walk-Off through to Commercial Approval, RFS and Live. This test version stores approval locally and does not change Firestore or chunk storage.
          </div>
        </div>
        <div
          style={{
            border: approval.approved ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(245,158,11,0.35)",
            background: approval.approved ? "rgba(22,163,74,0.14)" : "rgba(245,158,11,0.12)",
            color: approval.approved ? "#bbf7d0" : "#fde68a",
            borderRadius: 999,
            padding: "7px 10px",
            fontSize: 11,
            fontWeight: 900,
          }}
        >
          {approval.approved ? "COMMERCIAL APPROVED" : "COMMERCIAL REVIEW"}
        </div>
      </div>

      <div style={grid}>
        <ScoreCard label="Commercial Readiness" value={pct(commercialReadiness)} detail={`${completeCount} / ${checklist.length} checklist items complete`} good={commercialReadiness === 100} />
        <ScoreCard label="Readiness To Live" value={pct(readinessToLive)} detail={approval.approved ? "Commercial approval complete" : `${blockedItems.length} blockers remain`} good={readinessToLive === 100} />
        <ScoreCard label="QA Gate" value={qaComplete ? "Passed" : "Locked"} detail={`${n(passedCount)} pass · ${n(failedCount)} fail · ${n(advisoryCount)} advisory`} good={qaComplete} />
        <ScoreCard label="RFS Gate" value={approval.approved ? "Unlocked" : "Locked"} detail={approval.approved ? "Commercial approval complete" : "Commercial approval required before RFS"} good={approval.approved} />
        <ScoreCard label="Live Gate" value={approval.approved ? "Ready after RFS" : "Locked"} detail="Live must stay locked until RFS is complete" good={approval.approved} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <StagePill label="Survey" complete={surveyComplete} blocked={false} />
        <StagePill label="Build" complete={buildComplete} blocked={!surveyComplete} />
        <StagePill label="PIA" complete={piaGatePassed} blocked={!buildComplete} />
        <StagePill label="QA" complete={qaComplete} blocked={!piaGatePassed} />
        <StagePill label="Walk-Off" complete={walkOffComplete} blocked={!piaGatePassed || !qaComplete} />
        <StagePill label="Commercial" complete={approval.approved} blocked={blockedItems.length > 0} />
        <StagePill label="RFS" complete={approval.approved} blocked={!approval.approved} />
        <StagePill label="Live" complete={false} blocked={!approval.approved} />
      </div>

      {blockedItems.length ? (
        <div style={{ ...card, marginTop: 12, borderColor: "rgba(248,113,113,0.32)", background: "rgba(127,29,29,0.16)" }}>
          <div style={{ color: "#fecaca", fontWeight: 900 }}>Blocked Before Commercial Approval</div>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18, color: "#fecaca", fontSize: 12, lineHeight: 1.5 }}>
            {blockedItems.slice(0, 8).map((item) => (
              <li key={`blocked-${item.key}`}><strong>{item.label}:</strong> {item.reason}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div style={{ ...card, marginTop: 12, borderColor: "rgba(34,197,94,0.32)", background: "rgba(20,83,45,0.12)", color: "#bbf7d0", fontWeight: 900 }}>
          All checklist items are complete. Commercial Approval can be completed by an authorised manager.
        </div>
      )}

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Checklist</th>
              <th style={th}>Status</th>
              <th style={th}>Owner</th>
              <th style={th}>Reason</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((item) => (
              <tr key={item.key}>
                <td style={td}><strong>{item.label}</strong></td>
                <td style={{ ...td, color: item.complete ? "#86efac" : "#fca5a5", fontWeight: 900 }}>{item.complete ? "Complete" : "Blocked"}</td>
                <td style={td}>{item.owner}</td>
                <td style={td}>{item.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ ...card, marginTop: 12 }}>
        <div style={{ color: "#e5e7eb", fontWeight: 900 }}>Digital Sign-Off</div>
        {approval.approved ? (
          <div style={{ ...hint, color: "#bbf7d0" }}>
            Approved by {approval.approvedBy || "Unknown"} on {dateTime(approval.approvedAt)}. {approval.comments || ""}
          </div>
        ) : (
          <div style={hint}>Approval unlocks only when QA, Walk-Off, documents, contract and payment hold checks are complete.</div>
        )}
        <textarea
          value={comments}
          onChange={(event) => setComments(event.target.value)}
          placeholder="Approval comments / reset notes"
          style={{
            width: "100%",
            minHeight: 64,
            resize: "vertical",
            boxSizing: "border-box",
            marginTop: 10,
            borderRadius: 8,
            border: "1px solid rgba(148,163,184,0.22)",
            background: "#020617",
            color: "#e5e7eb",
            padding: 10,
            fontSize: 12,
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <button
            type="button"
            style={canApproveNow ? smallButton : disabledButton}
            disabled={!canApproveNow}
            onClick={approve}
            title={!canApproveCommercial ? "Management role required" : blockedItems.length ? "Complete checklist first" : "Approve commercial completion"}
          >
            Approve Commercial
          </button>
          <button
            type="button"
            style={canApproveCommercial && approval.approved ? { ...smallButton, borderColor: "rgba(248,113,113,0.35)", background: "rgba(239,68,68,0.12)", color: "#fecaca" } : disabledButton}
            disabled={!canApproveCommercial || !approval.approved}
            onClick={resetApproval}
          >
            Reset Approval
          </button>
        </div>
        {!canApproveCommercial ? <div style={{ ...hint, color: "#fde68a" }}>Commercial approval is locked for this role.</div> : null}
      </div>

      <div style={{ marginTop: 12, overflowX: "auto" }}>
        <table style={table}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>User</th>
              <th style={th}>Action</th>
              <th style={th}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {approval.history.length ? approval.history.map((item) => (
              <tr key={item.id}>
                <td style={td}>{dateTime(item.at)}</td>
                <td style={td}>{item.by}</td>
                <td style={td}>{item.action}</td>
                <td style={td}>{item.notes || "—"}</td>
              </tr>
            )) : (
              <tr>
                <td style={td} colSpan={4}>No commercial approval history for this area yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
