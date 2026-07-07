// =====================================================
// FILE: src/components/audits/AuditPaymentBlockerPanel.tsx
// PURPOSE: Shows whether the selected asset has a failed/advisory audit
//          that should block or hold payment.
// =====================================================

import React, { useEffect, useState } from "react";
import {
  loadAssetCommercialBlocker,
  type CommercialAuditBlocker,
} from "../../services/auditCommercialStatus";

type Props = {
  assetId?: string;
  refreshKey?: number;
  onOpenAuditHistory?: () => void;
};

const panel: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid rgba(148,163,184,0.22)",
  borderRadius: 12,
  padding: 14,
  marginTop: 12,
};

const title: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 14,
  fontWeight: 900,
  color: "#e5e7eb",
};

const row: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  padding: "7px 0",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
  color: "#cbd5e1",
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

const blockedBox: React.CSSProperties = {
  background: "rgba(127,29,29,0.35)",
  border: "1px solid rgba(248,113,113,0.45)",
  borderRadius: 10,
  padding: 12,
  color: "#fecaca",
};

const reviewBox: React.CSSProperties = {
  background: "rgba(120,53,15,0.35)",
  border: "1px solid rgba(251,191,36,0.45)",
  borderRadius: 10,
  padding: 12,
  color: "#fde68a",
};

const goodBox: React.CSSProperties = {
  background: "rgba(6,95,70,0.22)",
  border: "1px solid rgba(52,211,153,0.35)",
  borderRadius: 10,
  padding: 12,
  color: "#bbf7d0",
};

function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
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


function readEvidencePayload(blocker: CommercialAuditBlocker): Record<string, any> {
  const after = blocker.latestAudit?.after as any;
  return after && typeof after === "object" ? after : {};
}

