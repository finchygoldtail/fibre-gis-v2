import { useState, type CSSProperties } from "react";
import type { SavedMapAsset } from "../map/types";
import {
  archiveJobPackDraft,
  buildJobPackDraftFromLiveMap,
  readArchivedJobPackDrafts,
  type JobPackDraft,
} from "../../services/jobpacks";
import { JobPackArchivePanel } from "./JobPackArchivePanel";
import { JobPackDraftBuilder } from "./JobPackDraftBuilder";
import { JobPackEditor } from "./JobPackEditor";
import { JobPackExportPanel } from "./JobPackExportPanel";
import { JobPackPreview } from "./JobPackPreview";

type JobPackCaptureTarget = "overview" | "96F" | "48F" | "36F" | "24F" | "12F";

type JobPackWorkspaceProps = {
  areaId: string;
  areaName: string;
  projectAssets: SavedMapAsset[];
  currentRevision?: string;
  savedDraftCount?: number;
  issuedPackNumber?: string;
  onCaptureJobPackMaps?: (targets: JobPackCaptureTarget[]) => Promise<Partial<Record<JobPackCaptureTarget, string>>>;
};

export default function JobPackWorkspace({
  areaId,
  areaName,
  projectAssets,
  currentRevision,
  savedDraftCount = 0,
  issuedPackNumber,
}: JobPackWorkspaceProps) {
  const [draft, setDraft] = useState<JobPackDraft | null>(null);
  const [archives, setArchives] = useState<JobPackDraft[]>(() => readArchivedJobPackDrafts(areaId));

  const buildDraft = () => {
    setDraft(buildJobPackDraftFromLiveMap({
      areaId,
      areaName,
      revision: currentRevision || "DRAFT-01",
      assets: projectAssets,
    }));
  };

  const archiveDraft = () => {
    if (!draft) return;
    setArchives(archiveJobPackDraft(draft));
    setDraft({ ...draft, status: "issued" });
  };

  return (
    <div style={shell}>
      <header style={header}>
        <div>
          <div style={eyebrow}>Job Pack Editor / Engineering Document Manager</div>
          <h3 style={title}>Alistra GIS controlled contractor pack</h3>
          <p style={copy}>
            Drafts are generated from live map assets for review, PDF export and archive. No live map data is changed from this workspace.
          </p>
        </div>
        <div style={statusBox}>
          <span>PDF export</span>
          <strong>Available</strong>
          <small>ZIP pack builder follows after the editor screens mature.</small>
        </div>
      </header>

      <div style={metrics}>
        <Metric label="Live Assets" value={projectAssets.length} />
        <Metric label="Existing Drafts" value={savedDraftCount} />
        <Metric label="Issued Pack" value={issuedPackNumber || "None"} />
        <Metric label="Editor Source" value="Live map" />
      </div>

      <JobPackDraftBuilder areaName={areaName} projectAssets={projectAssets} onBuildDraft={buildDraft} />

      {draft ? (
        <div style={grid}>
          <JobPackPreview draft={draft} />
          <JobPackExportPanel draft={draft} onArchive={archiveDraft} />
          <JobPackEditor draft={draft} />
        </div>
      ) : null}

      <JobPackArchivePanel archives={archives} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const shell: CSSProperties = { display: "grid", gap: 14 };
const header: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" };
const eyebrow: CSSProperties = { color: "#38bdf8", fontSize: 11, fontWeight: 900, textTransform: "uppercase" };
const title: CSSProperties = { margin: "4px 0", color: "#f8fafc", fontSize: 22 };
const copy: CSSProperties = { margin: 0, color: "#94a3b8", lineHeight: 1.5, maxWidth: 860 };
const statusBox: CSSProperties = { border: "1px solid rgba(34,197,94,.28)", borderRadius: 8, padding: 12, background: "rgba(20,83,45,.18)", minWidth: 180, display: "grid", gap: 3 };
const metrics: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 };
const metric: CSSProperties = { border: "1px solid rgba(148,163,184,.14)", borderRadius: 8, padding: 12, background: "rgba(2,6,23,.55)", display: "grid", gap: 4 };
const grid: CSSProperties = { display: "grid", gap: 14 };
