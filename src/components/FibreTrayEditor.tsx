import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  setDoc,
} from "firebase/firestore";
import { db, auth } from "../firebase";
import { useAppMode } from "../context/AppModeContext";
import { useUserRole } from "../context/UserRoleContext";

import { buildJoint, JOINT_TYPES } from "../logic/jointConfig";
import type { FibreCell, JointTypeLabel } from "../logic/jointConfig";

import {
  getColourForFibre,
  SEARCH_HIGHLIGHT,
  TRAY_COLOR,
  TRAY_OUTLINE,
} from "../logic/fibreColours";

import { loadMappingFile } from "../logic/mappingParser";
import { applyLmjRowsToModel } from "../logic/lmjMapping";
import * as XLSX from "xlsx";
import { convertLmjSheetToStandardRows } from "../logic/lmjSheetConverter";

import { exportLmjExcelInPlace } from "../logic/exportLmjExcel";
import { exportAgExcelInPlace } from "../logic/exportAgExcel";
import { exportStreetCabExcelInPlace } from "../logic/exportStreetCabExcel";
import { getBuildStatusColor } from "../services/statusColors";
import { ContinuityViewer } from "./ContinuityViewer";
import { LMJContinuityViewer } from "./LMJContinuityViewer";
import LMJTrayView from "./LMJTrayView";
import MapView from "./MapView";
import NetworkTreeView from "./NetworkTreeView";
import JointMapManager, { type SavedJoint } from "./JointMapManager";
import ChangesDashboard from "./audit/ChangesDashboard";
import ChangeReasonModal from "./audit/ChangeReasonModal";
import { createAssetAccessLog, createAssetChangeLog } from "../services/auditService";
import StreetCabEditor from "./StreetCabEditor";
import {
  cleanSavedJointsForFirebase,
  loadMapAssetsFromFirestore,
  restoreSavedJointsFromFirebase,
  saveMapAssetsToFirestore,
} from "../services/mapAssetStorage";

/* -------------------------------------------------------------
  Persistence
------------------------------------------------------------- */
const STORAGE_KEY = "fibre-tray-project-v1";
const FIRESTORE_REF_PATH = ["businesses", "fibre-gis-v2"] as const;

const JOINT_MAPPING_CHUNK_SIZE = 250;
type MappingChunkDoc = {
  rowsJson?: string;
  chunkIndex?: number;
};

function parseFibreNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const cleaned = value.trim();
    if (!cleaned) return null;
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function dedupeMappingRows(rows: any[][]): any[][] {
  const byFibre = new Map<number, any[]>();
  const withoutFibre: any[][] = [];

  rows.forEach((row) => {
    const fibre = parseFibreNumber(row?.[1]);
    if (fibre === null) {
      withoutFibre.push(row);
      return;
    }

    // One current mapping row per fibre number. If older duplicate rows exist,
    // keep the latest row so a move cannot reload as two labels on the tray.
    byFibre.set(fibre, row);
  });

  return [...withoutFibre, ...Array.from(byFibre.values())];
}

async function saveJointMappingRowsToFirestore(jointId: string, rows: any[][]) {
  const chunksRef = collection(
    db,
    "businesses",
    "fibre-gis-v2",
    "jointMappings",
    jointId,
    "chunks",
  );

  const existing = await getDocs(chunksRef);
  await Promise.all(existing.docs.map((chunkDoc) => deleteDoc(chunkDoc.ref)));

  const chunks: any[][][] = [];
  for (let i = 0; i < rows.length; i += JOINT_MAPPING_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + JOINT_MAPPING_CHUNK_SIZE));
  }

  await Promise.all(
    chunks.map((chunkRows, index) =>
      setDoc(doc(chunksRef, `chunk_${String(index).padStart(5, "0")}`), {
        chunkIndex: index,
        rowsJson: JSON.stringify(chunkRows),
      }),
    ),
  );

  await setDoc(
    doc(db, "businesses", "fibre-gis-v2", "jointMappings", jointId),
    {
      jointId,
      rowCount: rows.length,
      chunkCount: chunks.length,
      updatedAt: new Date().toISOString(),
      updatedByUid: auth.currentUser?.uid || "unknown",
      updatedByEmail: auth.currentUser?.email || "unknown",
    },
    { merge: true },
  );
}

async function loadJointMappingRowsFromFirestore(
  jointId: string,
): Promise<any[][]> {
  const chunksRef = collection(
    db,
    "businesses",
    "fibre-gis-v2",
    "jointMappings",
    jointId,
    "chunks",
  );

  const snapshot = await getDocs(chunksRef);
  const chunks = snapshot.docs
    .map((chunkDoc) => {
      const data = chunkDoc.data() as MappingChunkDoc;
      return {
        id: chunkDoc.id,
        index:
          typeof data.chunkIndex === "number"
            ? data.chunkIndex
            : Number(chunkDoc.id.replace("chunk_", "")),
        rows: safeJsonParse(data.rowsJson, []),
      };
    })
    .sort((a, b) => a.index - b.index || a.id.localeCompare(b.id));

  return chunks.flatMap((chunk) =>
    Array.isArray(chunk.rows) ? chunk.rows : [],
  );
}

function safeJsonParse(value: any, fallback: any) {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

type PersistedProject = {
  assetType: "ag-joint" | "street-cab";
  jointType: JointTypeLabel;
  model: FibreCell[];
  mappingRows: any[][];
  savedJoints: SavedJoint[];
  selectedFibre: number | null;
  loadedFileName: string;
};

function isValidJointType(value: any): value is JointTypeLabel {
  return (
    value === "CMJ (12 trays)" ||
    value === "MMJ (20 trays)" ||
    value === "LMJ (40 trays)"
  );
}


function cloneTrayModel(model: FibreCell[]): FibreCell[] {
  return model.map((cell) => ({ ...cell }));
}

function isPersistedTrayModel(value: any): value is FibreCell[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((cell) =>
      cell &&
      typeof cell === "object" &&
      typeof cell.globalNo === "number" &&
      typeof cell.tray === "number" &&
      typeof cell.pos === "number" &&
      typeof cell.label === "string",
    )
  );
}