function formatAnswerKey(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function AuditEvidenceViewer({ blocker }: { blocker: CommercialAuditBlocker }) {
  const payload = readEvidencePayload(blocker);
  const answers =
    payload.answers && typeof payload.answers === "object" ? payload.answers : {};
  const answerRows = Object.entries(answers).filter(([key]) => key !== "contractor");
  const attachments = blocker.latestAudit?.attachments || [];
  const signature = String(payload.signature || "");

  return (
    <div style={evidenceBox}>
      <div style={evidenceTitle}>Audit Evidence</div>

      {answerRows.length ? (
        <div style={answerGrid}>
          {answerRows.map(([key, value]) => (
            <div key={key} style={answerRow}>
              <span style={answerKey}>{formatAnswerKey(key)}</span>
              <strong style={answerValue}>{String(value ?? "—")}</strong>
            </div>
          ))}
        </div>
      ) : (
        <div style={emptyText}>No question answers were stored for this audit.</div>
      )}

      {attachments.length ? (
        <div style={photoGrid}>
          {attachments.slice(0, 8).map((attachment: any) => {
            const src = attachment.url || attachment.dataUrl || "";
            return src ? (
              <a
                key={attachment.id || attachment.fileName}
                href={src}
                target="_blank"
                rel="noreferrer"
                style={photoLink}
              >
                <img src={src} alt={attachment.fileName || "Audit evidence"} style={photoThumb} />
                {attachment.questionLabel ? (
                  <span style={photoQuestion}>For: {attachment.questionLabel}</span>
                ) : null}
                <span>{attachment.fileName || "Photo"}</span>
              </a>
            ) : (
              <div key={attachment.id || attachment.fileName} style={photoPlaceholder}>
                📷 {attachment.fileName || "Photo"}
              </div>
            );
          })}
        </div>
      ) : (
        <div style={emptyText}>No photos attached to this audit.</div>
      )}

      {signature.startsWith("data:image") ? (
        <div style={signatureWrap}>
          <div style={signatureLabel}>Signature</div>
          <img src={signature} alt="Audit signature" style={signatureImage} />
        </div>
      ) : (
        <div style={emptyText}>No signature captured.</div>
      )}
    </div>
  );
}


function StatusRows({ blocker }: { blocker: CommercialAuditBlocker }) {
  return (
    <>
      <div style={row}><span>Audit</span><strong>{blocker.auditTitle || blocker.auditType || "Audit"}</strong></div>
      <div style={row}><span>Quality</span><strong>{blocker.qualityStatus.toUpperCase()}</strong></div>
      <div style={row}><span>Payment</span><strong>{blocker.paymentStatus.toUpperCase()}</strong></div>
      <div style={row}><span>Contractor</span><strong>{contractorName(blocker)}</strong></div>
      <div style={row}><span>Auditor</span><strong>{blocker.changedByName || blocker.changedByEmail || "—"}</strong></div>
      <div style={row}><span>Date</span><strong>{formatDate(blocker.changedAt)}</strong></div>
      {blocker.comment ? <div style={{ ...row, borderBottom: 0 }}><span>Comment</span><strong>{blocker.comment}</strong></div> : null}
    </>
  );
}

export default function AuditPaymentBlockerPanel({ assetId, refreshKey = 0, onOpenAuditHistory }: Props) {
  const [loading, setLoading] = useState(false);
  const [blocker, setBlocker] = useState<CommercialAuditBlocker | null>(null);
  const [showEvidence, setShowEvidence] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!assetId) {
        setBlocker(null);
        setShowEvidence(false);
        return;
      }

      setLoading(true);
      try {
        const next = await loadAssetCommercialBlocker(assetId);
        if (!cancelled) setBlocker(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [assetId, refreshKey]);

  return (
    <section style={panel}>
      <h4 style={title}>Commercial / Payment Status</h4>

      {loading ? (
        <div style={{ color: "#94a3b8" }}>Checking audit payment status…</div>
      ) : blocker ? (
        <div style={blocker.paymentStatus === "blocked" ? blockedBox : reviewBox}>
          <strong>
            {blocker.paymentStatus === "blocked" ? "PAYMENT BLOCKED" : "PAYMENT REVIEW REQUIRED"}
          </strong>
          <p style={{ margin: "8px 0" }}>{blocker.reason}</p>
          <StatusRows blocker={blocker} />
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              style={button}
              onClick={() => setShowEvidence((current) => !current)}
            >
              {showEvidence ? "Hide Audit Evidence" : "View Audit Evidence"}
            </button>
            <button type="button" style={button} onClick={onOpenAuditHistory}>View Audit History</button>
          </div>

          {showEvidence ? <AuditEvidenceViewer blocker={blocker} /> : null}
        </div>
      ) : (
        <div style={goodBox}>
          <strong>No active payment blocker</strong>
          <div style={{ marginTop: 6 }}>Latest audit status does not currently block payment.</div>
        </div>
      )}
    </section>
  );
}


const evidenceBox: React.CSSProperties = {
  marginTop: 12,
  padding: 12,
  background: "rgba(2,6,23,0.42)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 10,
  display: "grid",
  gap: 10,
};

const evidenceTitle: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 900,
};

const answerGrid: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const answerRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  alignItems: "center",
  color: "#cbd5e1",
  fontSize: 12,
  paddingBottom: 6,
  borderBottom: "1px solid rgba(148,163,184,0.08)",
};

const answerKey: React.CSSProperties = {
  color: "#94a3b8",
};

const answerValue: React.CSSProperties = {
  color: "#f8fafc",
  textAlign: "right",
};

const photoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 8,
};

const photoLink: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#bfdbfe",
  fontSize: 11,
  textDecoration: "none",
};

const photoQuestion: React.CSSProperties = {
  color: "#fed7aa",
  fontSize: 10,
  fontWeight: 900,
  lineHeight: 1.25,
};

const photoThumb: React.CSSProperties = {
  width: "100%",
  height: 82,
  objectFit: "cover",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "#020617",
};

const photoPlaceholder: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 8,
  padding: 8,
};

const signatureWrap: React.CSSProperties = {
  display: "grid",
  gap: 6,
};

const signatureLabel: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 900,
};

const signatureImage: React.CSSProperties = {
  width: "100%",
  maxHeight: 130,
  objectFit: "contain",
  background: "#fff",
  borderRadius: 8,
};

const emptyText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
};
