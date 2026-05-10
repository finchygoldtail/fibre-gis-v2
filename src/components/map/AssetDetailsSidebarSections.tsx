import React, { useMemo, useState } from "react";
import { useAppMode } from "../../context/AppModeContext";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../firebase";
import type { ChamberDetails, DistributionPointDetails, PoleDetails, SavedMapAsset } from "./types";

type ConnectedHome = {
  port: number;
  homeId: string;
  homeName: string;
  status: string;
};

type Props = {
  assetType: string;
  poleDetails: PoleDetails;
  chamberDetails: ChamberDetails;
  dpDetails: DistributionPointDetails;
  onChangePoleDetails: (details: PoleDetails) => void;
  onChangeChamberDetails: (details: ChamberDetails) => void;
  onChangeDpDetails: (details: DistributionPointDetails) => void;
  connectedHomes?: ConnectedHome[];
  availableThroughCables?: SavedMapAsset[];
  allDistributionPoints?: SavedMapAsset[];
  allAssets?: SavedMapAsset[];
  currentDpId?: string | null;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadAssetFile(assetFolder: string, file: File) {
  const fileRef = ref(
    storage,
    `asset-uploads/${assetFolder}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(file.name)}`,
  );
  await uploadBytes(fileRef, file, { contentType: file.type || undefined });
  return getDownloadURL(fileRef);
}

function keepSavedUrls(values: string[] = []) {
  return values.filter((value) => value && !value.startsWith("blob:") && !value.startsWith("data:"));
}

function niceDocName(doc: string) {
  if (!doc.startsWith("http")) return doc;
  return decodeURIComponent(doc.split("/").pop()?.split("?")[0] || "Document");
}

const helpText: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.82rem",
  lineHeight: 1.35,
  marginTop: 4,
};

const miniGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const photoCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: 8,
};

const photoImg: React.CSSProperties = {
  width: "100%",
  height: 95,
  objectFit: "cover",
  borderRadius: 6,
  display: "block",
};

const docRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "7px 8px",
  marginTop: 6,
  fontSize: "0.85rem",
};


const modeBannerStyle = (
  activeMode: "survey" | "build" | "maintenance",
): React.CSSProperties => ({
  background:
    activeMode === "maintenance"
      ? "#7f1d1d"
      : activeMode === "build"
      ? "#1e3a8a"
      : "#14532d",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: 12,
  marginBottom: 16,
});

function WorkflowModeBanner({
  activeMode,
}: {
  activeMode: "survey" | "build" | "maintenance";
}) {
  return (
    <>
      <WorkflowModeBanner activeMode={activeMode} />
    <div style={modeBannerStyle(activeMode)}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
        Current Workflow Mode
      </div>

      <div style={{ fontWeight: 800, fontSize: 16 }}>
        {activeMode === "survey" && "Survey Mode"}
        {activeMode === "build" && "Build Mode"}
        {activeMode === "maintenance" && "Maintenance Mode"}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        {activeMode === "survey" && "Fast planning and survey workflow active."}
        {activeMode === "build" && "Operational build workflow active."}
        {activeMode === "maintenance" &&
          "Audit and maintenance traceability active."}
      </div>
    </div>
    </>
  );
}