function getMaxFibreNumberFromRows(rows: any[][]): number {
  return rows.reduce((max, row) => {
    const fibre = parseFibreNumber(row?.[1]);
    return fibre !== null ? Math.max(max, fibre) : max;
  }, 0);
}

function expandTrayModelToFibreCount(
  model: FibreCell[],
  fibreCount: number,
  fibresPerTray: number,
): FibreCell[] {
  if (!Number.isFinite(fibreCount) || fibreCount <= 0) return cloneTrayModel(model);

  const next = cloneTrayModel(model);
  const existing = new Set(next.map((cell) => cell.globalNo));
  const safeFibresPerTray = Math.max(1, fibresPerTray || 12);

  for (let globalNo = 1; globalNo <= fibreCount; globalNo += 1) {
    if (existing.has(globalNo)) continue;

    next.push({
      globalNo,
      tray: Math.floor((globalNo - 1) / safeFibresPerTray),
      pos: (globalNo - 1) % safeFibresPerTray,
      label: "",
    });
  }

  return next.sort((a, b) => a.globalNo - b.globalNo);
}

function buildJointForRows(
  targetJointType: JointTypeLabel,
  rows: any[][],
): FibreCell[] {
  const cfg = JOINT_TYPES[targetJointType];
  const base = buildJoint(targetJointType);
  return expandTrayModelToFibreCount(
    base,
    getMaxFibreNumberFromRows(rows),
    cfg?.fibresPerTray || 12,
  );
}

function applyStandardRowsToTrayModel(
  model: FibreCell[],
  rows: any[][],
  options: { overwriteExistingLabels?: boolean } = {},
): FibreCell[] {
  const next = cloneTrayModel(model);

  rows.forEach((row: any[]) => {
    const fibre = parseFibreNumber(row?.[1]);
    const fullChain = extractChain(row).join(" → ");

    if (fibre !== null) {
      const cell = next.find((f) => f.globalNo === fibre);
      if (cell && (options.overwriteExistingLabels || !cell.label.trim())) {
        cell.label = fullChain;
      }
    }
  });

  return next;
}

/* -------------------------------------------------------------
  Helpers
------------------------------------------------------------- */
function cleanCell(v: any): string {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (!s) return "";
  if (s.toLowerCase() === "nan") return "";
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s;
}

function extractChain(row: any[]): string[] {
  const hops: string[] = [];
  for (let i = 0; i < row.length; i++) {
    const value = cleanCell(row[i]);
    if (value) hops.push(value);
  }
  return hops;
}

function chainForSelectedSlot(model: FibreCell[], fibre: number): string {
  const cell = model.find((f) => f.globalNo === fibre);
  if (!cell || !cell.label.trim()) return "No continuity path found.";
  return cell.label.trim();
}

function getTextColour(bg: string): string {
  const hex = bg.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 150 ? "#000000" : "#ffffff";
}

function extractAllText(rows: any[][]): string[] {
  return rows
    .flat()
    .map((v) => cleanCell(v))
    .filter(Boolean);
}

function looksLikeStandardLmjRows(rows: any[][]): boolean {
  return rows.some((row) => {
    if (!Array.isArray(row)) return false;

    const splitterId = cleanCell(row[13]); // Column N: 1:4W SPLITTER
    const ag = cleanCell(row[21]); // Column V: AG
    const agFibre = cleanCell(row[22]); // Column W: Splitter Fibre Out

    return Boolean(splitterId && ag && agFibre);
  });
}

function detectJointTypeFromRows(rows: any[][]): JointTypeLabel {
  const text = extractAllText(rows).join(" ").toUpperCase();

  if (text.includes("LMJ") || looksLikeStandardLmjRows(rows)) {
    return "LMJ (40 trays)";
  }

  if (text.includes("MMJ")) return "MMJ (20 trays)";
  return "CMJ (12 trays)";
}

function detectAssetTypeFromRows(rows: any[][]): "ag-joint" | "street-cab" {
  const text = extractAllText(rows).join(" ").toUpperCase();

  if (text.includes("(PATCHING SC)") || text.includes("PATCHING SC")) {
    return "street-cab";
  }

  return "ag-joint";
}

function deriveJointNameFromRows(rows: any[][]): string {
  const values = extractAllText(rows).map((v) => v.toUpperCase());

  const fullNodePatterns = [
    /\b[A-Z]{2,4}-[A-Z]{2,6}-LC\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-AG\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-SB\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-MIDJ\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-CMJ\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-MMJ\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-LMJ\d{1,3}\b/,
    /\b[A-Z]{2,4}-[A-Z]{2,6}-SC\d{1,3}\b/,
  ];

  for (const value of values) {
    for (const pattern of fullNodePatterns) {
      const match = value.match(pattern);
      if (match) return match[0];
    }
  }

  let areaPrefix = "";
  for (const value of values) {
    const match = value.match(/\b[A-Z]{2,4}-[A-Z]{2,6}\b/);
    if (match) {
      areaPrefix = match[0];
      break;
    }
  }

  const localPatterns = [
    /\bLC\d{1,3}\b/,
    /\bAG\d{1,3}\b/,
    /\bSB\d{1,3}\b/,
    /\bMIDJ\d{1,3}\b/,
    /\bCMJ\d{1,3}\b/,
    /\bMMJ\d{1,3}\b/,
    /\bLMJ\d{1,3}\b/,
    /\bSC\d{1,3}\b/,
  ];

  for (const value of values) {
    for (const pattern of localPatterns) {
      const match = value.match(pattern);
      if (match) {
        return areaPrefix ? `${areaPrefix}-${match[0]}` : match[0];
      }
    }
  }

  return areaPrefix || "UNKNOWN-JOINT";
}

