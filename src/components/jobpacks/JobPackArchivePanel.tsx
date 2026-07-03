import type React from "react";
import type { JobPackDraft } from "../../services/jobpacks";

type JobPackArchivePanelProps = {
  archives: JobPackDraft[];
};

export function JobPackArchivePanel({ archives }: JobPackArchivePanelProps) {
  return (
    <section style={panel}>
      <div style={title}>Issued Archive</div>
      {archives.length ? (
        <div style={stack}>
          {archives.map((archive) => (
            <article key={archive.id} style={row}>
              <strong>{archive.packNumber}</strong>
              <span>{new Date(archive.generatedAt).toLocaleString()}</span>
            </article>
          ))}
        </div>
      ) : (
        <div style={empty}>No issued Job Pack drafts archived from this editor yet.</div>
      )}
    </section>
  );
}

const panel: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 8,
  padding: 14,
  background: "rgba(15, 23, 42, 0.86)",
};

const title: React.CSSProperties = { fontSize: 15, fontWeight: 900, marginBottom: 12, color: "#f8fafc" };
const stack: React.CSSProperties = { display: "grid", gap: 8 };
const row: React.CSSProperties = { border: "1px solid rgba(148,163,184,.14)", borderRadius: 8, padding: 10, background: "rgba(2,6,23,.45)", display: "flex", justifyContent: "space-between", gap: 10 };
const empty: React.CSSProperties = { border: "1px dashed rgba(148,163,184,.22)", borderRadius: 8, padding: 14, color: "#94a3b8" };
