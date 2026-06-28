// =====================================================
// FILE: src/services/piaIntelligence.ts
// PURPOSE: Single source of truth for PIA Acceptance stats.
// Used by Project Workspace so the dashboard talks to the same
// PIA asset workflow data saved on poles/chambers.
// =====================================================

export type PiaAcceptanceStatus =
  | "not_required"
  | "not_started"
  | "photos_uploaded"
  | "contractor_pass"
  | "please_review"
  | "pia_pass"
  | "pia_fail";


export type PiaAcceptanceHistoryEntry = {
  id?: string;
  type:
    | "status"
    | "review_saved"
    | "photo_upload"
    | "not_required"
    | "note"
    | "system";
  label: string;
  message?: string;
  status?: PiaAcceptanceStatus;
  reviewer?: string;
  contractor?: string;
  photoCount?: number;
  reason?: string;
  createdAt: string;
};

export type PiaAcceptanceAlert<TAsset extends Record<string, any> = Record<string, any>> = {
  asset: TAsset;
  title: string;
  status: PiaAcceptanceStatus;
  statusLabel: string;
  message: string;
  priority: number;
};

export type PiaContractorBreakdown = {
  contractor: string;
  total: number;
  photosUploaded: number;
  contractorPass: number;
  pleaseReview: number;
  piaPass: number;
  piaFail: number;
  notRequired: number;
  awaitingPiaCheck: number;
  passPercent: number;
};

export type PiaAcceptanceStats<TAsset extends Record<string, any> = Record<string, any>> = {
  total: number;
  requiredTotal: number;
  notRequired: number;
  notStarted: number;
  photosUploaded: number;
  contractorPass: number;
  pleaseReview: number;
  piaPass: number;
  piaFail: number;
  awaitingPiaCheck: number;
  passed: number;
  failed: number;
  passPercent: number;
  failPercent: number;
  photoPercent: number;
  alerts: PiaAcceptanceAlert<TAsset>[];
  contractorBreakdown: PiaContractorBreakdown[];
};

const EMPTY_CONTRACTOR = "Unassigned";

export function normalisePiaAcceptanceStatus(value: unknown): PiaAcceptanceStatus {
  const text = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

  if (text === "not_required" || text === "not_used" || text === "not_applicable" || text === "not_needed" || text === "n/a" || text === "na") return "not_required";
  if (text === "photos_uploaded" || text === "photo_uploaded" || text === "photos") return "photos_uploaded";
  if (text === "contractor_pass" || text === "contractor_passed" || text === "contractor_accepted" || text === "cp") return "contractor_pass";
  if (text === "please_review" || text === "review" || text === "review_required" || text === "awaiting_review" || text === "pr") return "please_review";
  if (text === "pia_pass" || text === "pass" || text === "passed" || text === "accepted") return "pia_pass";
  if (text === "pia_fail" || text === "fail" || text === "failed" || text === "rejected") return "pia_fail";
  return "not_started";
}

export function getPiaAcceptanceStatusLabel(status: PiaAcceptanceStatus): string {
  if (status === "not_required") return "Not Required";
  if (status === "photos_uploaded") return "Photos Uploaded";
  if (status === "contractor_pass") return "Contractor Pass";
  if (status === "please_review") return "Please Review";
  if (status === "pia_pass") return "PIA Pass";
  if (status === "pia_fail") return "PIA Fail";
  return "Not Started";
}

