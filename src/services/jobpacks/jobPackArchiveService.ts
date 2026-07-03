import type { JobPackDraft } from "./jobPackTypes";

const archiveKey = "alistra-job-pack-editor-archives:v1";

export function readArchivedJobPackDrafts(areaId: string): JobPackDraft[] {
  try {
    const raw = window.localStorage.getItem(archiveKey);
    const drafts = raw ? (JSON.parse(raw) as JobPackDraft[]) : [];
    return drafts.filter((draft) => draft.areaId === areaId);
  } catch {
    return [];
  }
}

export function archiveJobPackDraft(draft: JobPackDraft): JobPackDraft[] {
  const issuedDraft: JobPackDraft = { ...draft, status: "issued" };
  try {
    const raw = window.localStorage.getItem(archiveKey);
    const drafts = raw ? (JSON.parse(raw) as JobPackDraft[]) : [];
    const next = [issuedDraft, ...drafts.filter((item) => item.id !== draft.id)];
    window.localStorage.setItem(archiveKey, JSON.stringify(next));
    return next.filter((item) => item.areaId === draft.areaId);
  } catch {
    return [issuedDraft];
  }
}
