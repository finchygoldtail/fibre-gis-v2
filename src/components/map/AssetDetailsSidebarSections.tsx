import React, { useMemo, useState } from "react";
import { useAppMode } from "../../context/AppModeContext";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../firebase";
import type {
  ChamberDetails,
  DistributionPointDetails,
  PoleDetails,
  SavedMapAsset,
} from "./types";
import {
  applyDpFibrePlanToDetails,
  buildDpFibrePlan,
  getArchitectureConsistencyWarnings,
} from "../../services/dpArchitecturePlanner";
import {
  allocateDpFibresForPlan,
  rebuildThroughCableReservations,
  type RebuildThroughCableReservationResult,
} from "../../services/dpFibreAutoAllocator";

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
  onRebuildThroughCableReservations?: (
    result: RebuildThroughCableReservationResult,
  ) => void;
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
  return values.filter(
    (value) =>
      value && !value.startsWith("blob:") && !value.startsWith("data:"),
  );
}

function niceDocName(doc: string) {
  if (!doc.startsWith("http")) return doc;
  return decodeURIComponent(doc.split("/").pop()?.split("?")[0] || "Document");
}

function normaliseCableLabel(value: unknown): string {
  return String(value || "").trim();
}

function fibreNumber(value: unknown): number {
  return Number(String(value || "").replace(/\D/g, "")) || 0;
}