export function isPiaAcceptanceAsset(asset: Record<string, any>): boolean {
  const type = String(asset.assetType || asset.type || asset.properties?.assetType || asset.properties?.type || "").toLowerCase();
  const nameText = [
    asset.name,
    asset.label,
    asset.title,
    asset.reference,
    asset.ref,
    asset.assetId,
    asset.id,
    asset.cableType,
    asset.properties?.name,
    asset.properties?.label,
    asset.properties?.title,
    asset.properties?.reference,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  if (
    nameText.includes("uprn") ||
    nameText.includes("drop") ||
    nameText.includes("home") ||
    nameText.includes("premise") ||
    nameText.includes("premises") ||
    type.includes("drop") ||
    type.includes("home") ||
    type.includes("premise") ||
    type.includes("cable") ||
    type.includes("distribution") ||
    type === "dp"
  ) {
    return false;
  }

  return type === "pole" || type === "chamber" || type.includes("pole") || type.includes("chamber");
}

export function getPiaAcceptanceDetails(
  asset: Record<string, any> | null | undefined,
): Record<string, any> {
  if (!asset) return {};

  return (
    asset.piaQa ||
    asset.piaQA ||
    asset.piaAcceptance ||
    asset.piaQaDetails ||
    asset.piaDetails ||
    asset.poleDetails?.piaQa ||
    asset.poleDetails?.piaQA ||
    asset.poleDetails?.piaAcceptance ||
    asset.chamberDetails?.piaQa ||
    asset.chamberDetails?.piaQA ||
    asset.chamberDetails?.piaAcceptance ||
    asset.properties?.piaQa ||
    asset.properties?.piaQA ||
    asset.properties?.piaAcceptance ||
    asset.properties?.poleDetails?.piaQa ||
    asset.properties?.chamberDetails?.piaQa ||
    {}
  );
}


export function getPiaAcceptanceHistory(
  asset: Record<string, any> | null | undefined,
): PiaAcceptanceHistoryEntry[] {
  if (!asset) return [];
  const details = getPiaAcceptanceDetails(asset);
  const rawHistory =
    details.history ||
    details.piaHistory ||
    asset.piaHistory ||
    asset.history ||
    asset.properties?.piaHistory ||
    [];

  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .map((entry): PiaAcceptanceHistoryEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const createdAt = String(entry.createdAt || entry.timestamp || entry.date || "");
      if (!createdAt) return null;
      return {
        id: String(entry.id || `${createdAt}-${entry.type || "event"}`),
        type: String(entry.type || "system") as PiaAcceptanceHistoryEntry["type"],
        label: String(entry.label || entry.title || "PIA update"),
        message: entry.message ? String(entry.message) : undefined,
        status: entry.status ? normalisePiaAcceptanceStatus(entry.status) : undefined,
        reviewer: entry.reviewer ? String(entry.reviewer) : undefined,
        contractor: entry.contractor ? String(entry.contractor) : undefined,
        photoCount: Number.isFinite(Number(entry.photoCount)) ? Number(entry.photoCount) : undefined,
        reason: entry.reason ? String(entry.reason) : undefined,
        createdAt,
      };
    })
    .filter((entry): entry is PiaAcceptanceHistoryEntry => Boolean(entry))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 75);
}