type PendingFibreMove = {
  id: string;
  jointId: string;
  jointName: string;
  tray: number;
  fromFibre: number;
  toFibre: number;
  fromLabelBefore: string;
  toLabelBefore: string;
  movedAt: string;
};

/* -------------------------------------------------------------
  MAIN COMPONENT
------------------------------------------------------------- */
export const FibreTrayEditor: React.FC = () => {
  const { activeMode, requiresAuditReason } = useAppMode();
  const { isMaintenanceUser, canSeeFullOperations } = useUserRole();

  const [activeView, setActiveView] = useState<
    "editor" | "map" | "network" | "joint-map" | "changes"
  >("joint-map");

  const [assetType, setAssetType] = useState<"ag-joint" | "street-cab">(
    "ag-joint",
  );
  const [loadedFileName, setLoadedFileName] = useState("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const [savedJoints, setSavedJoints] = useState<SavedJoint[]>([]);
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const lastFirebaseJsonRef = useRef("");
  const firebaseSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [jointType, setJointType] = useState<JointTypeLabel>("CMJ (12 trays)");
  const [model, setModel] = useState<FibreCell[]>(() =>
    buildJoint("CMJ (12 trays)"),
  );

  const [mappingRows, setMappingRows] = useState<any[][]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [moveMode, setMoveMode] = useState(false);
  const [moveSrc, setMoveSrc] = useState<FibreCell | null>(null);
  const [selectedFibre, setSelectedFibre] = useState<number | null>(null);
  const [pendingFibreMoves, setPendingFibreMoves] = useState<PendingFibreMove[]>([]);
  const [showChangeReasonModal, setShowChangeReasonModal] = useState(false);

  const [trayFilter, setTrayFilter] = useState<number | "all">("all");
  const trayContainerRef = useRef<HTMLDivElement | null>(null);

  const updateModel = (fn: (prev: FibreCell[]) => FibreCell[]) =>
    setModel((prev) => fn(prev.map((f) => ({ ...f }))));

  const cfg = JOINT_TYPES[jointType];
  const saveSavedJointsToFirestoreNow = useCallback(
    async (nextSavedJoints: SavedJoint[]) => {
      const cleaned = await saveMapAssetsToFirestore(nextSavedJoints);
      lastFirebaseJsonRef.current = JSON.stringify(cleaned);
      console.log(
        `Saved ${cleaned.length} chunked map assets to Firestore immediately`,
      );
    },
    [],
  );

  const selectedMapJoint = selectedJointId
    ? savedJoints.find((j) => j.id === selectedJointId) || null
    : null;

  // IMPORTANT: do not derive the selected joint name from uploaded mapping rows.
  // Mapping files often contain cable/joint references that are not the asset's
  // user-edited map name, and using them here causes names to be overwritten.
  const currentJointName = selectedMapJoint?.name || "UNKNOWN-JOINT";

  const updateSelectedMapJointMetadata = useCallback(
    (updates: Record<string, any>) => {
      if (!selectedJointId) return;

      const now = new Date().toISOString();

      setSavedJoints((prev) =>
        prev.map((asset) => {
          if (asset.id !== selectedJointId) return asset;

          return {
            ...asset,
            ...updates,
            updatedAt: now,
            updatedByUid: auth.currentUser?.uid || "unknown",
            updatedByEmail: auth.currentUser?.email || "unknown",
          } as SavedJoint;
        }),
      );
    },
    [selectedJointId],
  );

  const selectedLocationDescription = String(
    (selectedMapJoint as any)?.locationDescription ||
      (selectedMapJoint as any)?.autoLocationDescription ||
      "",
  );
  const selectedRoadName = String((selectedMapJoint as any)?.roadName || "");
  const selectedPostcode = String((selectedMapJoint as any)?.postcode || "");

  /* -------------------------------------------------------------
    Load persisted project
  ------------------------------------------------------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed: PersistedProject = JSON.parse(raw);

      if (
        parsed.assetType === "ag-joint" ||
        parsed.assetType === "street-cab"
      ) {
        setAssetType(parsed.assetType);
      }

      if (isValidJointType(parsed.jointType)) {
        setJointType(parsed.jointType);
      }

      if (Array.isArray(parsed.model) && parsed.model.length > 0) {
        setModel(parsed.model);
      }

      if (Array.isArray(parsed.mappingRows)) {
        setMappingRows(parsed.mappingRows);
      }

      if (Array.isArray(parsed.savedJoints)) {
        setSavedJoints(parsed.savedJoints);
      }

      if (
        parsed.selectedFibre === null ||
        typeof parsed.selectedFibre === "number"
      ) {
        setSelectedFibre(parsed.selectedFibre);
      }

      if (typeof parsed.loadedFileName === "string") {
        setLoadedFileName(parsed.loadedFileName);
      }
    } catch (err) {
      console.error("Failed to load saved project:", err);
    }
  }, []);

  /* -------------------------------------------------------------
    Load shared project from Firestore
  ------------------------------------------------------------- */
  useEffect(() => {
    const ref = doc(db, ...FIRESTORE_REF_PATH, "mapAssets", "main");

    const unsub = onSnapshot(
      ref,
      async () => {
        try {
          const restored = await loadMapAssetsFromFirestore();

          lastFirebaseJsonRef.current = JSON.stringify(
            cleanSavedJointsForFirebase(restored),
          );
          setSavedJoints(restored);
        } catch (err) {
          console.error("Firestore map asset load failed:", err);
        } finally {
          setFirebaseLoaded(true);
        }
      },
      async (err) => {
        console.error("Firestore map asset listener failed:", err);

        // Try one direct load before giving up, useful when rules/listener timing is odd.
        try {
          const restored = await loadMapAssetsFromFirestore();
          lastFirebaseJsonRef.current = JSON.stringify(
            cleanSavedJointsForFirebase(restored),
          );
          setSavedJoints(restored);
        } catch (loadErr) {
          console.error("Firestore fallback map asset load failed:", loadErr);
        } finally {
          setFirebaseLoaded(true);
        }
      },
    );

    return () => unsub();
  }, []);

  /* -------------------------------------------------------------
    Save shared project to Firestore
  ------------------------------------------------------------- */
  useEffect(() => {
    if (!firebaseLoaded) return;

    const cleaned = cleanSavedJointsForFirebase(savedJoints);
    const json = JSON.stringify(cleaned);

    if (json === lastFirebaseJsonRef.current) return;

    if (firebaseSaveTimerRef.current) {
      clearTimeout(firebaseSaveTimerRef.current);
    }

    firebaseSaveTimerRef.current = setTimeout(() => {
      saveMapAssetsToFirestore(savedJoints)
        .then((savedCleaned) => {
          lastFirebaseJsonRef.current = JSON.stringify(savedCleaned);
          console.log(
            `Saved ${savedCleaned.length} chunked map assets to Firestore`,
          );
        })
        .catch((err) => {
          console.error("Firestore chunked map asset save failed:", err);
        });
    }, 800);

    return () => {
      if (firebaseSaveTimerRef.current) {
        clearTimeout(firebaseSaveTimerRef.current);
      }
    };
  }, [savedJoints, firebaseLoaded]);

  /* -------------------------------------------------------------
    Persist project
  ------------------------------------------------------------- */
  useEffect(() => {
    try {
      const project: PersistedProject = {
        assetType,
        jointType,
        model,
        mappingRows,
        savedJoints: restoreSavedJointsFromFirebase(
          cleanSavedJointsForFirebase(savedJoints),
        ),
        selectedFibre,
        loadedFileName,
      };

      const projectForLocalStorage: PersistedProject = {
        ...project,
        // Do not cache the full live map in browser storage. Firestore chunks
        // are the source of truth; localStorage is only for the open tray state.
        // This prevents QuotaExceededError from killing the save effect.
        savedJoints: [],
        // Large uploaded sheets are stored in Firestore jointMappings chunks.
        mappingRows: mappingRows.length > 500 ? [] : mappingRows,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(projectForLocalStorage));
    } catch (err) {
      console.error("Failed to save project:", err);
    }
  }, [
    assetType,
    jointType,
    model,
    mappingRows,
    savedJoints,
    selectedFibre,
    loadedFileName,
  ]);

  /* -------------------------------------------------------------
    Apply mapping rows to AG joint model
  ------------------------------------------------------------- */
  const applyMappingRowsToModel = (
    rows: any[][],
    targetJointType: JointTypeLabel,
  ) => {
    const base = buildJointForRows(targetJointType, rows);

    if (targetJointType === "LMJ (40 trays)") {
      applyLmjRowsToModel(rows, base, (row) => extractChain(row).join(" → "));
    } else {
      setModel(
        applyStandardRowsToTrayModel(base, rows, {
          overwriteExistingLabels: true,
        }),
      );
      return;
    }

    setModel(base);
  };

  /* -------------------------------------------------------------
    Open saved asset
  ------------------------------------------------------------- */
  const openSavedJoint = async (joint: SavedJoint) => {
    const isStreetCab = joint.assetType === "street-cab";

    setSelectedJointId(joint.id);
    setLoadedFileName(joint.name || "");
    setMappingRows([]);
    setSearchTerm("");
    setMoveMode(false);
    setMoveSrc(null);
    setSelectedFibre(null);
    setPendingFibreMoves([]);
    setTrayFilter("all");

    void createAssetAccessLog({
      asset: joint,
      context: "fibre-tray-editor",
    });

    const jt = (
      joint.jointType in JOINT_TYPES ? joint.jointType : "CMJ (12 trays)"
    ) as JointTypeLabel;

    const persistedTrayModel = isPersistedTrayModel((joint as any).trayModel)
      ? cloneTrayModel((joint as any).trayModel)
      : null;

    if (isStreetCab) {
      setAssetType("street-cab");
      setActiveView("editor");
    } else {
      setAssetType("ag-joint");
      setJointType(jt);
      setModel(persistedTrayModel || buildJoint(jt));
      setActiveView("editor");
    }

    try {
      const hasSharedRows = Boolean(
        (joint as any).mappingRowsRef || (joint as any).mappingRowsCount,
      );
      const rows = hasSharedRows
        ? await loadJointMappingRowsFromFirestore(joint.id)
        : Array.isArray((joint as any).mappingRows)
          ? ((joint as any).mappingRows as any[][])
          : [];

      setLoadedFileName(rows.length ? joint.name || "" : "");
      setMappingRows(rows);

      if (!isStreetCab) {
        if (persistedTrayModel) {
          const expandedPersistedModel = expandTrayModelToFibreCount(
            persistedTrayModel,
            getMaxFibreNumberFromRows(rows),
            JOINT_TYPES[jt]?.fibresPerTray || 12,
          );

          setModel(
            applyStandardRowsToTrayModel(expandedPersistedModel, rows, {
              overwriteExistingLabels: false,
            }),
          );
        } else if (rows.length > 0) {
          applyMappingRowsToModel(rows, jt);
        } else {
          setModel(buildJoint(jt));
        }
      }
    } catch (err) {
      console.error("Failed to load joint mapping rows:", err);
      alert("Failed to load this joint's mapping rows from Firestore.");
    }
  };

  /* -------------------------------------------------------------
    Load mapping file
  ------------------------------------------------------------- */
  const handleLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setOriginalFile(file);
      setLoadedFileName(file.name);

      const rows = await loadMappingFile(file);
      const detectedAssetType = detectAssetTypeFromRows(rows);
      const detectedJointType = detectJointTypeFromRows(rows);

      if (selectedJointId) {
        await saveJointMappingRowsToFirestore(selectedJointId, rows);

        const updatedSavedJoints = savedJoints.map((asset) => {
          if (asset.id !== selectedJointId) return asset;

          const isStreetCabAsset =
            asset.assetType === "street-cab" ||
            detectedAssetType === "street-cab";

          const nextAsset: any = {
            ...asset,
            // Preserve the map asset name exactly as the user set it.
            // Do not overwrite from spreadsheet contents.
            name: asset.name,
            assetType: isStreetCabAsset ? "street-cab" : "ag-joint",
            jointType: isStreetCabAsset ? "Street Cab" : detectedJointType,
            mappingRowsRef: true,
            mappingRowsCount: rows.length,
            mappingRowsSummary: {
              rowCount: rows.length,
            },
            importedFiles: [
              ...(asset.importedFiles || []),
              {
                name: file.name,
                importedAt: new Date().toISOString(),
                rowCount: rows.length,
              },
            ],
          };

          delete nextAsset.mappingRows;
          delete nextAsset.mappingRowsJson;
          return nextAsset as SavedJoint;
        });

        setSavedJoints(updatedSavedJoints);
        await saveSavedJointsToFirestoreNow(updatedSavedJoints);
      }
      setAssetType(
        selectedMapJoint?.assetType === "street-cab"
          ? "street-cab"
          : detectedAssetType,
      );
      setMappingRows(rows);
      setTrayFilter("all");
      setSelectedFibre(null);
      setMoveSrc(null);
      setSearchTerm("");

      if (detectedJointType === "LMJ (40 trays)") {
        const base = buildJoint(detectedJointType);
        applyLmjRowsToModel(rows, base, (row) => extractChain(row).join(" → "));
        setJointType(detectedJointType);
        setModel(base);
      } else if (detectedAssetType === "ag-joint") {
        const base = buildJointForRows(detectedJointType, rows);

        setJointType(detectedJointType);
        setModel(
          applyStandardRowsToTrayModel(base, rows, {
            overwriteExistingLabels: true,
          }),
        );
      }

      e.target.value = "";
    } catch (err: any) {
      console.error(err);
      alert("Failed to load file: " + err.message);
    }
  };

  /* -------------------------------------------------------------
    Convert LMJ supplier sheet

    This does NOT import into the current joint.
    It downloads a clean standard LMJ Excel file that can then be
    uploaded through the normal "Load Mapping File" input above.
  ------------------------------------------------------------- */
  const handleConvertLmjFile = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();

      const workbook = XLSX.read(data, {
        type: "array",
        cellDates: false,
        raw: false,
      });

      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      if (!sheet) {
        throw new Error("No worksheet found in this file.");
      }

      const sourceRows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as any[][];

      const convertedRows = convertLmjSheetToStandardRows(sourceRows);

      const outputSheet = XLSX.utils.aoa_to_sheet(convertedRows);
      const outputWorkbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(
        outputWorkbook,
        outputSheet,
        "LMJ_CONVERTED",
      );

      const originalName = file.name.replace(/\.[^.]+$/, "");
      XLSX.writeFile(outputWorkbook, `${originalName}_LMJ_CONVERTED.xlsx`);
    } catch (err: any) {
      console.error(err);
      alert("LMJ conversion failed: " + (err?.message || String(err)));
    }

    e.target.value = "";
  };

  /* -------------------------------------------------------------
    Search
  ------------------------------------------------------------- */
  const searchMatches = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return new Set<number>();

    const set = new Set<number>();

    model.forEach((f) => {
      if (
        String(f.globalNo).toLowerCase().includes(s) ||
        f.label.toLowerCase().includes(s)
      ) {
        set.add(f.globalNo);
      }
    });

    return set;
  }, [searchTerm, model]);

  const findCell = useCallback(
    (tray: number, pos: number) =>
      model.find((f) => f.tray === tray && f.pos === pos),
    [model],
  );

  /* -------------------------------------------------------------
    Move + click
  ------------------------------------------------------------- */
  const handleFibreClick = (cell: FibreCell) => {
    if (moveMode) {
      if (!moveSrc) {
        setMoveSrc(cell);
        return;
      }

      if (moveSrc.globalNo === cell.globalNo) {
        setMoveSrc(null);
        return;
      }

      const aNo = moveSrc.globalNo;
      const bNo = cell.globalNo;

      const fromLabelBefore = moveSrc.label || "";
      const toLabelBefore = cell.label || "";

      updateModel((prev) => {
        const a = prev.find((f) => f.globalNo === aNo);
        const b = prev.find((f) => f.globalNo === bNo);
        if (!a || !b) return prev;

        [a.label, b.label] = [b.label, a.label];
        return prev;
      });

      setMappingRows((prevRows) =>
        dedupeMappingRows(
          prevRows.map((row) => {
            const fibre = parseFibreNumber(row?.[1]);
            if (fibre !== aNo && fibre !== bNo) return row;

            const nextRow = [...row];
            nextRow[1] = fibre === aNo ? bNo : aNo;
            return nextRow;
          }),
        ),
      );

      if (selectedJointId) {
        setPendingFibreMoves((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            jointId: selectedJointId,
            jointName: currentJointName,
            tray: moveSrc.tray,
            fromFibre: aNo,
            toFibre: bNo,
            fromLabelBefore,
            toLabelBefore,
            movedAt: new Date().toISOString(),
          },
        ]);
      }

      setMoveSrc(null);
      return;
    }

    setSelectedFibre(cell.globalNo);
  };

  const saveCurrentJoint = async (reason?: string, comment?: string) => {
    if (!selectedJointId) {
      alert("Open/select a joint first.");
      return;
    }

    const movesToLog = [...pendingFibreMoves];

    if ((movesToLog.length > 0 || requiresAuditReason || isMaintenanceUser) && !reason?.trim()) {
      setShowChangeReasonModal(true);
      return;
    }

    const beforeAsset = selectedMapJoint ? { ...selectedMapJoint } : null;
    const now = new Date().toISOString();
    const dedupedMappingRows = dedupeMappingRows(mappingRows);

    let updatedAsset: SavedJoint | null = null;

    const updatedJoints = savedJoints.map((asset) => {
      if (asset.id !== selectedJointId) return asset;

      updatedAsset = {
        ...asset,
        name: asset.name,
        jointType,
        mappingRowsRef: true,
        mappingRowsCount: dedupedMappingRows.length,
        mappingRowsSummary: {
          rowCount: dedupedMappingRows.length,
        },
        trayModel: cloneTrayModel(model),
        trayModelUpdatedAt: now,
        updatedAt: now,
        updatedByUid: auth.currentUser?.uid || "unknown",
        updatedByEmail: auth.currentUser?.email || "unknown",
        lastChangeReason: reason?.trim() || (asset as any).lastChangeReason || "Manual save",
      } as any;

      return updatedAsset;
    });

    setSavedJoints(updatedJoints);
    setMappingRows(dedupedMappingRows);
    await saveJointMappingRowsToFirestore(selectedJointId, dedupedMappingRows);
    await saveSavedJointsToFirestoreNow(updatedJoints);

    if (updatedAsset && (movesToLog.length > 0 || requiresAuditReason || isMaintenanceUser)) {
      await createAssetChangeLog({
        asset: updatedAsset,
        action: movesToLog.length > 0 ? "fibre-moved" : "updated",
        reason: reason || "Maintenance update",
        comment,
        context: movesToLog.length > 0
          ? "fibre-tray-editor-move-mode"
          : "fibre-tray-editor-maintenance-save",
        before: {
          asset: beforeAsset,
          moves: movesToLog,
        },
        after: {
          asset: updatedAsset,
          moves: movesToLog,
          trayModel: cloneTrayModel(model),
        },
      });
      setPendingFibreMoves([]);
    }

    alert("Joint saved to Firestore.");
  };

  /* -------------------------------------------------------------
    Clear current labels
  ------------------------------------------------------------- */
  const handleClear = () => {
    updateModel((prev) => {
      prev.forEach((f) => {
        f.label = "";
      });
      return prev;
    });

    setSearchTerm("");
    setSelectedFibre(null);
    setMoveSrc(null);
    setMappingRows([]);
  };

  /* -------------------------------------------------------------
    Clear saved project
  ------------------------------------------------------------- */
  const handleClearSavedProject = () => {
    const ok = window.confirm("Clear the saved project from this browser?");
    if (!ok) return;

    localStorage.removeItem(STORAGE_KEY);

    setAssetType("ag-joint");
    setJointType("CMJ (12 trays)");
    setModel(buildJoint("CMJ (12 trays)"));
    setMappingRows([]);
    setSavedJoints([]);
    setSelectedFibre(null);
    setSearchTerm("");
    setMoveMode(false);
    setMoveSrc(null);
    setTrayFilter("all");
    setLoadedFileName("");
    setOriginalFile(null);
    setSelectedJointId(null);
  };

  /* -------------------------------------------------------------
    Joint type change
  ------------------------------------------------------------- */
  const handleJointTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const jt = e.target.value as JointTypeLabel;
    setJointType(jt);
    setModel(buildJoint(jt));
    setMoveSrc(null);
    setSelectedFibre(null);
    setSearchTerm("");
    setMappingRows([]);
    setTrayFilter("all");
  };

  /* -------------------------------------------------------------
    Alternate views
  ------------------------------------------------------------- */
  if (activeView === "map") {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          background: "#242424",
        }}
      >
        <button
          onClick={() => setActiveView("editor")}
          style={{ ...btnSecondary, width: 160, margin: 10 }}
        >
          Back to Editor
        </button>

        <div style={{ flex: 1 }}>
          <MapView
            savedJoints={savedJoints}
            mappingRows={mappingRows}
            onOpenJoint={openSavedJoint}
          />
        </div>
      </div>
    );
  }

  if (activeView === "network") {
    return (
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          flexDirection: "column",
          background: "#242424",
        }}
      >
        <button
          onClick={() => setActiveView("editor")}
          style={{ ...btnSecondary, width: 160, margin: 10 }}
        >
          Back to Editor
        </button>

        <div style={{ flex: 1, overflow: "hidden" }}>
          <NetworkTreeView
            mappingRows={mappingRows}
            onSelectFibre={(fibre) => {
              setSelectedFibre(fibre);
            }}
          />
        </div>
      </div>
    );
  }

  if (activeView === "changes") {
    return (
      <ChangesDashboard
        asset={selectedMapJoint}
        onBack={() => setActiveView("editor")}
      />
    );
  }

  if (activeView === "joint-map") {
    return (
      <JointMapManager
        currentJointName={currentJointName}
        currentJointType={jointType}
        currentMappingRows={mappingRows}
        savedJoints={savedJoints}
        setSavedJoints={setSavedJoints}
        onClose={() => setActiveView("editor")}
        onOpenJoint={openSavedJoint}
      />
    );
  }

  /* -------------------------------------------------------------
    Main editor layout
  ------------------------------------------------------------- */
  const trayH = 26;
  const trayGap = 6;
  const left = 90;
  const gap = 26;
  const top = 20;

  const renderedTrayCount = Math.max(
    cfg.trays,
    model.reduce((maxTray, cell) => Math.max(maxTray, cell.tray + 1), 0),
  );

  const visibleTrays =
    trayFilter === "all"
      ? Array.from({ length: renderedTrayCount }, (_, i) => i)
      : [trayFilter];

  const svgWidth = left + cfg.fibresPerTray * gap + 60;
  const svgHeight = top + visibleTrays.length * (trayH + trayGap) + 40;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr 420px",
        height: "100vh",
        overflow: "hidden",
        background: "#111827",
        color: "white",
      }}
    >
      <ChangeReasonModal
        visible={showChangeReasonModal}
        title={isMaintenanceUser || requiresAuditReason ? "Maintenance note required" : "Reason required for fibre move"}
        description={isMaintenanceUser || requiresAuditReason ? "Add an accountability note before saving maintenance changes to this joint." : "You moved fibres in Move Mode. Add why this change was made before saving the joint."}
        confirmLabel={isMaintenanceUser || requiresAuditReason ? "Save Joint + Maintenance Log" : "Save Joint + Log Change"}
        onCancel={() => setShowChangeReasonModal(false)}
        onSubmit={(reason, comment) => {
          setShowChangeReasonModal(false);
          void saveCurrentJoint(reason, comment);
        }}
      />

      {/* LEFT PANEL */}
      <div
        style={{
          borderRight: "1px solid #374151",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          overflowY: "auto",
          background: "#111827",
        }}
      >

        {canSeeFullOperations && (
          <button style={btnSecondary} onClick={() => setActiveView("network")}>
            Full Network Map
          </button>
        )}

        <button style={btnSecondary} onClick={() => setActiveView("joint-map")}>
          Back To Map
        </button>

        {canSeeFullOperations && (
          <button style={btnSecondary} onClick={() => setActiveView("changes")}>
            Changes / History
          </button>
        )}

        {isMaintenanceUser && (
          <div style={{ background: "#451a03", border: "1px solid #f59e0b", borderRadius: 8, padding: 10, color: "#fef3c7", fontSize: 12, lineHeight: 1.4 }}>
            Maintenance edits are allowed here, but every save requires an accountability note.
          </div>
        )}

        <label>Asset Type</label>
        <div style={{ fontSize: "0.9rem", color: "#cbd5e1" }}>
          <strong>Selected joint:</strong> {selectedMapJoint?.name || "None"}
        </div>
        <select
          value={assetType}
          onChange={(e) =>
            setAssetType(e.target.value as "ag-joint" | "street-cab")
          }
          style={{ width: "100%", padding: "0.35rem" }}
        >
          <option value="ag-joint">AG Joint</option>
          <option value="street-cab">Street Cab</option>
        </select>

        {assetType === "ag-joint" && (
          <>
            <label>Joint Type</label>
            <select
              value={jointType}
              onChange={handleJointTypeChange}
              style={{ width: "100%", padding: "0.35rem" }}
            >
              {(Object.keys(JOINT_TYPES) as JointTypeLabel[]).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>

            {jointType !== "LMJ (40 trays)" && (
              <>
                <label>Tray View</label>
                <select
                  value={trayFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTrayFilter(value === "all" ? "all" : Number(value));
                  }}
                  style={{ width: "100%", padding: "0.35rem" }}
                >
                  <option value="all">All Trays</option>
                  {Array.from({ length: renderedTrayCount }, (_, i) => (
                    <option key={i + 1} value={i}>
                      Tray {i + 1}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}

        <label>Location Description</label>

<input
  value={(selectedMapJoint as any)?.locationDescription || ""}
  onChange={(e) =>
    updateSelectedMapJointMetadata({
      locationDescription: e.target.value,
    })
  }
  placeholder="e.g. Footway outside 12 High Street"
  style={{
    width: "100%",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #4b5563",
    boxSizing: "border-box",
  }}
/>

        <label>Postcode</label>
        <input
          value={selectedPostcode}
          disabled={!selectedJointId}
          onChange={(e) =>
            updateSelectedMapJointMetadata({
              postcode: e.target.value.toUpperCase(),
              locationSource: "manual",
            })
          }
          placeholder="e.g. AB12 3CD"
          style={{ width: "100%", padding: "0.35rem" }}
        />
<label>Build Status</label>
<select
  value={(selectedMapJoint as any)?.buildStatus || "0-Backlog"}
  onChange={(e) =>
    updateSelectedMapJointMetadata({
      buildStatus: e.target.value,
      status: e.target.value,
    })
  }
  style={{
    width: "100%",
    padding: 8,
    borderRadius: 4,
    border: "1px solid #4b5563",
    boxSizing: "border-box",
  }}
>
  <option value="0-Backlog">0-Backlog</option>
  <option value="1-Plan">1-Plan</option>
  <option value="2-Survey">2-Survey</option>
  <option value="3-Design">3-Design</option>
  <option value="4-Plan Done">4-Plan Done</option>
  <option value="5-ToDo">5-ToDo</option>
  <option value="6-In Progress">6-In Progress</option>
  <option value="7-Build Done">7-Build Done</option>
  <option value="8-RFS">8-RFS</option>
</select>
        <label>Load Mapping File</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.xlm"
          onChange={handleLoadFile}
        />
        <button
          style={btnSecondary}
          onClick={() => {
            void saveCurrentJoint();
          }}
        >
          Save Joint
        </button>
        <label>Convert LMJ Sheet</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.xlm"
          onChange={handleConvertLmjFile}
        />

        <div
          style={{
            fontSize: "0.8rem",
            color: "#cbd5e1",
            background: "#1f2937",
            padding: "0.5rem",
            borderRadius: 6,
          }}
        >
          Use this for supplier LMJ sheets with different layouts. It downloads
          a clean LMJ file. Then upload that converted file using Load Mapping
          File above.
        </div>

        <button
          style={btnSecondary}
          onClick={async () => {
            try {
              if (!originalFile) {
                alert("Load the original Excel file first.");
                return;
              }

              if (assetType === "street-cab") {
                await exportStreetCabExcelInPlace(originalFile, mappingRows);
              } else if (jointType === "LMJ (40 trays)") {
                await exportLmjExcelInPlace(originalFile, model);
              } else {
                await exportAgExcelInPlace(originalFile, model);
              }
            } catch (err: any) {
              console.error(err);
              alert("Export failed: " + (err?.message || String(err)));
            }
          }}
        >
          Export Excel
        </button>

        <label>Search</label>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="48FULW01, MIDJ04..."
          style={{ padding: "0.35rem", width: "100%" }}
        />

        <small>Matches: {searchMatches.size}</small>

        {assetType === "ag-joint" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button style={btnSecondary} onClick={() => setSearchTerm("")}>
              Clear Search
            </button>

            <button
              onClick={() => {
                setMoveMode(!moveMode);
                setMoveSrc(null);
              }}
              style={{
                ...btnSecondary,
                background: moveMode ? "#f97316" : "#3b82f6",
                color: "white",
              }}
            >
              Move {moveMode ? "ON" : "OFF"}
            </button>
          </div>
        )}

        {assetType === "ag-joint" && (
          <button style={btnDanger} onClick={handleClear}>
            Clear All Labels
          </button>
        )}

        <button style={btnDanger} onClick={handleClearSavedProject}>
          Clear Saved Project
        </button>

        {assetType === "ag-joint" && moveMode && (
          <div
            style={{
              fontSize: "0.9rem",
              color: "#ddd",
              background: "#333",
              padding: "0.6rem",
              borderRadius: 6,
            }}
          >
            {moveSrc
              ? `Selected source slot ${moveSrc.globalNo}. Click destination slot.`
              : "Move mode active. Click a source slot, then a destination slot."}
          </div>
        )}

        {assetType === "ag-joint" && selectedFibre !== null && (
          <div
            style={{
              fontSize: "0.9rem",
              color: "#ddd",
              background: "#333",
              padding: "0.6rem",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>Selected Fibre:</strong> {selectedFibre}
            {"\n\n"}
            {chainForSelectedSlot(model, selectedFibre)}
          </div>
        )}

        {assetType === "street-cab" && (
          <div
            style={{
              fontSize: "0.9rem",
              color: "#ddd",
              background: "#333",
              padding: "0.6rem",
              borderRadius: 6,
              whiteSpace: "pre-wrap",
            }}
          >
            <strong>Loaded Street Cab:</strong>
            {"\n"}
            {loadedFileName || "No file loaded"}
            {"\n\n"}
            Rows: {mappingRows.length}
          </div>
        )}
      </div>

      {/* MIDDLE + RIGHT */}
      {assetType === "street-cab" ? (
        <div style={{ gridColumn: "2 / 4", minWidth: 0 }}>
          <StreetCabEditor fileName={loadedFileName} rows={mappingRows} />
        </div>
      ) : (
        <>
          {/* MIDDLE PANEL */}
          <div
            ref={trayContainerRef}
            style={{ padding: "1rem", overflow: "auto", background: "#111827" }}
          >
            {jointType === "LMJ (40 trays)" ? (
              <LMJTrayView
                model={model}
                searchMatches={searchMatches}
                moveMode={moveMode}
                moveSrc={moveSrc}
                onFibreClick={handleFibreClick}
              />
            ) : (
              <svg width={svgWidth} height={svgHeight}>
                {visibleTrays.map((tray, visibleIndex) => {
                  const y = top + visibleIndex * (trayH + trayGap);

                  return (
                    <g key={tray}>
                      <text
                        x={15}
                        y={y + trayH / 2 + 3}
                        fill="white"
                        fontSize={10}
                      >
                        Tray {tray + 1}
                      </text>

                      <rect
                        x={left - 10}
                        y={y}
                        width={cfg.fibresPerTray * gap + 20}
                        height={trayH}
                        fill={TRAY_COLOR}
                        stroke={TRAY_OUTLINE}
                        rx={4}
                      />

                      {Array.from({ length: cfg.fibresPerTray }, (_, pos) => {
                        const cell = findCell(tray, pos);
                        if (!cell) return null;

                        const fx = left + pos * gap;
                        const fy = y + trayH / 2;

                        const isUsed = !!cell.label.trim();
                        const highlight = searchMatches.has(cell.globalNo);
                        const isMoveSource =
                          moveMode && moveSrc?.globalNo === cell.globalNo;

                        const fillColour = isMoveSource
                          ? "#f97316"
                          : highlight
                            ? SEARCH_HIGHLIGHT
                            : getColourForFibre(pos);

                        return (
                          <g
                            key={pos}
                            style={{ cursor: "pointer" }}
                            onClick={() => handleFibreClick(cell)}
                          >
                            <circle
                              cx={fx}
                              cy={fy}
                              r={isUsed ? 16 : 8}
                              fill={fillColour}
                              stroke={isUsed ? "white" : "#333"}
                              strokeWidth={isMoveSource ? 4 : isUsed ? 3 : 1}
                            />

                            <text
                              x={fx}
                              y={fy + 3}
                              textAnchor="middle"
                              fontSize={isUsed ? 10 : 8}
                              fontWeight="600"
                              fill={getTextColour(fillColour)}
                              pointerEvents="none"
                            >
                              {cell.globalNo}
                            </text>
                          </g>
                        );
                      })}
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* RIGHT PANEL */}
          <div
            style={{
              borderLeft: "1px solid #374151",
              padding: "1rem",
              overflow: "auto",
              background: "#111827",
            }}
          >
            {jointType === "LMJ (40 trays)" ? (
              <LMJContinuityViewer
                model={model}
                selectedFibre={selectedFibre}
              />
            ) : (
              <ContinuityViewer model={model} selectedFibre={selectedFibre} />
            )}
          </div>
        </>
      )}
    </div>
  );
};

const btnSecondary: React.CSSProperties = {
  padding: "0.4rem",
  border: "1px solid #1e3a8a",
  background: "#3b82f6",
  color: "white",
  borderRadius: 4,
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  padding: "0.4rem",
  border: "1px solid #991b1b",
  background: "#dc2626",
  color: "white",
  borderRadius: 4,
  cursor: "pointer",
};