export default function AssetDetailsSidebarSections({
  assetType,
  poleDetails,
  chamberDetails,
  dpDetails,
  onChangePoleDetails,
  onChangeChamberDetails,
  onChangeDpDetails,
  connectedHomes = [],
  availableThroughCables = [],
  allDistributionPoints = [],
  allAssets = [],
  currentDpId,
  inputStyle,
  labelStyle,
  secondaryButtonStyle,
}: Props) {
  const { activeMode } = useAppMode();
  const [uploading, setUploading] = useState(false);
  const [connectedHomesOpen, setConnectedHomesOpen] = useState(false);

  const updatePole = (key: keyof PoleDetails, value: any) => {
    onChangePoleDetails({ ...poleDetails, [key]: value });
  };

  const updateChamber = (key: keyof ChamberDetails, value: any) => {
    onChangeChamberDetails({ ...chamberDetails, [key]: value });
  };

  const updateDp = (key: keyof DistributionPointDetails | string, value: any) => {
    onChangeDpDetails({ ...(dpDetails as any), [key]: value } as DistributionPointDetails);
  };

  async function uploadPhotos(kind: "poles" | "chambers", files: FileList | null, max: number) {
    const current = keepSavedUrls(kind === "poles" ? poleDetails.photos || [] : chamberDetails.photos || []);
    const nextFiles = Array.from(files || []).slice(0, Math.max(0, max - current.length));
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(nextFiles.map((file) => uploadAssetFile(`${kind}/photos`, file)));
      if (kind === "poles") updatePole("photos", [...current, ...uploaded].slice(0, max));
      else updateChamber("photos", [...current, ...uploaded].slice(0, max));
    } finally {
      setUploading(false);
    }
  }

  async function uploadDocuments(kind: "poles" | "chambers", files: FileList | null) {
    const current = kind === "poles" ? poleDetails.documents || [] : chamberDetails.documents || [];
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(nextFiles.map((file) => uploadAssetFile(`${kind}/documents`, file)));
      if (kind === "poles") updatePole("documents", [...current, ...uploaded]);
      else updateChamber("documents", [...current, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function uploadDpImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAssetFile("distribution-points", file);
      updateDp("image", url);
    } finally {
      setUploading(false);
    }
  }

  const selectedCableId = dpDetails.afnDetails?.throughCableId || "";
  const selectedCable = availableThroughCables.find((cable) => cable.id === selectedCableId);
  const currentInputFibres = dpDetails.afnDetails?.inputFibres || [];

  const usedByOtherAfns = useMemo(() => {
    const used = new Set<number>();
    allDistributionPoints.forEach((asset) => {
      if (asset.id === currentDpId) return;
      const afn = asset.dpDetails?.afnDetails;
      if (!afn?.throughCableId || afn.throughCableId !== selectedCableId) return;
      (afn.inputFibres || []).forEach((fibre) => used.add(Number(fibre)));
    });
    allAssets.forEach((asset) => {
      if (asset.assetType !== "cable") return;
      if ((asset as any).parentCableId !== selectedCableId) return;
      ((asset as any).allocatedInputFibres || []).forEach((fibre: unknown) => {
        const fibreNumber = Number(fibre);
        if (Number.isFinite(fibreNumber)) used.add(fibreNumber);
      });
    });
    return used;
  }, [allDistributionPoints, allAssets, currentDpId, selectedCableId]);

  const fibreTotal = Number(String(selectedCable?.fibreCount || "48F").replace(/\D/g, "")) || 48;
  const dpCapacity = dpDetails.closureType === "AFN" ? currentInputFibres.length * 8 : Number(dpDetails.connectionsToHomes || 0);
  const dpUsed = connectedHomes.length;
  const dpAvailable = Math.max(0, dpCapacity - dpUsed);

  function updateAfnDetails(next: Partial<NonNullable<DistributionPointDetails["afnDetails"]>>) {
    const nextFibres = next.inputFibres || currentInputFibres;
    onChangeDpDetails({
      ...dpDetails,
      closureType: "AFN",
      connectionsToHomes: nextFibres.length * 8,
      afnDetails: {
        enabled: true,
        throughCableId: selectedCableId || undefined,
        inputFibres: nextFibres,
        fibreCountUsed: nextFibres.length,
        splitterRatio: "1:8",
        splitterOutputs: 8,
        ...dpDetails.afnDetails,
        ...next,
      },
    });
  }

  function toggleFibre(fibre: number) {
    const selectedHere = currentInputFibres.includes(fibre);
    if (selectedHere) {
      updateAfnDetails({ inputFibres: currentInputFibres.filter((item) => item !== fibre) });
      return;
    }
    if (currentInputFibres.length >= 4 || usedByOtherAfns.has(fibre)) return;
    updateAfnDetails({ inputFibres: [...currentInputFibres, fibre].sort((a, b) => a - b) });
  }

  if (assetType === "pole") {
    const photos = keepSavedUrls(poleDetails.photos || []);
    const documents = poleDetails.documents || [];
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Pole Details</div>

        <div style={labelStyle}>Pole Type</div>
        <select value={poleDetails.poleType || "new"} onChange={(e) => updatePole("poleType", e.target.value)} style={inputStyle}>
          <option value="new">New Pole</option>
          <option value="or">OR Pole</option>
        </select>

        <div style={labelStyle}>Size</div>
        <input value={poleDetails.size || ""} onChange={(e) => updatePole("size", e.target.value)} style={inputStyle} />

        <div style={labelStyle}>Year</div>
        <input value={poleDetails.year || ""} onChange={(e) => updatePole("year", e.target.value)} style={inputStyle} />

        <div style={labelStyle}>Special Markings</div>
        <input value={poleDetails.specialMarkings || ""} onChange={(e) => updatePole("specialMarkings", e.target.value)} style={inputStyle} />

        <div style={labelStyle}>Test Date</div>
        <input type="date" value={poleDetails.testDate || ""} onChange={(e) => updatePole("testDate", e.target.value)} style={inputStyle} />

        <div style={labelStyle}>Location</div>
        <select value={poleDetails.locationType || "Kerbside"} onChange={(e) => updatePole("locationType", e.target.value)} style={inputStyle}>
          <option>Kerbside</option>
          <option>House Boundary</option>
        </select>

        <div style={labelStyle}>Photos (max 4)</div>
        <input type="file" accept="image/*" multiple disabled={uploading} onChange={(e) => uploadPhotos("poles", e.target.files, 4)} style={inputStyle} />
        {photos.length > 0 ? <div style={miniGrid}>{photos.map((photo, index) => <div key={photo} style={photoCard}><img src={photo} style={photoImg} /><button type="button" onClick={() => updatePole("photos", photos.filter((_, i) => i !== index))} style={{ ...secondaryButtonStyle, width: "100%", marginTop: 6 }}>Remove</button></div>)}</div> : null}

        <div style={labelStyle}>Documents</div>
        <input type="file" multiple disabled={uploading} onChange={(e) => uploadDocuments("poles", e.target.files)} style={inputStyle} />
        {documents.map((doc, index) => <div key={`${doc}-${index}`} style={docRow}><span>{niceDocName(doc)}</span><button type="button" onClick={() => updatePole("documents", documents.filter((_, i) => i !== index))} style={secondaryButtonStyle}>Remove</button></div>)}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  if (assetType === "chamber") {
    const photos = keepSavedUrls(chamberDetails.photos || []);
    const documents = chamberDetails.documents || [];
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Chamber Details</div>

        <div style={labelStyle}>Chamber Type</div>
        <select value={chamberDetails.chamberType || "fw2"} onChange={(e) => updateChamber("chamberType", e.target.value)} style={inputStyle}>
          <option value="fw2">FW2</option><option value="fw4">FW4</option><option value="fw6">FW6</option><option value="fw10">FW10</option>
        </select>

        <div style={labelStyle}>Size</div>
        <input value={chamberDetails.size || ""} onChange={(e) => updateChamber("size", e.target.value)} placeholder="600x450" style={inputStyle} />

        <div style={labelStyle}>Depth</div>
        <input value={chamberDetails.depth || ""} onChange={(e) => updateChamber("depth", e.target.value)} placeholder="750mm" style={inputStyle} />

        <div style={labelStyle}>Lid Type</div>
        <input value={chamberDetails.lidType || ""} onChange={(e) => updateChamber("lidType", e.target.value)} placeholder="Single / Double / Composite" style={inputStyle} />

        <div style={labelStyle}>Condition</div>
        <input value={chamberDetails.condition || ""} onChange={(e) => updateChamber("condition", e.target.value)} placeholder="Good / Damaged / Flooded" style={inputStyle} />

        <div style={labelStyle}>Connected Ducts</div>
        <input value={chamberDetails.connectedDucts || ""} onChange={(e) => updateChamber("connectedDucts", e.target.value)} placeholder="2 in / 2 out" style={inputStyle} />

        <div style={labelStyle}>Photos (max 6)</div>
        <input type="file" accept="image/*" multiple disabled={uploading} onChange={(e) => uploadPhotos("chambers", e.target.files, 6)} style={inputStyle} />
        {photos.length > 0 ? <div style={miniGrid}>{photos.map((photo, index) => <div key={photo} style={photoCard}><img src={photo} style={photoImg} /><button type="button" onClick={() => updateChamber("photos", photos.filter((_, i) => i !== index))} style={{ ...secondaryButtonStyle, width: "100%", marginTop: 6 }}>Remove</button></div>)}</div> : null}

        <div style={labelStyle}>Documents</div>
        <input type="file" multiple disabled={uploading} onChange={(e) => uploadDocuments("chambers", e.target.files)} style={inputStyle} />
        {documents.map((doc, index) => <div key={`${doc}-${index}`} style={docRow}><span>{niceDocName(doc)}</span><button type="button" onClick={() => updateChamber("documents", documents.filter((_, i) => i !== index))} style={secondaryButtonStyle}>Remove</button></div>)}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  if (assetType === "distribution-point") {
    const previewImage = String((dpDetails as any).image || "");
    return (
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #334155" }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Distribution Point Details</div>

        <div style={labelStyle}>Build Status</div>
        <select value={dpDetails.buildStatus || "planned"} onChange={(e) => updateDp("buildStatus", e.target.value)} style={inputStyle}>
          <option value="planned">Planned</option><option value="built">Built</option><option value="tested">Tested</option><option value="live">Live</option><option value="blocked">Blocked</option>
        </select>

        <div style={labelStyle}>Closure Type</div>
        <select value={dpDetails.closureType || "CBT"} onChange={(e) => {
          const closureType = e.target.value as "CBT" | "AFN";
          if (closureType === "AFN") updateAfnDetails({ inputFibres: [] });
          else onChangeDpDetails({ ...dpDetails, closureType: "CBT", afnDetails: undefined, connectionsToHomes: dpDetails.connectionsToHomes || 8 });
        }} style={inputStyle}>
          <option value="CBT">CBT</option><option value="AFN">AFN</option>
        </select>

        {dpDetails.closureType === "AFN" ? <>
          <div style={helpText}>AFN uses selected input fibres from a through cable. Each selected fibre gives 8 outputs.</div>
          <div style={labelStyle}>Through Cable</div>
          <select value={selectedCableId} onChange={(e) => updateAfnDetails({ throughCableId: e.target.value || undefined, inputFibres: [], fibreCountUsed: 0 })} style={inputStyle}>
            <option value="">Select through cable</option>
            {availableThroughCables.map((cable) => <option key={cable.id} value={cable.id}>{cable.name || cable.id} — {cable.fibreCount || "48F"}</option>)}
          </select>
          {selectedCableId ? <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 5, marginTop: 8, maxHeight: 185, overflowY: "auto" }}>
            {Array.from({ length: fibreTotal }, (_, index) => {
              const fibre = index + 1;
              const selectedHere = currentInputFibres.includes(fibre);
              const usedElsewhere = usedByOtherAfns.has(fibre);
              return <button key={fibre} type="button" disabled={usedElsewhere && !selectedHere} onClick={() => toggleFibre(fibre)} style={{ ...secondaryButtonStyle, padding: "5px 4px", background: selectedHere ? "#2563eb" : usedElsewhere ? "#374151" : "#111827", opacity: usedElsewhere && !selectedHere ? 0.45 : 1 }}>F{fibre}</button>;
            })}
          </div> : null}
          <div style={helpText}>Fibres selected: {currentInputFibres.join(", ") || "none"}<br />Splitter: 1:8 / {currentInputFibres.length * 8} outputs</div>
        </> : null}

        <div style={labelStyle}>Connections to Homes</div>
        <select value={dpDetails.closureType === "AFN" ? dpCapacity : dpDetails.connectionsToHomes || 8} disabled={dpDetails.closureType === "AFN"} onChange={(e) => updateDp("connectionsToHomes", Number(e.target.value))} style={inputStyle}>
          <option value={8}>8</option><option value={16}>16</option><option value={24}>24</option><option value={32}>32</option>
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
          {[ ["Capacity", dpCapacity], ["Used", dpUsed], ["Available", dpAvailable] ].map(([title, value]) => <div key={String(title)} style={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, padding: 8, textAlign: "center" }}><strong>{value}</strong><br /><span style={{ color: "#9ca3af", fontSize: "0.78rem" }}>{title}</span></div>)}
        </div>

        <div style={labelStyle}>Connected Homes</div>
        <button type="button" onClick={() => setConnectedHomesOpen((open) => !open)} style={{ ...secondaryButtonStyle, width: "100%" }}>{dpUsed} connected / {dpCapacity || 0} capacity {connectedHomesOpen ? "▲" : "▼"}</button>
        {connectedHomesOpen ? <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          {connectedHomes.length === 0 ? <div style={helpText}>No homes connected yet</div> : connectedHomes.map((home) => <div key={`${home.homeId}-${home.port}`} style={docRow}><span><strong>Port {home.port}</strong><br />{home.homeName}</span><em>{home.status}</em></div>)}
        </div> : null}

        <div style={labelStyle}>Power Readings</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => <input key={i} value={dpDetails.powerReadings?.[i] || ""} onChange={(e) => {
            const readings = [...(dpDetails.powerReadings || ["", "", "", ""])] as string[];
            readings[i] = e.target.value;
            updateDp("powerReadings", readings);
          }} style={inputStyle} />)}
        </div>

        <div style={labelStyle}>Image</div>
        <input type="file" accept="image/*" disabled={uploading} onChange={(e) => uploadDpImage(e.target.files?.[0] || null)} style={inputStyle} />
        {previewImage ? <div style={{ ...photoCard, marginTop: 8 }}><img src={previewImage} style={photoImg} /><button type="button" onClick={() => updateDp("image", "")} style={{ ...secondaryButtonStyle, width: "100%", marginTop: 6 }}>Remove Image</button></div> : null}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  return null;
}
