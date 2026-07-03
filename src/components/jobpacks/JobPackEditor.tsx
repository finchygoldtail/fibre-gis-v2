import type React from "react";
import type { JobPackDraft } from "../../services/jobpacks";

type JobPackEditorProps = {
  draft: JobPackDraft;
};

export function JobPackEditor({ draft }: JobPackEditorProps) {
  return (
    <section style={panel}>
      <div style={title}>Review Sections</div>
      <div style={grid}>
        <ReviewCard title="FAS / Fibre Allocation" count={draft.fasRows.length} />
        <ReviewCard title="DP Schedule" count={draft.dpSchedule.length} />
        <ReviewCard title="Homes / Premises" count={draft.homesSchedule.length} />
        <ReviewCard title="Risks / Access Issues" count={draft.risks.length} />
        <ReviewCard title="Build Notes" count={draft.buildNotes.length} />
        <ReviewCard title="Photos / Evidence" count={0} />
      </div>
    </section>
  );
}

function ReviewCard({ title, count }: { title: string; count: number }) {
  return (
    <article style={card}>
      <strong>{title}</strong>
      <span>{count} rows</span>
      <small>Editable review controls come next; Phase 1 keeps the generated draft isolated.</small>
    </article>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 8,
  padding: 14,
  background: "rgba(15, 23, 42, 0.86)",
};

const title: React.CSSProperties = { fontSize: 15, fontWeight: 900, marginBottom: 12, color: "#f8fafc" };
const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 10 };
const card: React.CSSProperties = { border: "1px solid rgba(148,163,184,.14)", borderRadius: 8, padding: 12, background: "rgba(2,6,23,.45)", display: "grid", gap: 6, color: "#cbd5e1" };
