import React, { useEffect, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../../firebase";
import type { SavedMapAsset } from "../types";
import type { PiaAcceptanceStatus } from "../../../services/piaIntelligence";
import {
  buildPiaAcceptanceHistoryPatch,
  getPiaAcceptanceDetails,
  getPiaAcceptanceHistory,
  getPiaAcceptancePhotoCount,
  getPiaAcceptanceStatus,
  getPiaAcceptanceStatusLabel,
} from "../../../services/piaIntelligence";

function getAssetTitle(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(item.name || item.jointName || item.label || item.assetId || item.id || "Unnamed asset");
}

function getAssetType(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(item.assetType || item.type || item.jointType || "Asset");
}


function safeFileName(name: string) {
  return String(name || "photo.jpg").replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadPiaEvidenceFile(asset: SavedMapAsset, file: File) {
  const item = asset as any;
  const assetId = String(item.id || item.assetId || item.name || "asset");
  const folder = assetId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileRef = ref(
    storage,
    `asset-uploads/pia-evidence/${folder}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(file.name)}`,
  );

  await uploadBytes(fileRef, file);

  return {
    url: await getDownloadURL(fileRef),
    name: file.name,
    fileName: file.name,
    uploadedAt: new Date().toISOString(),
    evidenceType: "pia",
  };
}


type PiaEvidencePhoto = {
  url?: string;
  thumbUrl?: string;
  name?: string;
  fileName?: string;
  capturedAt?: string;
  uploadedAt?: string;
  [key: string]: any;
};

function normalisePhotoRecord(photo: any): PiaEvidencePhoto | null {
  if (!photo) return null;

  if (typeof photo === "string") {
    return { url: photo, name: "PIA evidence" };
  }

  if (typeof photo !== "object") return null;

  const url =
    photo.url ||
    photo.downloadUrl ||
    photo.downloadURL ||
    photo.publicUrl ||
    photo.storageUrl ||
    photo.fullUrl ||
    photo.src ||
    photo.path ||
    photo.previewUrl ||
    photo.imageUrl ||
    photo.photoUrl ||
    photo.uri ||
    "";

  const thumbUrl =
    photo.thumbUrl ||
    photo.thumbnailUrl ||
    photo.thumbnail ||
    photo.previewUrl ||
    url ||
    "";

  return {
    ...photo,
    url: String(url || ""),
    thumbUrl: String(thumbUrl || ""),
    name: String(photo.name || photo.fileName || photo.filename || photo.label || "PIA evidence"),
    fileName: String(photo.fileName || photo.filename || photo.name || ""),
  };
}

function collectPhotos(value: any): PiaEvidencePhoto[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalisePhotoRecord).filter(Boolean) as PiaEvidencePhoto[];
  if (typeof value === "string") {
    const normalised = normalisePhotoRecord(value);
    return normalised ? [normalised] : [];
  }
  if (typeof value === "object") {
    const nested = value.photos || value.photoEvidence || value.evidencePhotos || value.uploadedEvidence || value.images || value.files;
    if (Array.isArray(nested)) return nested.map(normalisePhotoRecord).filter(Boolean) as PiaEvidencePhoto[];
    const normalised = normalisePhotoRecord(value);
    return normalised ? [normalised] : [];
  }
  return [];
}

function getPiaEvidencePhotos(asset: SavedMapAsset | null | undefined): PiaEvidencePhoto[] {
  const item = asset as any;
  if (!item) return [];

  const details = getPiaAcceptanceDetails(item);
  const sources = [
    details?.photos,
    details?.photoEvidence,
    details?.evidencePhotos,
    details?.uploadedEvidence,
    details?.images,
    item.photos,
    item.photoEvidence,
    item.evidencePhotos,
    item.uploadedEvidence,
    item.piaPhotos,
    item.piaQa?.photos,
    item.piaQa?.photoEvidence,
    item.piaQaDetails?.photos,
    item.piaQaDetails?.photoEvidence,
    item.poleDetails?.photos,
    item.poleDetails?.piaQa?.photos,
    item.poleDetails?.piaQa?.photoEvidence,
    item.chamberDetails?.photos,
    item.chamberDetails?.piaQa?.photos,
    item.chamberDetails?.piaQa?.photoEvidence,
    item.properties?.photos,
    item.properties?.photoEvidence,
    item.properties?.evidencePhotos,
    item.properties?.uploadedEvidence,
    item.properties?.piaQa?.photos,
    item.properties?.piaQa?.photoEvidence,
    item.properties?.poleDetails?.photos,
    item.properties?.poleDetails?.piaQa?.photos,
    item.properties?.chamberDetails?.photos,
    item.properties?.chamberDetails?.piaQa?.photos,
  ];

  const seen = new Set<string>();
  return sources
    .flatMap(collectPhotos)
    .filter((photo) => {
      const key = photo.url || photo.thumbUrl || photo.name || JSON.stringify(photo);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function statusColour(status: PiaAcceptanceStatus): string {
  if (status === "not_required") return "#64748b";
  if (status === "photos_uploaded") return "#38bdf8";
  if (status === "contractor_pass") return "#f97316";
  if (status === "please_review") return "#a855f7";
  if (status === "pia_pass") return "#22c55e";
  if (status === "pia_fail") return "#ef4444";
  return "#94a3b8";
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function historyTone(type: string, status?: PiaAcceptanceStatus): string {
  if (status === "pia_pass") return "#22c55e";
  if (status === "pia_fail") return "#ef4444";
  if (status === "not_required") return "#94a3b8";
  if (type === "photo_upload") return "#38bdf8";
  if (type === "review_saved") return "#a855f7";
  return "#f97316";
}

export default function PiaAssetEditor({
  asset,
  onStatusChange,
  onDetailsSave,
  onClearSelection,
}: {
  asset: SavedMapAsset | null;
  onStatusChange: (asset: SavedMapAsset, status: PiaAcceptanceStatus) => void;
  onDetailsSave: (asset: SavedMapAsset, patch: Record<string, any>) => void;
  onClearSelection: () => void;
}) {
  const status = asset ? getPiaAcceptanceStatus(asset as any) : "not_started";
  const evidencePhotos = getPiaEvidencePhotos(asset);
  const evidencePhotoCount = Math.max(asset ? getPiaAcceptancePhotoCount(asset as any) : 0, evidencePhotos.length);
  const assetHistory = getPiaAcceptanceHistory(asset as any);
  const [contractorName, setContractorName] = useState("");
  const [contractorNotes, setContractorNotes] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [notRequiredReason, setNotRequiredReason] = useState("");
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const [photoZoom, setPhotoZoom] = useState(1);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [photoBrightness, setPhotoBrightness] = useState(100);
  const [photoContrast, setPhotoContrast] = useState(100);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);

  useEffect(() => {
    const details = getPiaAcceptanceDetails(asset as any);
    setContractorName(String(details.contractorName || details.contractor || ""));
    setContractorNotes(String(details.contractorNotes || ""));
    setReviewer(String(details.piaReviewer || details.reviewer || ""));
    setReviewDate(String(details.piaReviewDate || details.reviewDate || ""));
    setReviewNotes(String(details.piaReviewNotes || details.reviewNotes || ""));
    setNotRequiredReason(String(details.notRequiredReason || details.notRequiredNote || ""));
  }, [asset?.id]);

  useEffect(() => {
    setSelectedPhotoIndex(null);
    resetPhotoInspector();
    setPhotoRotation(0);
    setPhotoBrightness(100);
    setPhotoContrast(100);
  }, [asset?.id]);

  if (!asset) {
    return (
      <section style={card}>
        <div style={emptyBox}>
          <h2 style={{ margin: 0 }}>Select an asset</h2>
          <p style={{ margin: "8px 0 0", color: "#94a3b8" }}>
            Pick any asset from the queue to upload evidence, review photos and update the PIA status.
          </p>
        </div>
      </section>
    );
  }

  const uploadPhotos = async (files: FileList | null) => {
    const nextFiles = Array.from(files || []);
    if (!asset || nextFiles.length === 0) return;

    setUploadingPhotos(true);
    try {
      const uploaded = await Promise.all(
        nextFiles.map((file) => uploadPiaEvidenceFile(asset, file)),
      );
      const nextPhotos = [...evidencePhotos, ...uploaded];

      onDetailsSave(asset, {
        photos: nextPhotos,
        photoEvidence: nextPhotos,
        evidencePhotos: nextPhotos,
        uploadedEvidence: nextPhotos,
        status: status === "not_started" ? "photos_uploaded" : status,
        lastUpdatedAt: new Date().toISOString(),
        ...buildPiaAcceptanceHistoryPatch(asset as any, {
          type: "photo_upload",
          label: `${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} uploaded`,
          message: "Build / PIA evidence uploaded",
          status: status === "not_started" ? "photos_uploaded" : status,
          photoCount: uploaded.length,
        }),
      });
    } finally {
      setUploadingPhotos(false);
    }
  };

  const save = () => {
    const now = new Date().toISOString();
    onDetailsSave(asset, {
      contractorName,
      contractor: contractorName,
      contractorNotes,
      piaReviewer: reviewer,
      reviewer,
      piaReviewDate: reviewDate,
      reviewDate,
      piaReviewNotes: reviewNotes,
      reviewNotes,
      notRequiredReason,
      lastUpdatedAt: now,
      ...buildPiaAcceptanceHistoryPatch(asset as any, {
        type: "review_saved",
        label: "Review saved",
        message: reviewNotes || contractorNotes || undefined,
        status,
        reviewer: reviewer || undefined,
        contractor: contractorName || undefined,
        reason: status === "not_required" ? notRequiredReason || undefined : undefined,
        createdAt: now,
      }),
    });
  };

  const selectedPhoto =
    selectedPhotoIndex === null ? null : evidencePhotos[selectedPhotoIndex] || null;

  const resetPhotoInspector = () => {
    setPhotoZoom(1);
    setPhotoRotation(0);
    setPhotoBrightness(100);
    setPhotoContrast(100);
  };

  const closePhotoViewer = () => {
    setSelectedPhotoIndex(null);
    resetPhotoInspector();
  };

  const movePhoto = (direction: -1 | 1) => {
    if (!evidencePhotos.length) return;
    setPhotoZoom(1);
    setSelectedPhotoIndex((current) => {
      const currentIndex = current ?? 0;
      return (currentIndex + direction + evidencePhotos.length) % evidencePhotos.length;
    });
  };

  return (
    <section style={card}>
      <div style={editorHeader}>
        <div>
          <div style={kicker}>Selected PIA Asset</div>
          <h2 style={editorTitle}>{getAssetTitle(asset)}</h2>
          <div style={editorSubtitle}>{getAssetType(asset)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ ...statusBadge, borderColor: statusColour(status), color: statusColour(status) }}>
            {getPiaAcceptanceStatusLabel(status)}
          </span>
          <button type="button" onClick={onClearSelection} style={closeButton}>×</button>
        </div>
      </div>

      <div style={formGrid}>
        <label style={field}>Contractor<input value={contractorName} onChange={(event) => setContractorName(event.target.value)} style={input} /></label>
        <label style={field}>Reviewer<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} style={input} /></label>
        <label style={field}>Review Date<input type="date" value={reviewDate} onChange={(event) => setReviewDate(event.target.value)} style={input} /></label>
        <div style={photoBox}><span>Photos</span><strong>{evidencePhotoCount}</strong></div>
      </div>

      <label style={field}>PIA Status
        <select value={status} onChange={(event) => {
            const nextStatus = event.target.value as PiaAcceptanceStatus;
            onStatusChange(asset, nextStatus);
            onDetailsSave(asset, {
              status: nextStatus,
              lastUpdatedAt: new Date().toISOString(),
              ...buildPiaAcceptanceHistoryPatch(asset as any, {
                type: nextStatus === "not_required" ? "not_required" : "status",
                label: `PIA status changed to ${getPiaAcceptanceStatusLabel(nextStatus)}`,
                status: nextStatus,
                reviewer: reviewer || undefined,
                contractor: contractorName || undefined,
                reason: nextStatus === "not_required" ? notRequiredReason || undefined : undefined,
              }),
            });
          }} style={input}>
          <option value="not_required">Not Required</option>
          <option value="not_started">Not Started</option>
          <option value="photos_uploaded">Photos Uploaded</option>
          <option value="contractor_pass">Contractor Pass</option>
          <option value="please_review">Please Review</option>
          <option value="pia_pass">PIA Pass</option>
          <option value="pia_fail">PIA Fail</option>
        </select>
      </label>


      {status === "not_required" ? (
        <label style={field}>Reason Not Required
          <select value={notRequiredReason} onChange={(event) => setNotRequiredReason(event.target.value)} style={input}>
            <option value="">Select reason...</option>
            <option value="Existing asset untouched">Existing asset untouched</option>
            <option value="Outside build scope">Outside build scope</option>
            <option value="Existing Openreach asset">Existing Openreach asset</option>
            <option value="Existing third-party asset">Existing third-party asset</option>
            <option value="Survey only">Survey only</option>
            <option value="Duplicate asset">Duplicate asset</option>
            <option value="Other">Other</option>
          </select>
        </label>
      ) : null}

      <label style={field}>Contractor Notes<textarea value={contractorNotes} onChange={(event) => setContractorNotes(event.target.value)} style={textarea} /></label>
      <label style={field}>PIA Review Notes<textarea value={reviewNotes} onChange={(event) => setReviewNotes(event.target.value)} style={textarea} /></label>

      <div style={evidenceBox}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 12 }}>
          <div>
            <div style={{ color: "#cbd5e1", fontWeight: 850 }}>Build / PIA Evidence ({evidencePhotoCount})</div>
            <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 4 }}>
              Upload build complete and PIA check photos against this asset. Reference assets stay locked; only evidence and QA fields are updated.
            </div>
          </div>
          <label style={{ ...primaryButton, display: "inline-flex", alignItems: "center", gap: 8, cursor: uploadingPhotos ? "wait" : "pointer", whiteSpace: "nowrap" }}>
            {uploadingPhotos ? "Uploading..." : "Upload Photos"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploadingPhotos}
              onChange={(event) => uploadPhotos(event.target.files)}
              style={{ display: "none" }}
            />
          </label>
        </div>
        <div style={{ color: "#cbd5e1", fontWeight: 850 }}>Uploaded Evidence ({evidencePhotoCount})</div>
        {evidencePhotos.length ? (
          <div style={photoGrid}>
            {evidencePhotos.map((photo, index) => {
              const url = photo.url || photo.thumbUrl || "";
              const label = photo.name || photo.fileName || `PIA evidence ${index + 1}`;
              return (
                <button
                  key={`${url || label}-${index}`}
                  type="button"
                  style={photoTile}
                  onClick={() => {
                    if (!url) return;
                    setSelectedPhotoIndex(index);
                    resetPhotoInspector();
                  }}
                  title={url ? "Open photo viewer" : "No preview URL"}
                >
                  {url ? (
                    <img src={photo.thumbUrl || url} alt={label} style={photoImage} />
                  ) : (
                    <div style={photoPlaceholder}>Photo record found<br />No preview URL</div>
                  )}
                  <div style={photoCaption}>{label}</div>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ color: "#94a3b8", marginTop: 10 }}>
            No photos uploaded for this PIA asset yet.
          </div>
        )}
      </div>

      <div style={historyPanel}>
        <div style={historyHeader}>
          <strong>Asset History</strong>
          <span>{assetHistory.length} events</span>
        </div>
        {assetHistory.length ? (
          <div style={historyList}>
            {assetHistory.slice(0, 8).map((entry) => (
              <div key={entry.id || `${entry.createdAt}-${entry.label}`} style={historyRow}>
                <span
                  style={{
                    ...historyDot,
                    background: historyTone(entry.type, entry.status),
                  }}
                />
                <div style={historyBody}>
                  <strong>{entry.label}</strong>
                  <span>{formatHistoryDate(entry.createdAt)}</span>
                  {entry.message ? <small>{entry.message}</small> : null}
                  {entry.reason ? <small>Reason: {entry.reason}</small> : null}
                  {entry.reviewer ? <small>Reviewer: {entry.reviewer}</small> : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={historyEmpty}>No history recorded yet.</div>
        )}
      </div>

      <div style={actions}>
        <button type="button" onClick={onClearSelection} style={secondaryButton}>Cancel</button>
        <button type="button" onClick={save} style={primaryButton}>Save Changes</button>
      </div>

      {selectedPhoto ? (
        <div style={viewerOverlay} onClick={closePhotoViewer}>
          <div style={viewerModal} onClick={(event) => event.stopPropagation()}>
            <div style={viewerHeader}>
              <div>
                <strong>PIA Evidence Photo</strong>
                <div style={viewerSub}>
                  Photo {(selectedPhotoIndex ?? 0) + 1} of {evidencePhotos.length} · {selectedPhoto.name || selectedPhoto.fileName || "Evidence"}
                </div>
              </div>
              <button type="button" onClick={closePhotoViewer} style={viewerCloseButton}>×</button>
            </div>

            <div
              style={viewerImageStage}
              onWheel={(event) => {
                event.preventDefault();
                setPhotoZoom((current) => {
                  const next = current + (event.deltaY < 0 ? 0.18 : -0.18);
                  return Math.min(5, Math.max(1, Number(next.toFixed(2))));
                });
              }}
            >
              <img
                src={selectedPhoto.url || selectedPhoto.thumbUrl}
                alt={selectedPhoto.name || selectedPhoto.fileName || "PIA evidence"}
                style={{
                  ...viewerImage,
                  transform: `scale(${photoZoom}) rotate(${photoRotation}deg)`,
                  filter: `brightness(${photoBrightness}%) contrast(${photoContrast}%)`,
                }}
              />
            </div>

            <div style={viewerToolbar}>
              <button type="button" onClick={() => movePhoto(-1)} style={viewerButton}>← Previous</button>
              <button type="button" onClick={() => setPhotoZoom((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} style={viewerButton}>− Zoom</button>
              <button type="button" onClick={() => setPhotoZoom((value) => Math.min(5, Number((value + 0.25).toFixed(2))))} style={viewerButton}>+ Zoom</button>
              <button type="button" onClick={() => setPhotoRotation((value) => value - 90)} style={viewerButton}>↺ Rotate</button>
              <button type="button" onClick={() => setPhotoRotation((value) => value + 90)} style={viewerButton}>↻ Rotate</button>
              <button type="button" onClick={() => setPhotoBrightness((value) => Math.max(60, value - 10))} style={viewerButton}>B−</button>
              <button type="button" onClick={() => setPhotoBrightness((value) => Math.min(160, value + 10))} style={viewerButton}>B+</button>
              <button type="button" onClick={() => setPhotoContrast((value) => Math.max(60, value - 10))} style={viewerButton}>C−</button>
              <button type="button" onClick={() => setPhotoContrast((value) => Math.min(180, value + 10))} style={viewerButton}>C+</button>
              <button type="button" onClick={resetPhotoInspector} style={viewerButton}>Reset</button>
              <button type="button" onClick={() => movePhoto(1)} style={viewerButton}>Next →</button>
              {selectedPhoto.url ? (
                <a href={selectedPhoto.url} target="_blank" rel="noreferrer" style={viewerLink}>Open full image</a>
              ) : null}
              
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

const card: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 14,
  padding: 16,
  boxSizing: "border-box",
  minHeight: 0,
  height: "100%",
  overflowY: "auto",
  overflowX: "hidden",
};
const emptyBox: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.18)", borderRadius: 12, padding: 18, color: "#f8fafc" };
const editorHeader: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, marginBottom: 14 };
const kicker: React.CSSProperties = { color: "#93c5fd", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.7 };
const editorTitle: React.CSSProperties = { margin: "6px 0 0", fontSize: 22, color: "#f8fafc" };
const editorSubtitle: React.CSSProperties = { marginTop: 6, color: "#94a3b8" };
const statusBadge: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "7px 12px", fontSize: 12, fontWeight: 850, whiteSpace: "nowrap" };
const closeButton: React.CSSProperties = { background: "transparent", color: "#e5e7eb", border: 0, fontSize: 28, cursor: "pointer", lineHeight: 1 };
const formGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 };
const field: React.CSSProperties = { display: "grid", gap: 7, color: "#cbd5e1", fontSize: 12, fontWeight: 750, marginBottom: 12 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 9, color: "#f8fafc", padding: "10px 12px", outline: "none" };
const textarea: React.CSSProperties = { ...input, minHeight: 72, resize: "vertical" };
const photoBox: React.CSSProperties = { background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 10, padding: 12, display: "grid", gap: 4, color: "#cbd5e1" };
const evidenceBox: React.CSSProperties = { border: "1px dashed rgba(148,163,184,0.34)", borderRadius: 12, padding: 15, marginTop: 4 };
const photoGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 12 };
const photoTile: React.CSSProperties = { display: "grid", gap: 8, color: "#dbeafe", textDecoration: "none", background: "rgba(2,6,23,0.55)", border: "1px solid rgba(148,163,184,0.18)", borderRadius: 10, padding: 8, minWidth: 0, cursor: "zoom-in", textAlign: "left" };
const photoImage: React.CSSProperties = { width: "100%", height: 145, objectFit: "cover", borderRadius: 8, background: "#020617", border: "1px solid rgba(148,163,184,0.14)" };
const photoPlaceholder: React.CSSProperties = { height: 145, display: "grid", placeItems: "center", textAlign: "center", color: "#94a3b8", background: "rgba(15,23,42,0.85)", border: "1px dashed rgba(148,163,184,0.28)", borderRadius: 8, fontSize: 12 };
const photoCaption: React.CSSProperties = { color: "#cbd5e1", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const viewerOverlay: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9000,
  background: "rgba(2,6,23,0.88)",
  display: "grid",
  placeItems: "center",
  padding: 24,
};
const viewerModal: React.CSSProperties = {
  width: "min(1180px, 96vw)",
  height: "min(820px, 92vh)",
  background: "#020617",
  border: "1px solid rgba(96,165,250,0.38)",
  borderRadius: 16,
  boxShadow: "0 30px 90px rgba(0,0,0,0.55)",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  overflow: "hidden",
};
const viewerHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  padding: "14px 16px",
  borderBottom: "1px solid rgba(148,163,184,0.18)",
  color: "#f8fafc",
};
const viewerSub: React.CSSProperties = { color: "#94a3b8", fontSize: 12, marginTop: 4 };
const viewerCloseButton: React.CSSProperties = { background: "transparent", color: "#f8fafc", border: 0, cursor: "pointer", fontSize: 30, lineHeight: 1 };
const viewerImageStage: React.CSSProperties = {
  minHeight: 0,
  overflow: "auto",
  display: "grid",
  placeItems: "center",
  background: "radial-gradient(circle at center, rgba(30,41,59,0.55), #020617)",
  cursor: "grab",
};
const viewerImage: React.CSSProperties = {
  maxWidth: "92%",
  maxHeight: "92%",
  objectFit: "contain",
  transformOrigin: "center center",
  transition: "transform 120ms ease",
  borderRadius: 8,
  boxShadow: "0 18px 55px rgba(0,0,0,0.45)",
};
const viewerToolbar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: 14,
  borderTop: "1px solid rgba(148,163,184,0.18)",
};
const viewerButton: React.CSSProperties = {
  background: "#0f172a",
  color: "#e5e7eb",
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 10,
  padding: "9px 13px",
  cursor: "pointer",
  fontWeight: 800,
};
const viewerLink: React.CSSProperties = {
  ...viewerButton,
  textDecoration: "none",
  background: "#12356b",
  color: "#bfdbfe",
};
const historyPanel: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
  padding: 12,
  background: "rgba(2,6,23,0.38)",
};
const historyHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  color: "#cbd5e1",
  fontSize: 12,
  marginBottom: 10,
};
const historyList: React.CSSProperties = { display: "grid", gap: 9 };
const historyRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "14px minmax(0, 1fr)",
  gap: 9,
  alignItems: "start",
};
const historyDot: React.CSSProperties = {
  width: 10,
  height: 10,
  borderRadius: 999,
  marginTop: 4,
  boxShadow: "0 0 0 3px rgba(148,163,184,0.08)",
};
const historyBody: React.CSSProperties = {
  display: "grid",
  gap: 3,
  color: "#cbd5e1",
  fontSize: 12,
};
const historyEmpty: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  border: "1px dashed rgba(148,163,184,0.18)",
  borderRadius: 9,
  padding: 10,
};

const actions: React.CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 16 };
const secondaryButton: React.CSSProperties = { background: "#0f172a", color: "#e5e7eb", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 10, padding: "10px 18px", cursor: "pointer" };
const primaryButton: React.CSSProperties = { background: "#2563eb", color: "#fff", border: "1px solid rgba(96,165,250,0.55)", borderRadius: 10, padding: "10px 18px", cursor: "pointer", fontWeight: 850 };