function isThroughCableOption(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const assetType = String(item.assetType || "").toLowerCase();
  const cableType = String(item.cableType || "").toLowerCase();
  const name = String(item.name || item.cableId || item.id || "").toLowerCase();

  if (item.geometry?.type !== "LineString") return false;
  if (assetType && assetType !== "cable") return false;

  // Drops are end-customer cables and must not appear as AFN through-cables.
  if (cableType.includes("drop") || name.includes("drop")) return false;

  // Keep this deliberately broad: through-cables may be Feeder, Link, Spine,
  // Distribution, ULW, OH, or older saved records with only a fibre count.
  return (
    cableType.includes("feeder") ||
    cableType.includes("link") ||
    cableType.includes("spine") ||
    cableType.includes("distribution") ||
    cableType.includes("ulw") ||
    String(item.installMethod || "").toLowerCase() === "oh" ||
    fibreNumber(item.fibreCount) >= 12
  );
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
  onRebuildThroughCableReservations,
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

  const updateDp = (
    key: keyof DistributionPointDetails | string,
    value: any,
  ) => {
    onChangeDpDetails({
      ...(dpDetails as any),
      [key]: value,
    } as DistributionPointDetails);
  };

  async function uploadPhotos(
    kind: "poles" | "chambers",
    files: FileList | null,
    max: number,
  ) {
    const current = keepSavedUrls(
      kind === "poles" ? poleDetails.photos || [] : chamberDetails.photos || [],
    );
    const nextFiles = Array.from(files || []).slice(
      0,
      Math.max(0, max - current.length),
    );
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        nextFiles.map((file) => uploadAssetFile(`${kind}/photos`, file)),
      );
      if (kind === "poles")
        updatePole("photos", [...current, ...uploaded].slice(0, max));
      else updateChamber("photos", [...current, ...uploaded].slice(0, max));
    } finally {
      setUploading(false);
    }
  }

  async function uploadDocuments(
    kind: "poles" | "chambers",
    files: FileList | null,
  ) {
    const current =
      kind === "poles"
        ? poleDetails.documents || []
        : chamberDetails.documents || [];
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        nextFiles.map((file) => uploadAssetFile(`${kind}/documents`, file)),
      );
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

  const selectedCableId =
    dpDetails.afnDetails?.throughCableId ||
    dpDetails.mduDetails?.throughCableId ||
    "";

  const afnThroughCableOptions = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    [
      ...availableThroughCables,
      ...allAssets.filter(isThroughCableOption),
    ].forEach((cable) => {
      if (!cable?.id || cable.id === currentDpId) return;
      byId.set(cable.id, cable);
    });

    return Array.from(byId.values()).sort((a, b) => {
      const aName = normaliseCableLabel(
        (a as any).name || (a as any).cableId || a.id,
      );
      const bName = normaliseCableLabel(
        (b as any).name || (b as any).cableId || b.id,
      );
      return aName.localeCompare(bName, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [availableThroughCables, allAssets, currentDpId]);

  const selectedCable = afnThroughCableOptions.find(
    (cable) => cable.id === selectedCableId,
  );
  const currentInputFibres =
    dpDetails.afnDetails?.inputFibres ||
    dpDetails.mduDetails?.inputFibres ||
    [];

  const usedByOtherReservations = useMemo(() => {
    const used = new Set<number>();
    allDistributionPoints.forEach((asset) => {
      if (asset.id === currentDpId) return;
      const afn = asset.dpDetails?.afnDetails;
      const mdu = asset.dpDetails?.mduDetails;
      const throughCableId = afn?.throughCableId || mdu?.throughCableId || "";
      if (!throughCableId || throughCableId !== selectedCableId) return;
      [...(afn?.inputFibres || []), ...(mdu?.inputFibres || [])].forEach(
        (fibre) => used.add(Number(fibre)),
      );
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

  const fibreTotal =
    Number(String(selectedCable?.fibreCount || "48F").replace(/\D/g, "")) || 48;
  const dpCapacity =
    dpDetails.closureType === "AFN"
      ? Number(
          dpDetails.autoFibrePlan?.capacity || currentInputFibres.length * 8,
        )
      : dpDetails.closureType === "MDU" || dpDetails.closureType === "MDU_SPLITTER"
        ? Number(
            dpDetails.autoFibrePlan?.capacity ||
              dpDetails.connectionsToHomes ||
              connectedHomes.length ||
              0,
          )
        : Number(
            dpDetails.connectionsToHomes ||
              dpDetails.autoFibrePlan?.capacity ||
              0,
          );
  const dpUsed = connectedHomes.length;
  const dpAvailable = Math.max(0, dpCapacity - dpUsed);

  const dpAutoFibrePlan = useMemo(
    () =>
      buildDpFibrePlan({
        closureType: dpDetails.closureType || "CBT",
        connectedHomes: dpUsed,
        currentInputFibres,
        mduFibres: dpDetails.mduDetails?.mduFibres,
        mduSplitterFibres: dpDetails.mduDetails?.splitterFibres,
      }),
    [
      dpDetails.closureType,
      dpDetails.mduDetails?.mduFibres,
      dpDetails.mduDetails?.splitterFibres,
      dpUsed,
      currentInputFibres,
    ],
  );

  const architectureWarnings = useMemo(
    () =>
      getArchitectureConsistencyWarnings({
        currentDpId,
        currentClosureType: dpDetails.closureType || "CBT",
        currentThroughCableId:
          selectedCableId || dpDetails.mduDetails?.throughCableId || null,
        allDistributionPoints,
      }),
    [
      currentDpId,
      dpDetails.closureType,
      dpDetails.mduDetails?.throughCableId,
      selectedCableId,
      allDistributionPoints,
    ],
  );

  const suggestedFibreAllocation = useMemo(() => {
    if (dpAutoFibrePlan.architecture === "CBT") return null;

    return allocateDpFibresForPlan({
      currentDpId,
      currentClosureType: dpDetails.closureType,
      currentDpDetails: dpDetails,
      connectedHomes: dpUsed,
      plan: dpAutoFibrePlan,
      selectedThroughCableId:
        selectedCableId || dpDetails.mduDetails?.throughCableId || null,
      availableThroughCables,
      allDistributionPoints,
      allAssets,
    });
  }, [
    allAssets,
    allDistributionPoints,
    availableThroughCables,
    currentDpId,
    dpAutoFibrePlan,
    dpDetails,
    dpUsed,
    selectedCableId,
  ]);

  function applyAutoFibrePlan() {
    const allocation = suggestedFibreAllocation || undefined;
    onChangeDpDetails(
      applyDpFibrePlanToDetails(
        dpDetails,
        dpAutoFibrePlan,
        allocation || undefined,
      ),
    );
  }

  function rebuildSelectedThroughCableChain() {
    const throughCableId =
      selectedCableId ||
      dpDetails.mduDetails?.throughCableId ||
      suggestedFibreAllocation?.throughCableId ||
      "";

    const result = rebuildThroughCableReservations({
      throughCableId,
      currentDpId,
      currentDpDetails: dpDetails,
      currentPlan: dpAutoFibrePlan,
      connectedHomes: dpUsed,
      availableThroughCables,
      allDistributionPoints,
      allAssets,
    });

    if (result.warnings.length) {
      alert(result.warnings.join("\n"));
    }

    if (!result.updates.length) return;

    const currentUpdate = result.updates.find(
      (update) => String(update.assetId) === String(currentDpId || ""),
    );

    if (currentUpdate?.dpDetails) {
      onChangeDpDetails(currentUpdate.dpDetails as DistributionPointDetails);
    }

    onRebuildThroughCableReservations?.(result);
  }

  function updateAfnDetails(
    next: Partial<NonNullable<DistributionPointDetails["afnDetails"]>>,
  ) {
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
      updateAfnDetails({
        inputFibres: currentInputFibres.filter((item) => item !== fibre),
      });
      return;
    }
    if (currentInputFibres.length >= 24 || usedByOtherReservations.has(fibre))
      return;
    updateAfnDetails({
      inputFibres: [...currentInputFibres, fibre].sort((a, b) => a - b),
    });
  }

  if (assetType === "pole") {
    const photos = keepSavedUrls(poleDetails.photos || []);
    const documents = poleDetails.documents || [];
    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #334155",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Pole Details</div>

        <div style={labelStyle}>Pole Type</div>
        <select
          value={poleDetails.poleType || "new"}
          onChange={(e) => updatePole("poleType", e.target.value)}
          style={inputStyle}
        >
          <option value="new">New Pole</option>
          <option value="or">OR Pole</option>
        </select>

        <div style={labelStyle}>Size</div>
        <input
          value={poleDetails.size || ""}
          onChange={(e) => updatePole("size", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Year</div>
        <input
          value={poleDetails.year || ""}
          onChange={(e) => updatePole("year", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Special Markings</div>
        <input
          value={poleDetails.specialMarkings || ""}
          onChange={(e) => updatePole("specialMarkings", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Test Date</div>
        <input
          type="date"
          value={poleDetails.testDate || ""}
          onChange={(e) => updatePole("testDate", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Location</div>
        <select
          value={poleDetails.locationType || "Kerbside"}
          onChange={(e) => updatePole("locationType", e.target.value)}
          style={inputStyle}
        >
          <option>Kerbside</option>
          <option>House Boundary</option>
        </select>

        <div style={labelStyle}>Photos (max 4)</div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => uploadPhotos("poles", e.target.files, 4)}
          style={inputStyle}
        />
        {photos.length > 0 ? (
          <div style={miniGrid}>
            {photos.map((photo, index) => (
              <div key={photo} style={photoCard}>
                <img src={photo} style={photoImg} />
                <button
                  type="button"
                  onClick={() =>
                    updatePole(
                      "photos",
                      photos.filter((_, i) => i !== index),
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    width: "100%",
                    marginTop: 6,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={labelStyle}>Documents</div>
        <input
          type="file"
          multiple
          disabled={uploading}
          onChange={(e) => uploadDocuments("poles", e.target.files)}
          style={inputStyle}
        />
        {documents.map((doc, index) => (
          <div key={`${doc}-${index}`} style={docRow}>
            <span>{niceDocName(doc)}</span>
            <button
              type="button"
              onClick={() =>
                updatePole(
                  "documents",
                  documents.filter((_, i) => i !== index),
                )
              }
              style={secondaryButtonStyle}
            >
              Remove
            </button>
          </div>
        ))}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  if (assetType === "chamber") {
    const photos = keepSavedUrls(chamberDetails.photos || []);
    const documents = chamberDetails.documents || [];
    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #334155",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Chamber Details</div>

        <div style={labelStyle}>Chamber Type</div>
        <select
          value={chamberDetails.chamberType || "fw2"}
          onChange={(e) => updateChamber("chamberType", e.target.value)}
          style={inputStyle}
        >
          <option value="fw2">FW2</option>
          <option value="fw4">FW4</option>
          <option value="fw6">FW6</option>
          <option value="fw10">FW10</option>
        </select>

        <div style={labelStyle}>Size</div>
        <input
          value={chamberDetails.size || ""}
          onChange={(e) => updateChamber("size", e.target.value)}
          placeholder="600x450"
          style={inputStyle}
        />

        <div style={labelStyle}>Depth</div>
        <input
          value={chamberDetails.depth || ""}
          onChange={(e) => updateChamber("depth", e.target.value)}
          placeholder="750mm"
          style={inputStyle}
        />

        <div style={labelStyle}>Lid Type</div>
        <input
          value={chamberDetails.lidType || ""}
          onChange={(e) => updateChamber("lidType", e.target.value)}
          placeholder="Single / Double / Composite"
          style={inputStyle}
        />

        <div style={labelStyle}>Condition</div>
        <input
          value={chamberDetails.condition || ""}
          onChange={(e) => updateChamber("condition", e.target.value)}
          placeholder="Good / Damaged / Flooded"
          style={inputStyle}
        />

        <div style={labelStyle}>Connected Ducts</div>
        <input
          value={chamberDetails.connectedDucts || ""}
          onChange={(e) => updateChamber("connectedDucts", e.target.value)}
          placeholder="2 in / 2 out"
          style={inputStyle}
        />

        <div style={labelStyle}>Photos (max 6)</div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => uploadPhotos("chambers", e.target.files, 6)}
          style={inputStyle}
        />
        {photos.length > 0 ? (
          <div style={miniGrid}>
            {photos.map((photo, index) => (
              <div key={photo} style={photoCard}>
                <img src={photo} style={photoImg} />
                <button
                  type="button"
                  onClick={() =>
                    updateChamber(
                      "photos",
                      photos.filter((_, i) => i !== index),
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    width: "100%",
                    marginTop: 6,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={labelStyle}>Documents</div>
        <input
          type="file"
          multiple
          disabled={uploading}
          onChange={(e) => uploadDocuments("chambers", e.target.files)}
          style={inputStyle}
        />
        {documents.map((doc, index) => (
          <div key={`${doc}-${index}`} style={docRow}>
            <span>{niceDocName(doc)}</span>
            <button
              type="button"
              onClick={() =>
                updateChamber(
                  "documents",
                  documents.filter((_, i) => i !== index),
                )
              }
              style={secondaryButtonStyle}
            >
              Remove
            </button>
          </div>
        ))}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  if (assetType === "distribution-point") {
    const previewImage = String((dpDetails as any).image || "");
    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #334155",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          Distribution Point Details
        </div>

        <div style={labelStyle}>Build Status</div>
        <select
          value={dpDetails.buildStatus || "planned"}
          onChange={(e) => updateDp("buildStatus", e.target.value)}
          style={inputStyle}
        >
          <option value="planned">Planned</option>
          <option value="built">Built</option>
          <option value="tested">Tested</option>
          <option value="live">Live</option>
          <option value="blocked">Blocked</option>
        </select>

        <div style={labelStyle}>Closure Type</div>

        <select
          value={dpDetails.closureType || "CBT"}
          onChange={(e) => {
            const closureType = e.target.value as
              | "CBT"
              | "AFN"
              | "MDU"
              | "MDU_SPLITTER";

            if (closureType === "AFN") {
              updateAfnDetails({ inputFibres: [] });
              return;
            }

            onChangeDpDetails({
              ...dpDetails,
              closureType,

              afnDetails:
                closureType === "CBT" ? undefined : dpDetails.afnDetails,

              mduDetails:
                closureType === "MDU" || closureType === "MDU_SPLITTER"
                  ? dpDetails.mduDetails || {
                      enabled: true,
                      throughCableId: undefined,
                      mduFibres: 6,
                      splitterFibres: closureType === "MDU_SPLITTER" ? 2 : 0,
                      totalReservedFibres:
                        closureType === "MDU_SPLITTER" ? 8 : 6,
                      inputFibres: [],
                    }
                  : undefined,

              connectionsToHomes:
                closureType === "MDU_SPLITTER"
                  ? 16
                  : dpDetails.connectionsToHomes || 8,
            });
          }}
          style={inputStyle}
        >
          <option value="CBT">CBT</option>
          <option value="AFN">AFN</option>
          <option value="MDU">MDU Direct Feed</option>
          <option value="MDU_SPLITTER">MDU + Splitter</option>
        </select>

        <div style={labelStyle}>DP Role</div>
        <select
          value={(dpDetails as any).dpRole || "serving"}
          onChange={(e) => updateDp("dpRole", e.target.value)}
          style={inputStyle}
        >
          <option value="serving">Serving DP</option>
          <option value="splice_only">Splice-only / passthrough</option>
        </select>
        <div style={helpText}>
          Use <strong>Serving DP</strong> for AFNs/CBTs/MDUs that feed customers.
          Use <strong>Splice-only / passthrough</strong> for pole-top AFNs that
          are only splicing fibres through the route. Splice-only DPs stay in
          the topology but are ignored by the SB fibre allocation matcher.
        </div>

        <div
          style={{
            marginTop: 10,
            padding: 10,
            border: `1px solid ${dpAutoFibrePlan.status === "error" ? "#dc2626" : dpAutoFibrePlan.status === "warning" ? "#f59e0b" : "#334155"}`,
            borderRadius: 10,
            background: "#020617",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 900, color: "#e5e7eb" }}>
                Auto Fibre Plan — {dpAutoFibrePlan.architecture}
              </div>
              <div style={helpText}>
                Closure architecture stays locked. This planner will not mix
                CBTs and AFNs on the same network leg.
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={applyAutoFibrePlan}
                style={{
                  ...secondaryButtonStyle,
                  whiteSpace: "nowrap",
                  background: "#2563eb",
                  color: "white",
                }}
              >
                Apply Plan
              </button>
              {dpAutoFibrePlan.architecture !== "CBT" ? (
                <button
                  type="button"
                  onClick={rebuildSelectedThroughCableChain}
                  title="Recalculate every AFN / MDU reservation on this selected through cable from the end of the run backwards."
                  style={{
                    ...secondaryButtonStyle,
                    whiteSpace: "nowrap",
                    background: "#16a34a",
                    color: "white",
                  }}
                >
                  Rebuild Chain
                </button>
              ) : null}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 6,
              marginTop: 10,
            }}
          >
            {[
              ["Homes", dpAutoFibrePlan.connectedHomes],
              ["Capacity", dpAutoFibrePlan.capacity],
              ["Input Fibres", dpAutoFibrePlan.requiredInputFibres],
              ["Available", dpAutoFibrePlan.availableOutputs],
            ].map(([title, value]) => (
              <div
                key={String(title)}
                style={{
                  background: "#111827",
                  border: "1px solid #334155",
                  borderRadius: 8,
                  padding: 7,
                  textAlign: "center",
                }}
              >
                <strong>{value}</strong>
                <br />
                <span style={{ color: "#9ca3af", fontSize: "0.72rem" }}>
                  {title}
                </span>
              </div>
            ))}
          </div>

          <div style={{ ...helpText, marginTop: 8 }}>
            {dpAutoFibrePlan.title}
          </div>

          {suggestedFibreAllocation ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ ...helpText, marginBottom: 6, color: "#bfdbfe" }}>
                Allocation explanation — fibre 1 starts at the end of the run.
                Branches reserve only downstream AFN/MDU demand, not the full
                branch cable size.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: 6,
                }}
              >
                {(suggestedFibreAllocation.explanationRows || []).map((row) => (
                  <div
                    key={row.label}
                    title={row.help}
                    style={{
                      background: "#111827",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      padding: 8,
                    }}
                  >
                    <div
                      style={{
                        color: "#9ca3af",
                        fontSize: "0.72rem",
                        marginBottom: 3,
                      }}
                    >
                      {row.label}
                    </div>
                    <strong style={{ color: "#e5e7eb" }}>{row.value}</strong>
                  </div>
                ))}
              </div>

              <div style={{ ...helpText, marginTop: 8 }}>
                Parent utilisation after this allocation:{" "}
                <strong>{suggestedFibreAllocation.utilisationPercent}%</strong>
                {" · "}
                Duplicate fibres:{" "}
                <strong>
                  {suggestedFibreAllocation.duplicateFibres?.join(", ") ||
                    "none"}
                </strong>
              </div>

              {(suggestedFibreAllocation.traceRows || []).length ? (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontWeight: 900,
                      color: "#e5e7eb",
                      marginBottom: 6,
                    }}
                  >
                    Allocation trace
                  </div>
                  {(suggestedFibreAllocation.traceRows || [])
                    .slice(0, 8)
                    .map((row, index) => (
                      <div
                        key={`${row.assetId || row.assetName}-${row.cableId || row.cableName}-${index}`}
                        style={{
                          background: "#0f172a",
                          border: "1px solid #334155",
                          borderRadius: 8,
                          padding: 8,
                          marginTop: 5,
                          fontSize: "0.76rem",
                          color: "#cbd5e1",
                          lineHeight: 1.35,
                        }}
                      >
                        <strong>{row.assetName}</strong> on {row.cableName}
                        <br />
                        Local {row.localFibres} + branch {row.branchFibres} ={" "}
                        <strong>{row.totalFibres}</strong> fibre(s)
                        <br />
                        <span style={{ color: "#9ca3af" }}>{row.note}</span>
                      </div>
                    ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {[
            ...dpAutoFibrePlan.warnings,
            ...architectureWarnings,
            ...(suggestedFibreAllocation?.warnings || []),
            ...(suggestedFibreAllocation?.conflictingReservations || []),
          ].map((warning) => (
            <div
              key={warning}
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 8,
                background: "rgba(127,29,29,0.35)",
                border: "1px solid rgba(248,113,113,0.45)",
                color: "#fecaca",
                fontSize: "0.78rem",
                lineHeight: 1.35,
              }}
            >
              {warning}
            </div>
          ))}

          {(suggestedFibreAllocation?.branchNotes || [])
            .slice(0, 4)
            .map((note) => (
              <div key={note} style={{ ...helpText, marginTop: 6 }}>
                • {note}
              </div>
            ))}
        </div>

        {dpDetails.closureType === "AFN" ? (
          <>
            <div style={helpText}>
              AFN uses selected input fibres from a through cable. Each selected
              fibre gives 8 outputs.
            </div>
            <div style={labelStyle}>Through Cable</div>
            <select
              value={selectedCableId}
              onChange={(e) =>
                updateAfnDetails({
                  throughCableId: e.target.value || undefined,
                  inputFibres: [],
                  fibreCountUsed: 0,
                })
              }
              style={inputStyle}
            >
              <option value="">Select through cable</option>
              {afnThroughCableOptions.map((cable) => (
                <option key={cable.id} value={cable.id}>
                  {(cable as any).name || (cable as any).cableId || cable.id} —{" "}
                  {(cable as any).fibreCount || "48F"}
                </option>
              ))}
            </select>
            {selectedCableId ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                  gap: 5,
                  marginTop: 8,
                  maxHeight: 185,
                  overflowY: "auto",
                }}
              >
                {Array.from({ length: fibreTotal }, (_, index) => {
                  const fibre = index + 1;
                  const selectedHere = currentInputFibres.includes(fibre);
                  const usedElsewhere = usedByOtherReservations.has(fibre);
                  return (
                    <button
                      key={fibre}
                      type="button"
                      disabled={usedElsewhere && !selectedHere}
                      onClick={() => toggleFibre(fibre)}
                      style={{
                        ...secondaryButtonStyle,
                        padding: "5px 4px",
                        background: selectedHere
                          ? "#2563eb"
                          : usedElsewhere
                            ? "#374151"
                            : "#111827",
                        opacity: usedElsewhere && !selectedHere ? 0.45 : 1,
                      }}
                    >
                      F{fibre}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div style={helpText}>
              Fibres selected: {currentInputFibres.join(", ") || "none"}
              <br />
              Splitter: 1:8 / {currentInputFibres.length * 8} outputs
            </div>
          </>
        ) : null}
        {dpDetails.closureType === "MDU" ||
        dpDetails.closureType === "MDU_SPLITTER" ? (
          <>
            <div style={helpText}>
              MDU fibre reservation from parent cable. Flats are counted as
              internal building outputs and do not each reserve a separate spine fibre.
            </div>

            <div style={labelStyle}>Through Cable</div>

            <select
              value={dpDetails.mduDetails?.throughCableId || ""}
              onChange={(e) => {
                onChangeDpDetails({
                  ...dpDetails,
                  mduDetails: {
                    ...(dpDetails.mduDetails || {}),
                    enabled: true,
                    throughCableId: e.target.value,
                    mduFibres: dpDetails.mduDetails?.mduFibres || 6,
                    splitterFibres: dpDetails.mduDetails?.splitterFibres || 0,
                    totalReservedFibres:
                      (dpDetails.mduDetails?.mduFibres || 6) +
                      (dpDetails.mduDetails?.splitterFibres || 0),
                    inputFibres: [],
                  },
                });
              }}
              style={inputStyle}
            >
              <option value="">Select through cable</option>

              {afnThroughCableOptions.map((cable) => (
                <option key={cable.id} value={cable.id}>
                  {(cable as any).name || (cable as any).cableId || cable.id}
                  {" — "}
                  {(cable as any).fibreCount || "48F"}
                </option>
              ))}
            </select>

            <div style={labelStyle}>MDU Fibres</div>

            <input
              type="number"
              min={1}
              max={24}
              value={dpDetails.mduDetails?.mduFibres || 6}
              onChange={(e) => {
                const mduFibres = Number(e.target.value);

                const splitterFibres =
                  dpDetails.mduDetails?.splitterFibres || 0;

                onChangeDpDetails({
                  ...dpDetails,
                  mduDetails: {
                    ...(dpDetails.mduDetails || {}),
                    enabled: true,
                    mduFibres,
                    splitterFibres,
                    totalReservedFibres: mduFibres + splitterFibres,
                    inputFibres: dpDetails.mduDetails?.inputFibres || [],
                  },
                });
              }}
              style={inputStyle}
            />

            {dpDetails.closureType === "MDU_SPLITTER" ? (
              <>
                <div style={labelStyle}>Splitter Fibres</div>

                <input
                  type="number"
                  min={0}
                  max={12}
                  value={dpDetails.mduDetails?.splitterFibres || 2}
                  onChange={(e) => {
                    const splitterFibres = Number(e.target.value);

                    const mduFibres = dpDetails.mduDetails?.mduFibres || 6;

                    onChangeDpDetails({
                      ...dpDetails,
                      mduDetails: {
                        ...(dpDetails.mduDetails || {}),
                        enabled: true,
                        splitterFibres,
                        mduFibres,
                        totalReservedFibres: splitterFibres + mduFibres,
                        inputFibres: dpDetails.mduDetails?.inputFibres || [],
                      },
                    });
                  }}
                  style={inputStyle}
                />
              </>
            ) : null}

            <div style={helpText}>
              Reserved spine fibres:{" "}
              <strong>
                {dpDetails.autoFibrePlan?.reservedFibres ||
                  dpDetails.mduDetails?.totalReservedFibres ||
                  ((dpDetails.mduDetails?.mduFibres || 6) +
                    (dpDetails.closureType === "MDU_SPLITTER"
                      ? dpDetails.mduDetails?.splitterFibres || 2
                      : 0))}
              </strong>
              <br />
              Internal flats connected: <strong>{dpUsed}</strong>
            </div>
          </>
        ) : null}

        <div style={labelStyle}>Connections to Homes</div>
        <select
          value={
            dpDetails.closureType === "AFN"
              ? dpCapacity
              : dpDetails.connectionsToHomes || 8
          }
          disabled={dpDetails.closureType === "AFN"}
          onChange={(e) =>
            updateDp("connectionsToHomes", Number(e.target.value))
          }
          style={inputStyle}
        >
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={24}>24</option>
          <option value={32}>32</option>
        </select>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
            marginTop: 10,
          }}
        >
          {[
            ["Capacity", dpCapacity],
            ["Used", dpUsed],
            ["Available", dpAvailable],
          ].map(([title, value]) => (
            <div
              key={String(title)}
              style={{
                background: "#111827",
                border: "1px solid #334155",
                borderRadius: 8,
                padding: 8,
                textAlign: "center",
              }}
            >
              <strong>{value}</strong>
              <br />
              <span style={{ color: "#9ca3af", fontSize: "0.78rem" }}>
                {title}
              </span>
            </div>
          ))}
        </div>

        <div style={labelStyle}>Connected Homes</div>
        <button
          type="button"
          onClick={() => setConnectedHomesOpen((open) => !open)}
          style={{ ...secondaryButtonStyle, width: "100%" }}
        >
          {dpUsed} connected / {dpCapacity || 0} capacity{" "}
          {connectedHomesOpen ? "▲" : "▼"}
        </button>
        {connectedHomesOpen ? (
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexDirection: "column",
              gap: 6,
            }}
          >
            {connectedHomes.length === 0 ? (
              <div style={helpText}>No homes connected yet</div>
            ) : (
              connectedHomes.map((home) => (
                <div key={`${home.homeId}-${home.port}`} style={docRow}>
                  <span>
                    <strong>Port {home.port}</strong>
                    <br />
                    {home.homeName}
                  </span>
                  <em>{home.status}</em>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div style={labelStyle}>Power Readings</div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              value={dpDetails.powerReadings?.[i] || ""}
              onChange={(e) => {
                const readings = [
                  ...(dpDetails.powerReadings || ["", "", "", ""]),
                ] as string[];
                readings[i] = e.target.value;
                updateDp("powerReadings", readings);
              }}
              style={inputStyle}
            />
          ))}
        </div>

        <div style={labelStyle}>Image</div>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => uploadDpImage(e.target.files?.[0] || null)}
          style={inputStyle}
        />
        {previewImage ? (
          <div style={{ ...photoCard, marginTop: 8 }}>
            <img src={previewImage} style={photoImg} />
            <button
              type="button"
              onClick={() => updateDp("image", "")}
              style={{ ...secondaryButtonStyle, width: "100%", marginTop: 6 }}
            >
              Remove Image
            </button>
          </div>
        ) : null}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  return null;
}