export function buildPiaAcceptanceHistoryPatch(
  asset: Record<string, any> | null | undefined,
  entry: Omit<PiaAcceptanceHistoryEntry, "id" | "createdAt"> & { createdAt?: string },
): { history: PiaAcceptanceHistoryEntry[]; piaHistory: PiaAcceptanceHistoryEntry[] } {
  const createdAt = entry.createdAt || new Date().toISOString();
  const nextEntry: PiaAcceptanceHistoryEntry = {
    ...entry,
    id: `${createdAt}-${entry.type}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
  };

  const nextHistory = [nextEntry, ...getPiaAcceptanceHistory(asset)]
    .filter((item, index, all) => {
      const key = `${item.createdAt}-${item.type}-${item.label}-${item.status || ""}`;
      return all.findIndex((other) => `${other.createdAt}-${other.type}-${other.label}-${other.status || ""}` === key) === index;
    })
    .slice(0, 75);

  return { history: nextHistory, piaHistory: nextHistory };
}

export function getPiaAcceptancePhotoCount(asset: Record<string, any>): number {
  const photos =
    asset.photos ||
    asset.photoUrls ||
    asset.piaPhotos ||
    asset.poleDetails?.photos ||
    asset.poleDetails?.piaPhotos ||
    asset.chamberDetails?.photos ||
    asset.chamberDetails?.piaPhotos ||
    asset.properties?.photos ||
    asset.properties?.photoUrls ||
    asset.properties?.poleDetails?.photos ||
    asset.properties?.chamberDetails?.photos ||
    [];
  return Array.isArray(photos) ? photos.length : 0;
}

export function getPiaAcceptanceStatus(asset: Record<string, any>): PiaAcceptanceStatus {
  const details = getPiaAcceptanceDetails(asset);
  const explicit = normalisePiaAcceptanceStatus(
    details.status ||
      details.piaStatus ||
      details.piaQaStatus ||
      details.piaAcceptanceStatus ||
      details.piaBuildStatus ||
      details.state ||
      asset.piaStatus ||
      asset.piaQaStatus ||
      asset.piaAcceptanceStatus ||
      asset.properties?.piaStatus ||
      asset.properties?.piaQaStatus,
  );

  if (explicit !== "not_started") return explicit;
  return getPiaAcceptancePhotoCount(asset) > 0 ? "photos_uploaded" : "not_started";
}

export function getPiaAcceptanceContractor(asset: Record<string, any>): string {
  const details = getPiaAcceptanceDetails(asset);
  const contractor =
    details.contractor ||
    details.contractorName ||
    asset.contractor ||
    asset.contractorName ||
    asset.poleDetails?.contractor ||
    asset.chamberDetails?.contractor ||
    asset.properties?.contractor ||
    asset.properties?.contractorName ||
    EMPTY_CONTRACTOR;
  return String(contractor || EMPTY_CONTRACTOR).trim() || EMPTY_CONTRACTOR;
}

function getAssetTitle(asset: Record<string, any>): string {
  return String(
    asset.name ||
      asset.label ||
      asset.title ||
      asset.reference ||
      asset.ref ||
      asset.assetId ||
      asset.id ||
      "Unnamed asset",
  );
}

function getAlertMessage(status: PiaAcceptanceStatus): string {
  if (status === "photos_uploaded") return "Photos uploaded — PIA team check required.";
  if (status === "contractor_pass") return "Contractor passed — ready for PIA acceptance check.";
  if (status === "please_review") return "Marked please review — action needed.";
  if (status === "pia_fail") return "PIA failed — contractor correction required.";
  return "PIA status update requires review.";
}

function getAlertPriority(status: PiaAcceptanceStatus): number {
  if (status === "pia_fail") return 1;
  if (status === "please_review") return 2;
  if (status === "contractor_pass") return 3;
  if (status === "photos_uploaded") return 4;
  return 9;
}

function blankStats<TAsset extends Record<string, any>>(): PiaAcceptanceStats<TAsset> {
  return {
    total: 0,
    requiredTotal: 0,
    notRequired: 0,
    notStarted: 0,
    photosUploaded: 0,
    contractorPass: 0,
    pleaseReview: 0,
    piaPass: 0,
    piaFail: 0,
    awaitingPiaCheck: 0,
    passed: 0,
    failed: 0,
    passPercent: 0,
    failPercent: 0,
    photoPercent: 0,
    alerts: [],
    contractorBreakdown: [],
  };
}

export function buildPiaAcceptanceStats<TAsset extends Record<string, any>>(
  assets: TAsset[] = [],
): PiaAcceptanceStats<TAsset> {
  const stats = blankStats<TAsset>();
  const contractorMap = new Map<string, PiaContractorBreakdown>();

  assets.filter(isPiaAcceptanceAsset).forEach((asset) => {
    const status = getPiaAcceptanceStatus(asset);
    const contractor = getPiaAcceptanceContractor(asset);

    stats.total += 1;
    if (status === "not_required") stats.notRequired += 1;
    else if (status === "photos_uploaded") stats.photosUploaded += 1;
    else if (status === "contractor_pass") stats.contractorPass += 1;
    else if (status === "please_review") stats.pleaseReview += 1;
    else if (status === "pia_pass") stats.piaPass += 1;
    else if (status === "pia_fail") stats.piaFail += 1;
    else stats.notStarted += 1;

    const row = contractorMap.get(contractor) || {
      contractor,
      total: 0,
      photosUploaded: 0,
      contractorPass: 0,
      pleaseReview: 0,
      piaPass: 0,
      piaFail: 0,
      notRequired: 0,
      awaitingPiaCheck: 0,
      passPercent: 0,
    };

    row.total += 1;
    if (status === "not_required") row.notRequired += 1;
    else if (status === "photos_uploaded") row.photosUploaded += 1;
    else if (status === "contractor_pass") row.contractorPass += 1;
    else if (status === "please_review") row.pleaseReview += 1;
    else if (status === "pia_pass") row.piaPass += 1;
    else if (status === "pia_fail") row.piaFail += 1;
    contractorMap.set(contractor, row);

    if (status === "photos_uploaded" || status === "contractor_pass" || status === "please_review" || status === "pia_fail") {
      stats.alerts.push({
        asset,
        title: getAssetTitle(asset),
        status,
        statusLabel: getPiaAcceptanceStatusLabel(status),
        message: getAlertMessage(status),
        priority: getAlertPriority(status),
      });
    }
  });

  stats.awaitingPiaCheck = stats.photosUploaded + stats.contractorPass + stats.pleaseReview;
  stats.requiredTotal = Math.max(0, stats.total - stats.notRequired);
  stats.passed = stats.piaPass;
  stats.failed = stats.piaFail;
  stats.passPercent = stats.requiredTotal ? Math.round((stats.piaPass / stats.requiredTotal) * 100) : 0;
  stats.failPercent = stats.requiredTotal ? Math.round((stats.piaFail / stats.requiredTotal) * 100) : 0;
  stats.photoPercent = stats.requiredTotal ? Math.round(((stats.requiredTotal - stats.notStarted) / stats.requiredTotal) * 100) : 0;
  stats.alerts = stats.alerts.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title)).slice(0, 50);

  stats.contractorBreakdown = Array.from(contractorMap.values())
    .map((row) => ({
      ...row,
      awaitingPiaCheck: row.photosUploaded + row.contractorPass + row.pleaseReview,
      passPercent: row.total - row.notRequired ? Math.round((row.piaPass / (row.total - row.notRequired)) * 100) : 0,
    }))
    .sort((a, b) => b.awaitingPiaCheck - a.awaitingPiaCheck || b.piaFail - a.piaFail || a.contractor.localeCompare(b.contractor));

  return stats;
}
