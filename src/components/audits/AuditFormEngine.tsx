import React, { useEffect, useMemo, useState } from "react";
import AuditPhotoUploader, { type AuditPhotoAttachment } from "./AuditPhotoUploader";
import AuditSignaturePad from "./AuditSignaturePad";

export type AuditQuestion = {
  id: string;
  label: string;
  type?: "boolean" | "text";
  required?: boolean;
  requireEvidenceOn?: Array<"Yes" | "No" | "N/A">;
};

export type AuditTemplate = {
  auditType: string;
  title: string;
  questions: AuditQuestion[];
};

type Props = {
  template: AuditTemplate;
  assetId?: string;
  assetName?: string;
  areaName?: string;
  auditor?: string;
  onSave?: (audit: any) => void | Promise<void>;
  onClose?: () => void;
};

export default function AuditFormEngine({
  template,
  assetId,
  assetName,
  areaName,
  auditor,
  onSave,
  onClose,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [comments, setComments] = useState("");
  const [contractor, setContractor] = useState("");
  const [result, setResult] = useState<"Pass" | "Advisory" | "Fail">("Pass");
  const [photos, setPhotos] = useState<AuditPhotoAttachment[]>([]);
  const [questionEvidencePhotos, setQuestionEvidencePhotos] = useState<
    Record<string, AuditPhotoAttachment[]>
  >({});
  const [signature, setSignature] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [validationMessage, setValidationMessage] = useState("");

  const answeredRequiredQuestions = useMemo(() => {
    return template.questions.every((question) => {
      if (!question.required) return true;
      const answer = answers[question.id];
      return answer !== undefined && answer !== null && String(answer).trim() !== "";
    });
  }, [answers, template.questions]);

  const evidenceRequiredQuestions = useMemo(() => {
    return template.questions
      .filter((question) => {
        const answer = answers[question.id];
        return question.requireEvidenceOn?.includes(answer);
      });
  }, [answers, template.questions]);

  const missingEvidenceQuestions = useMemo(
    () =>
      evidenceRequiredQuestions.filter(
        (question) => !(questionEvidencePhotos[question.id]?.length > 0),
      ),
    [evidenceRequiredQuestions, questionEvidencePhotos],
  );

  useEffect(() => {
    const activeEvidenceQuestionIds = new Set(
      evidenceRequiredQuestions.map((question) => question.id),
    );

    setQuestionEvidencePhotos((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([questionId]) =>
          activeEvidenceQuestionIds.has(questionId),
        ),
      );
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [evidenceRequiredQuestions]);

  const updateAnswer = (id: string, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value,
    }));
  };

  const handleSave = async () => {
    setValidationMessage("");

    if (!answeredRequiredQuestions) {
      setValidationMessage("Please complete all required questions before saving.");
      return;
    }

    if (missingEvidenceQuestions.length > 0) {
      setValidationMessage(
        `Please add evidence photo(s) for: ${missingEvidenceQuestions
          .map((question) => question.label)
          .join(", ")}`,
      );
      return;
    }

    if (result === "Fail" && !comments.trim()) {
      setValidationMessage("Please add comments explaining the failed audit.");
      return;
    }

    const contractorName = contractor.trim();

    const answersWithCommercialMetadata = {
      ...answers,
      contractor: contractorName,
    };

    const sectionPhotos = Object.values(questionEvidencePhotos).flat();
    const allPhotos = [...sectionPhotos, ...photos];

    const auditRecord = {
      auditType: template.auditType,
      assetId,
      assetName,
      areaName,
      auditor,
      contractor: contractorName,
      result,
      comments,
      answers: answersWithCommercialMetadata,
      photos: allPhotos,
      evidencePhotosByQuestion: questionEvidencePhotos,
      signature,
      createdAt: new Date().toISOString(),
    };

    setIsSaving(true);

    try {
      await onSave?.(auditRecord);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={root}>
      <div style={headerBlock}>
        <h2 style={title}>{template.title}</h2>

        <div style={metaGrid}>
          <Meta label="Asset" value={assetName || "-"} />
          <Meta label="Asset ID" value={assetId || "-"} />
          <Meta label="Area" value={areaName || "-"} />
          <Meta label="Auditor" value={auditor || "Current user"} />
          <Meta label="Date" value={new Date().toLocaleString("en-GB")} />
        </div>
      </div>


      <div style={section}>
        <h3 style={sectionTitle}>Contractor</h3>
        <input
          type="text"
          value={contractor}
          onChange={(e) => setContractor(e.target.value)}
          style={input}
          placeholder="Enter contractor name, e.g. Kelly, Avonline, Internal..."
        />
        <div style={fieldHint}>
          This is saved with the audit and used for commercial contractor performance reporting.
        </div>
      </div>

      {template.questions.map((question, index) => {
        const answer = answers[question.id];
        const needsEvidence = question.requireEvidenceOn?.includes(answer);

        return (
          <div key={question.id} style={questionCard}>
            <div style={questionHeader}>
              <div>
                <span style={questionNumber}>{index + 1}.</span>{" "}
                <span>{question.label}</span>
                {question.required ? <span style={required}> *</span> : null}
              </div>

              {needsEvidence ? (
                <span style={evidencePill}>Evidence required</span>
              ) : null}
            </div>

            {question.type === "text" ? (
              <textarea
                value={answers[question.id] || ""}
                onChange={(e) => updateAnswer(question.id, e.target.value)}
                style={textarea}
              />
            ) : (
              <div style={radioRow}>
                {(["Yes", "No", "N/A"] as const).map((option) => (
                  <label key={option} style={radioLabel(answer === option)}>
                    <input
                      type="radio"
                      checked={answer === option}
                      onChange={() => updateAnswer(question.id, option)}
                    />
                    {option}
                  </label>
                ))}
              </div>
            )}

            {needsEvidence ? (
              <div style={questionEvidenceBox}>
                <AuditPhotoUploader
                  title="Evidence photos for this item"
                  hintText="Attach the photo(s) that prove this specific failed/advisory item."
                  emptyText="No evidence photo attached for this item yet."
                  onChange={(nextPhotos) => {
                    setQuestionEvidencePhotos((current) => ({
                      ...current,
                      [question.id]: nextPhotos.map((photo) => ({
                        ...photo,
                        questionId: question.id,
                        questionLabel: question.label,
                      })),
                    }));
                  }}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      <AuditPhotoUploader
        title="General audit photos"
        hintText="Use this for wider context photos that are not tied to one failed item."
        onChange={setPhotos}
      />

      <AuditSignaturePad onChange={setSignature} />

      <div style={section}>
        <h3 style={sectionTitle}>Comments</h3>

        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          style={textareaLarge}
          placeholder="Add advisory notes, failed item details, or good practice observations..."
        />
      </div>

      <div style={section}>
        <h3 style={sectionTitle}>Outcome</h3>

        <div style={outcomeGrid}>
          {(["Pass", "Advisory", "Fail"] as const).map((option) => (
            <button
              key={option}
              type="button"
              style={outcomeButton(result === option, option)}
              onClick={() => setResult(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {validationMessage ? (
        <div style={errorBox}>{validationMessage}</div>
      ) : null}

      <div style={footer}>
        <button type="button" style={saveButton} onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Audit"}
        </button>

        <button type="button" style={closeButton} onClick={onClose} disabled={isSaving}>
          Close
        </button>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={metaItem}>
      <div style={metaLabel}>{label}</div>
      <div style={metaValue}>{value}</div>
    </div>
  );
}

const root: React.CSSProperties = {
  padding: 16,
  background: "#111827",
  color: "#fff",
  borderRadius: 8,
};

const headerBlock: React.CSSProperties = {
  background: "#0b1220",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 10,
  padding: 14,
  marginBottom: 14,
};

const title: React.CSSProperties = {
  margin: "0 0 12px",
  fontSize: 22,
};

const metaGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 10,
};

const metaItem: React.CSSProperties = {
  background: "#111827",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 8,
  padding: 10,
};

const metaLabel: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};

const metaValue: React.CSSProperties = {
  color: "#f8fafc",
  fontSize: 13,
  fontWeight: 800,
  marginTop: 4,
  wordBreak: "break-word",
};

const questionCard: React.CSSProperties = {
  marginBottom: 12,
  padding: 12,
  background: "#1f2937",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 8,
};

const questionHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#f8fafc",
  fontWeight: 800,
};

const questionNumber: React.CSSProperties = {
  color: "#93c5fd",
};

const required: React.CSSProperties = {
  color: "#fb7185",
};

const radioRow: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 10,
};

function radioLabel(active: boolean): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: active ? "#1d4ed8" : "#111827",
    border: active ? "1px solid rgba(147,197,253,0.75)" : "1px solid rgba(148,163,184,0.22)",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "8px 10px",
    cursor: "pointer",
    fontWeight: 800,
  };
}

const textarea: React.CSSProperties = {
  width: "100%",
  minHeight: 80,
  marginTop: 10,
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#020617",
  color: "#f8fafc",
  padding: 10,
};

const textareaLarge: React.CSSProperties = {
  ...textarea,
  minHeight: 110,
};

const input: React.CSSProperties = {
  width: "100%",
  borderRadius: 8,
  border: "1px solid rgba(148,163,184,0.24)",
  background: "#020617",
  color: "#f8fafc",
  padding: 10,
  fontWeight: 800,
};

const fieldHint: React.CSSProperties = {
  marginTop: 8,
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.4,
};

const section: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "#0b1220",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 8,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 16,
};

const evidencePill: React.CSSProperties = {
  color: "#fed7aa",
  background: "rgba(120,53,15,0.45)",
  border: "1px solid rgba(251,146,60,0.35)",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const questionEvidenceBox: React.CSSProperties = {
  marginTop: 12,
  background: "rgba(15,23,42,0.62)",
  border: "1px solid rgba(251,146,60,0.4)",
  borderRadius: 8,
  padding: 10,
};

const outcomeGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

function outcomeButton(active: boolean, outcome: "Pass" | "Advisory" | "Fail"): React.CSSProperties {
  const activeBg =
    outcome === "Pass" ? "#065f46" : outcome === "Advisory" ? "#92400e" : "#7f1d1d";

  return {
    border: active ? "1px solid rgba(255,255,255,0.55)" : "1px solid rgba(148,163,184,0.22)",
    background: active ? activeBg : "#111827",
    color: "#f8fafc",
    borderRadius: 8,
    padding: "10px 12px",
    fontWeight: 900,
    cursor: "pointer",
  };
}

const errorBox: React.CSSProperties = {
  marginTop: 12,
  background: "rgba(127,29,29,0.45)",
  border: "1px solid rgba(248,113,113,0.42)",
  color: "#fecaca",
  borderRadius: 8,
  padding: 12,
};

const footer: React.CSSProperties = {
  display: "flex",
  gap: 8,
  justifyContent: "flex-end",
  marginTop: 16,
};

const saveButton: React.CSSProperties = {
  border: "1px solid rgba(52,211,153,0.35)",
  background: "#065f46",
  color: "#fff",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};

const closeButton: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "#111827",
  color: "#fff",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 900,
  cursor: "pointer",
};
