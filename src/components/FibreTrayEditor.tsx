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
import MeetMeTrayView from "./MeetMeTrayView";
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
} from "../services/mapAssetStorage";
import { saveMapAssetsViaCoordinator } from "../services/mapSaveCoordinator";
import { spatialApiConfig } from "../services/spatialApi/spatialApiConfig";
import {
  loadJointMappingRowsFromPostgisRecords,
  saveJointMappingRowsToPostgisRecords,
} from "../services/spatialApi/jointMappingRecordStorage";

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
  if (spatialApiConfig.postgisOnly) {
    await saveJointMappingRowsToPostgisRecords(jointId, rows);
    return;
  }

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
  if (spatialApiConfig.postgisOnly) {
    return loadJointMappingRowsFromPostgisRecords(jointId);
  }

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

type EditorAssetType = "ag-joint" | "street-cab" | "meet-me";
type EditorJointType = JointTypeLabel | "Meet Me Chamber";

type PersistedProject = {
  assetType: EditorAssetType;
  jointType: EditorJointType;
  model: FibreCell[];
  mappingRows: any[][];
  savedJoints: SavedJoint[];
  selectedFibre: number | null;
  loadedFileName: string;
};

function isValidJointType(value: any): value is EditorJointType {
  return (
    value === "CMJ (12 trays)" ||
    value === "MMJ (20 trays)" ||
    value === "LMJ (40 trays)" ||
    value === "Meet Me Chamber"
  );
}

function isStandardJointType(value: EditorJointType): value is JointTypeLabel {
  return value === "CMJ (12 trays)" || value === "MMJ (20 trays)" || value === "LMJ (40 trays)";
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

function buildMeetMeContinuityRows(rows: any[][]) {
  return rows.flatMap((row, index) => {
    return readMeetMeRows(row, index).flatMap((fields) => {
      const { tray, inputCable, inputFibre, outputCable, outputFibre, status, notes } = fields;
      const fibreRefs = Array.from(
        new Set([inputFibre, outputFibre].filter((value): value is number => value !== null)),
      );

      if (!fibreRefs.length) return [];

      const label = [
        `${inputCable} ${formatMeetMeLocalFibre(inputFibre)}`,
        "spliced to",
        `${outputCable} ${formatMeetMeLocalFibre(outputFibre)}`,
        status,
        notes,
      ]
        .filter(Boolean)
        .join(" - ");

      return fibreRefs.map((fibre) => ({
        fibre,
        label,
        tray,
        pos: ((fibre - 1) % 12) + 1,
      }));
    });
  });
}

function swapMeetMeFibreRows(rows: any[][], aNo: number, bNo: number) {
  return rows.map((row) => {
    const nextRow = [...row];
    const fields = readMeetMeRow(nextRow, 0);
    ([3, 5] as const).forEach((index, sideIndex) => {
      const fibre = sideIndex === 0 ? fields.inputFibre : fields.outputFibre;
      if (fibre === aNo) nextRow[index] = bNo;
      if (fibre === bNo) nextRow[index] = aNo;
    });
    return nextRow;
  });
}

function swapMeetMeFibreRowsOnSide(rows: any[][], aNo: number, bNo: number, side: "input" | "output") {
  return rows.map((row) => {
    const nextRow = [...row];
    const fields = readMeetMeRow(nextRow, 0);
    const index = side === "input" ? 3 : 5;
    const fibre = side === "input" ? fields.inputFibre : fields.outputFibre;
    if (fibre === aNo) nextRow[index] = bNo;
    if (fibre === bNo) nextRow[index] = aNo;
    return nextRow;
  });
}

function swapMeetMeFibreRowsBetweenTargets(
  rows: any[][],
  source: MeetMeMoveTarget,
  destination: MeetMeMoveTarget,
) {
  const sourceFibre =
    source.fibreNo ??
    getMeetMeGlobalFibre(source.tray, source.localFibre) ??
    source.localFibre;
  const destinationFibre =
    destination.fibreNo ??
    getMeetMeGlobalFibre(destination.tray, destination.localFibre) ??
    destination.localFibre;

  if (source.side !== destination.side) {
    const fromSide = source.side;
    const toSide = destination.side;
    const toIndex = toSide === "input" ? 3 : 5;
    let previousTargetFibre: number | null = null;

    const nextRows = rows.map((row, rowIndex) => {
      const fields = readMeetMeRow(row, rowIndex);
      const currentSourceFibre =
        fromSide === "input"
          ? fields.inputFibre
          : fields.outputFibre;

      if (currentSourceFibre !== sourceFibre) return row;

      const nextRow = [...row];
      previousTargetFibre = parseFibreNumber(nextRow[toIndex]);
      nextRow[toIndex] = destinationFibre;
      return nextRow;
    });

    if (previousTargetFibre === null) return nextRows;

    return nextRows.map((row, rowIndex) => {
      const fields = readMeetMeRow(row, rowIndex);
      const currentTargetFibre =
        toSide === "input"
          ? fields.inputFibre
          : fields.outputFibre;
      const currentOppositeFibre =
        fromSide === "input"
          ? fields.inputFibre
          : fields.outputFibre;

      if (currentTargetFibre !== destinationFibre || currentOppositeFibre === sourceFibre) return row;

      const nextRow = [...row];
      nextRow[toIndex] = previousTargetFibre;
      return nextRow;
    });
  }

  return rows.map((row) => {
    const nextRow = [...row];
    const index = source.side === "input" ? 3 : 5;
    const fibre = parseFibreNumber(nextRow[index]);

    if (fibre === sourceFibre) {
      nextRow[index] = destinationFibre;
    }
    if (fibre === destinationFibre) {
      nextRow[index] = sourceFibre;
    }

    return nextRow;
  });
}

function getMeetMeLocalFibre(fibre: number | null) {
  if (!fibre || !Number.isFinite(fibre)) return null;
  return ((fibre - 1) % 12) + 1;
}

function formatMeetMeLocalFibre(fibre: number | null) {
  const local = getMeetMeLocalFibre(fibre);
  return local ? `F${local}` : "F?";
}

function getMeetMeGlobalFibre(tray: number, localFibre: number | null) {
  if (!localFibre || !Number.isFinite(localFibre)) return null;
  return (tray - 1) * 12 + localFibre;
}

function readMeetMeRow(row: any[], rowIndex: number) {
  return readMeetMeRows(row, rowIndex)[0];
}

function readMeetMeRows(row: any[], rowIndex: number) {
  const tray = parseFibreNumber(row?.[1]) || Math.floor(rowIndex / 12) + 1;
  const inputLocalFibres = parseMeetMeFibreRange(row?.[3]);
  const outputLocalFibres = parseMeetMeFibreRange(row?.[5]);
  const fallbackLocalFibres = inputLocalFibres.length ? inputLocalFibres : outputLocalFibres;
  const maxLength = Math.max(inputLocalFibres.length, outputLocalFibres.length, fallbackLocalFibres.length, 1);

  return Array.from({ length: maxLength }, (_, index) => {
    const inputLocalFibre = inputLocalFibres[index] ?? fallbackLocalFibres[index] ?? null;
    const outputLocalFibre = outputLocalFibres[index] ?? inputLocalFibre;

    return {
    tray,
    position: inputLocalFibre ?? outputLocalFibre ?? 1,
    inputCable: cleanCell(row?.[2]) || "EBCL",
    inputFibre: inputLocalFibre,
    outputCable: cleanCell(row?.[4]) || "Feeder",
    outputFibre: outputLocalFibre,
    status: cleanCell(row?.[6]) || "Through splice",
    notes: cleanCell(row?.[7]),
    };
  });
}

function parseMeetMeFibreRange(value: any): number[] {
  const text = cleanCell(value);
  if (!text) return [];

  const range = text.match(/F?\s*(\d{1,4})\s*-\s*F?\s*(\d{1,4})/i);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    }
  }

  const single = parseFibreNumber(value);
  return single === null ? [] : [single];
}

function normalizeMeetMeRows(rows: any[][]) {
  return rows.flatMap((row, rowIndex) =>
    readMeetMeRows(row, rowIndex).map((fields) => [
      cleanCell(row?.[0]) || "Meet Me Chamber",
      fields.tray,
      fields.inputCable,
      fields.inputFibre ?? "",
      fields.outputCable,
      fields.outputFibre ?? "",
      fields.status,
      fields.notes,
    ]),
  );
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

// =============================================================
// Joint upload allocation guard
// Uploaded joint sheets are allowed to feed fibre allocations only.
// Cable references in those sheets must not become DP/route authority.
// Cables remain map assets drawn/managed on the map, not spreadsheet-derived.
// =============================================================
function looksLikeCableReferenceCell(value: any): boolean {
  const text = cleanCell(value).toUpperCase();
  if (!text) return false;

  const compact = text.replace(/[\s_-]+/g, "");

  // Header / descriptor cells that explicitly describe cables.
  if (/\b(CABLE|FEEDER|LINK CABLE|THROUGH CABLE|PARENT CABLE|CABLE ID|CABLEID)\b/i.test(text)) {
    return true;
  }

  // Common cable naming patterns seen in uploaded patching sheets.
  if (/\b\d{1,3}\s*F\b/i.test(text) && /\b(ULW|CABLE|FEEDER|LINK|FIBRE|FIBER)\b/i.test(text)) {
    return true;
  }

  if (/\b(ULW|FEEDER|LINK)\s*\d{1,4}\b/i.test(text)) {
    return true;
  }

  if (/^(?:\d{1,3}F)?(?:ULW|FC|LC|LINK|FEEDER)\d{1,5}$/i.test(compact)) {
    return true;
  }

  return false;
}

function stripCableReferencesFromMappingRows(rows: any[][]): any[][] {
  return rows.map((row) =>
    Array.isArray(row)
      ? row.map((cell, index) => {
          // Keep the fibre number column intact. This is the allocation anchor.
          if (index === 1) return cell;

          return looksLikeCableReferenceCell(cell) ? "" : cell;
        })
      : row,
  );
}

function countRemovedCableReferenceCells(rawRows: any[][], allocationRows: any[][]): number {
  let removed = 0;

  rawRows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) return;
    row.forEach((cell, cellIndex) => {
      if (cellIndex === 1) return;
      if (cleanCell(cell) && cleanCell(allocationRows?.[rowIndex]?.[cellIndex]) === "") {
        removed += 1;
      }
    });
  });

  return removed;
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

function looksLikeMeetMeRows(rows: any[][]): boolean {
  const text = extractAllText(rows).join(" ").toUpperCase();
  const hasMeetMeName = text.includes("MEET ME") || text.includes("MEET-ME") || text.includes("MEETME");

  const hasFibreToFibreRows = rows.some((row) => {
    if (!Array.isArray(row)) return false;
    const { inputCable, inputFibre, outputCable, outputFibre } = readMeetMeRow(row, 0);
    const cableId = inputCable.toUpperCase();
    const feederCable = outputCable.toUpperCase();

    return Boolean(
      (cableId.includes("EBCL") || cableId.includes("E-BCL") || cableId.includes("BCL")) &&
        inputFibre !== null &&
        feederCable &&
        outputFibre !== null,
    );
  });

  return hasMeetMeName || hasFibreToFibreRows;
}

function detectJointTypeFromRows(rows: any[][]): EditorJointType {
  const text = extractAllText(rows).join(" ").toUpperCase();

  if (looksLikeMeetMeRows(rows)) {
    return "Meet Me Chamber";
  }

  if (text.includes("LMJ") || looksLikeStandardLmjRows(rows)) {
    return "LMJ (40 trays)";
  }

  if (text.includes("MMJ")) return "MMJ (20 trays)";
  return "CMJ (12 trays)";
}

function detectAssetTypeFromRows(rows: any[][]): EditorAssetType {
  const text = extractAllText(rows).join(" ").toUpperCase();

  if (text.includes("(PATCHING SC)") || text.includes("PATCHING SC")) {
    return "street-cab";
  }

  if (looksLikeMeetMeRows(rows)) {
    return "meet-me";
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

type MeetMeMoveTarget = {
  side: "input" | "output";
  tray: number;
  localFibre: number;
  fibreNo?: number;
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

  const [assetType, setAssetType] = useState<EditorAssetType>("ag-joint");
  const [loadedFileName, setLoadedFileName] = useState("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const [savedJoints, setSavedJoints] = useState<SavedJoint[]>([]);
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const lastFirebaseJsonRef = useRef("");
  const firebaseSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [jointType, setJointType] = useState<EditorJointType>("CMJ (12 trays)");
  const [model, setModel] = useState<FibreCell[]>(() =>
    buildJoint("CMJ (12 trays)"),
  );

  const [mappingRows, setMappingRows] = useState<any[][]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [moveMode, setMoveMode] = useState(false);
  const [moveSrc, setMoveSrc] = useState<FibreCell | null>(null);
  const [moveSrcMeetMeTarget, setMoveSrcMeetMeTarget] = useState<MeetMeMoveTarget | null>(null);
  const [selectedFibre, setSelectedFibre] = useState<number | null>(null);
  const [pendingFibreMoves, setPendingFibreMoves] = useState<PendingFibreMove[]>([]);
  const [showChangeReasonModal, setShowChangeReasonModal] = useState(false);

  const [trayFilter, setTrayFilter] = useState<number | "all">("all");
  const trayContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMobileEditor, setIsMobileEditor] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 1100 : false,
  );

  useEffect(() => {
    const update = () => setIsMobileEditor(window.innerWidth < 1100);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  const updateModel = (fn: (prev: FibreCell[]) => FibreCell[]) =>
    setModel((prev) => fn(prev.map((f) => ({ ...f }))));

  const standardJointType: JointTypeLabel = isStandardJointType(jointType) ? jointType : "LMJ (40 trays)";
  const cfg = JOINT_TYPES[standardJointType];
  const mobileEditorScale =
    isMobileEditor && typeof window !== "undefined"
      ? Math.min(0.8, Math.max(0.48, window.innerWidth / 1500))
      : 1;
  const saveSavedJointsToFirestoreNow = useCallback(
    async (nextSavedJoints: SavedJoint[]) => {
      const result = await saveMapAssetsViaCoordinator(nextSavedJoints, {
        reason: "fibre-tray-editor-immediate-save",
        source: "fibre-tray-editor",
      });
      lastFirebaseJsonRef.current = JSON.stringify(result.assets);
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
    if (spatialApiConfig.postgisOnly) {
      setFirebaseLoaded(true);
      setSavedJoints([]);
      return;
    }

    const ref = doc(db, ...FIRESTORE_REF_PATH, "mapAssets", "main");

    const unsub = onSnapshot(
      ref,
      async () => {
        try {
          const restored = await loadMapAssetsFromFirestore();

          const restoredJson = JSON.stringify(
            cleanSavedJointsForFirebase(restored),
          );
          lastFirebaseJsonRef.current = restoredJson;
          setSavedJoints((prev) => {
            const prevJson = JSON.stringify(cleanSavedJointsForFirebase(prev));
            return prevJson === restoredJson ? prev : restored;
          });
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
          const restoredJson = JSON.stringify(
            cleanSavedJointsForFirebase(restored),
          );
          lastFirebaseJsonRef.current = restoredJson;
          setSavedJoints((prev) => {
            const prevJson = JSON.stringify(cleanSavedJointsForFirebase(prev));
            return prevJson === restoredJson ? prev : restored;
          });
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

    IMPORTANT:
    This editor used to autosave the full map asset set whenever savedJoints
    changed. That caused duplicate chunk writes while JointMapManager and the
    map save coordinator were also saving the same bucket.

    Manual joint saves are still active through saveCurrentJoint().
    Mapping-file uploads also perform one explicit metadata save after the
    joint mapping chunks are written.
  ------------------------------------------------------------- */
  useEffect(() => {
    return () => {
      if (firebaseSaveTimerRef.current) {
        clearTimeout(firebaseSaveTimerRef.current);
      }
    };
  }, []);

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
    setMoveSrcMeetMeTarget(null);
    setSelectedFibre(null);
    setPendingFibreMoves([]);
    setTrayFilter("all");

    void createAssetAccessLog({
      asset: joint,
      context: "fibre-tray-editor",
    });

    const jt = (
      joint.jointType === "Meet Me Chamber"
        ? "Meet Me Chamber"
        : joint.jointType in JOINT_TYPES
          ? joint.jointType
          : "CMJ (12 trays)"
    ) as EditorJointType;

    const persistedTrayModel = isPersistedTrayModel((joint as any).trayModel)
      ? cloneTrayModel((joint as any).trayModel)
      : null;

    if (isStreetCab) {
      setAssetType("street-cab");
      setActiveView("editor");
    } else if (jt === "Meet Me Chamber") {
      setAssetType("meet-me");
      setJointType(jt);
      setModel(persistedTrayModel || buildJointForRows("LMJ (40 trays)", []));
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
      const displayRows = jt === "Meet Me Chamber" ? normalizeMeetMeRows(rows) : rows;

      setLoadedFileName(displayRows.length ? joint.name || "" : "");
      setMappingRows(displayRows);

      if (!isStreetCab && jt !== "Meet Me Chamber") {
        if (persistedTrayModel) {
          const expandedPersistedModel = expandTrayModelToFibreCount(
            persistedTrayModel,
            getMaxFibreNumberFromRows(displayRows),
            JOINT_TYPES[jt]?.fibresPerTray || 12,
          );

          setModel(
            applyStandardRowsToTrayModel(expandedPersistedModel, displayRows, {
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

      const rawRows = await loadMappingFile(file);
      const rows = stripCableReferencesFromMappingRows(rawRows);
      const removedCableReferenceCount = countRemovedCableReferenceCells(rawRows, rows);
      const detectedAssetType = detectAssetTypeFromRows(rows);
      const detectedJointType = detectJointTypeFromRows(rows);

      if (selectedJointId) {
        await saveJointMappingRowsToFirestore(selectedJointId, rows);

        const updatedSavedJoints = savedJoints.map((asset) => {
          if (asset.id !== selectedJointId) return asset;

          const isStreetCabAsset =
            asset.assetType === "street-cab" ||
            detectedAssetType === "street-cab";
          const isMeetMeAsset = detectedAssetType === "meet-me" || detectedJointType === "Meet Me Chamber";

          const nextAsset: any = {
            ...asset,
            // Preserve the map asset name exactly as the user set it.
            // Do not overwrite from spreadsheet contents.
            name: asset.name,
            assetType: isStreetCabAsset ? "street-cab" : "ag-joint",
            jointType: isStreetCabAsset ? "Street Cab" : isMeetMeAsset ? "Meet Me Chamber" : detectedJointType,
            mappingRowsRef: true,
            mappingRowsCount: rows.length,
            mappingRowsSummary: {
              rowCount: rows.length,
              sourceMode: "fibre-allocation-only",
              cableReferenceCellsIgnored: removedCableReferenceCount,
            },
            jointUploadMode: "fibre-allocation-only",
            cableReferencesIgnoredFromUpload: removedCableReferenceCount,
            importedFiles: [
              ...(asset.importedFiles || []),
              {
                name: file.name,
                importedAt: new Date().toISOString(),
                rowCount: rows.length,
                sourceMode: "fibre-allocation-only",
                cableReferenceCellsIgnored: removedCableReferenceCount,
              },
            ],
          };

          delete nextAsset.mappingRows;
          delete nextAsset.mappingRowsJson;
          return nextAsset as SavedJoint;
        });

        // Mapping rows are saved to:
        //   jointMappings/{jointId}/chunks
        //
        // The old debounced full-map autosave has been disabled to stop
        // duplicate Firestore writes. Save the selected joint metadata once
        // here so the upload still persists correctly.
        setSavedJoints(updatedSavedJoints);
        await saveSavedJointsToFirestoreNow(updatedSavedJoints);
      }
      setAssetType(
        selectedMapJoint?.assetType === "street-cab"
          ? "street-cab"
          : detectedAssetType,
      );
      const editorRows = detectedJointType === "Meet Me Chamber" ? normalizeMeetMeRows(rows) : rows;
      setMappingRows(editorRows);
      setTrayFilter("all");
      setSelectedFibre(null);
      setMoveSrc(null);
      setMoveSrcMeetMeTarget(null);
      setSearchTerm("");

      if (detectedJointType === "Meet Me Chamber") {
        const base = buildJointForRows("LMJ (40 trays)", editorRows);
        setJointType("Meet Me Chamber");
        setModel(base);
      } else if (detectedJointType === "LMJ (40 trays)") {
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

  const meetMeContinuityRows = useMemo(
    () => (jointType === "Meet Me Chamber" ? buildMeetMeContinuityRows(mappingRows) : []),
    [jointType, mappingRows],
  );

  const findCell = useCallback(
    (tray: number, pos: number) =>
      model.find((f) => f.tray === tray && f.pos === pos),
    [model],
  );

  /* -------------------------------------------------------------
    Move + click
  ------------------------------------------------------------- */
  const handleFibreClick = (cell: FibreCell, meetMeTarget?: MeetMeMoveTarget) => {
    if (moveMode) {
      if (!moveSrc) {
        setMoveSrc(cell);
        setMoveSrcMeetMeTarget(meetMeTarget ?? null);
        return;
      }

      if (moveSrc.globalNo === cell.globalNo) {
        setMoveSrc(null);
        setMoveSrcMeetMeTarget(null);
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

      setMappingRows((prevRows) => {
        if (jointType === "Meet Me Chamber") {
          if (moveSrcMeetMeTarget && meetMeTarget) {
            return swapMeetMeFibreRowsBetweenTargets(prevRows, moveSrcMeetMeTarget, meetMeTarget);
          }

          const meetMeSide =
            meetMeTarget?.side === "output" || moveSrcMeetMeTarget?.side === "output"
              ? "output"
              : meetMeTarget?.side === "input" || moveSrcMeetMeTarget?.side === "input"
                ? "input"
                : null;

          return meetMeSide
            ? swapMeetMeFibreRowsOnSide(prevRows, aNo, bNo, meetMeSide)
            : swapMeetMeFibreRows(prevRows, aNo, bNo);
        }

        return dedupeMappingRows(
              prevRows.map((row) => {
                const fibre = parseFibreNumber(row?.[1]);
                if (fibre !== aNo && fibre !== bNo) return row;

                const nextRow = [...row];
                nextRow[1] = fibre === aNo ? bNo : aNo;
                return nextRow;
              }),
            );
      });

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
      setMoveSrcMeetMeTarget(null);
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
    setMoveSrcMeetMeTarget(null);
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
    setMoveSrcMeetMeTarget(null);
    setTrayFilter("all");
    setLoadedFileName("");
    setOriginalFile(null);
    setSelectedJointId(null);
  };

  /* -------------------------------------------------------------
    Joint type change
  ------------------------------------------------------------- */
  const handleJointTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const jt = e.target.value as EditorJointType;
    setJointType(jt);
    setAssetType(jt === "Meet Me Chamber" ? "meet-me" : "ag-joint");
    setModel(jt === "Meet Me Chamber" ? buildJointForRows("LMJ (40 trays)", mappingRows) : buildJoint(jt));
    setMoveSrc(null);
    setMoveSrcMeetMeTarget(null);
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
  const trayH = 42;
  const trayGap = 12;
  const left = 118;
  const gap = 42;
  const top = 30;

  const renderedTrayCount = Math.max(
    cfg.trays,
    model.reduce((maxTray, cell) => Math.max(maxTray, cell.tray + 1), 0),
  );

  const visibleTrays =
    trayFilter === "all"
      ? Array.from({ length: renderedTrayCount }, (_, i) => i)
      : [trayFilter];

  const svgWidth = left + cfg.fibresPerTray * gap + 96;
  const svgHeight = top + visibleTrays.length * (trayH + trayGap) + 54;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "304px minmax(720px, 1fr) 392px",
        width: isMobileEditor ? 1500 : "100%",
        minWidth: isMobileEditor ? 1500 : undefined,
        height: isMobileEditor ? `${100 / mobileEditorScale}dvh` : "100vh",
        overflow: "hidden",
        background: "#07111f",
        color: "white",
        zoom: isMobileEditor ? mobileEditorScale : 1,
        WebkitOverflowScrolling: "touch",
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
          borderRight: "1px solid rgba(148, 163, 184, 0.16)",
          borderBottom: "none",
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          overflowY: "auto",
          background: "#08111f",
          flex: undefined,
          maxHeight: undefined,
        }}
      >
        <div style={editorHeroPanel}>
          <div style={editorKicker}>FIBRE OPERATIONS</div>
          <h1 style={editorTitle}>Fibre Tray Editor</h1>
          <div style={editorSubtleText}>
            {selectedMapJoint?.name || "No joint selected"}
          </div>
          <div style={editorPillRow}>
            <span style={editorStatusPill}>{jointType}</span>
            <span
              style={{
                ...editorStatusPill,
                borderColor: getBuildStatusColor((selectedMapJoint as any)?.buildStatus || "0-Backlog"),
                color: getBuildStatusColor((selectedMapJoint as any)?.buildStatus || "0-Backlog"),
              }}
            >
              {(selectedMapJoint as any)?.buildStatus || "0-Backlog"}
            </span>
          </div>
        </div>

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

        <div style={formSectionTitle}>Joint Setup</div>
        <label style={formLabel}>Asset Type</label>
        <div style={fieldNote}>
          <strong>Selected joint:</strong> {selectedMapJoint?.name || "None"}
        </div>
        <select
          value={assetType}
          onChange={(e) => {
            const nextAssetType = e.target.value as EditorAssetType;
            setAssetType(nextAssetType);
            if (nextAssetType === "meet-me") {
              setJointType("Meet Me Chamber");
              setModel(buildJointForRows("LMJ (40 trays)", mappingRows));
            } else if (nextAssetType === "ag-joint" && jointType === "Meet Me Chamber") {
              setJointType("CMJ (12 trays)");
              setModel(buildJoint("CMJ (12 trays)"));
            }
          }}
          style={formControl}
        >
          <option value="ag-joint">AG Joint</option>
          <option value="street-cab">Street Cab</option>
          <option value="meet-me">Meet Me Chamber</option>
        </select>

        {assetType !== "street-cab" && (
          <>
            <label style={formLabel}>Joint Type</label>
            <select
              value={jointType}
              onChange={handleJointTypeChange}
              style={formControl}
            >
              {(Object.keys(JOINT_TYPES) as JointTypeLabel[]).map((t) => (
                <option key={t}>{t}</option>
              ))}
              <option value="Meet Me Chamber">Meet Me Chamber</option>
            </select>

            {assetType === "ag-joint" && jointType !== "LMJ (40 trays)" && (
              <>
                <label style={formLabel}>Tray View</label>
                <select
                  value={trayFilter}
                  onChange={(e) => {
                    const value = e.target.value;
                    setTrayFilter(value === "all" ? "all" : Number(value));
                  }}
                  style={formControl}
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

        <div style={formSectionTitle}>Location</div>
        <label style={formLabel}>Location Description</label>

<input
  value={(selectedMapJoint as any)?.locationDescription || ""}
  onChange={(e) =>
    updateSelectedMapJointMetadata({
      locationDescription: e.target.value,
    })
  }
  placeholder="e.g. Footway outside 12 High Street"
  style={formControl}
/>

        <label style={formLabel}>Postcode</label>
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
          style={formControl}
        />
<label style={formLabel}>Build Status</label>
<select
  value={(selectedMapJoint as any)?.buildStatus || "0-Backlog"}
  onChange={(e) =>
    updateSelectedMapJointMetadata({
      buildStatus: e.target.value,
      status: e.target.value,
    })
  }
  style={formControl}
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
        <div style={formSectionTitle}>Mapping</div>
        <label style={formLabel}>Load Mapping File</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.xlm"
          onChange={handleLoadFile}
          style={fileInputStyle}
        />
        <button
          style={btnSecondary}
          onClick={() => {
            void saveCurrentJoint();
          }}
        >
          Save Joint
        </button>
        <label style={formLabel}>Convert LMJ Sheet</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.xlm"
          onChange={handleConvertLmjFile}
          style={fileInputStyle}
        />

        <div
          style={helperCard}
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

        <div style={formSectionTitle}>Find & Edit</div>
        <label style={formLabel}>Search</label>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="48FULW01, MIDJ04..."
          style={formControl}
        />

        <small style={fieldNote}>Matches: {searchMatches.size}</small>

        {assetType !== "street-cab" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button style={btnSecondary} onClick={() => setSearchTerm("")}>
              Clear Search
            </button>

            <button
              onClick={() => {
                setMoveMode(!moveMode);
                setMoveSrc(null);
                setMoveSrcMeetMeTarget(null);
              }}
              style={{
                ...btnSecondary,
                background: moveMode ? "#f97316" : "#14345f",
                borderColor: moveMode ? "rgba(251, 146, 60, 0.8)" : "rgba(96, 165, 250, 0.36)",
                color: "white",
              }}
            >
              Move {moveMode ? "ON" : "OFF"}
            </button>
          </div>
        )}

        {assetType !== "street-cab" && (
          <button style={btnDanger} onClick={handleClear}>
            Clear All Labels
          </button>
        )}

        <button style={btnDanger} onClick={handleClearSavedProject}>
          Clear Saved Project
        </button>

        {assetType !== "street-cab" && moveMode && (
          <div
            style={noticeCard}
          >
            {moveSrc
              ? `Selected source slot ${moveSrc.globalNo}. Click destination slot.`
              : "Move mode active. Click a source slot, then a destination slot."}
          </div>
        )}

        {assetType !== "street-cab" && selectedFibre !== null && (
          <div
            style={{
              ...selectedSummaryCard,
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
              ...selectedSummaryCard,
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
        <div
          style={{
            gridColumn: "2 / 4",
            minWidth: 0,
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <StreetCabEditor fileName={loadedFileName} rows={mappingRows} />
        </div>
      ) : (
        <>
          {/* MIDDLE PANEL */}
          <div
            ref={trayContainerRef}
            style={{
              padding: 16,
              overflow: "auto",
              background: "#07111f",
              minHeight: undefined,
              flex: undefined,
              WebkitOverflowScrolling: "touch",
            }}
          >
            <div style={trayWorkspacePanel}>
              <div style={trayWorkspaceHeader}>
                <div>
                  <div style={editorKicker}>TRAY CANVAS</div>
                  <h2 style={trayWorkspaceTitle}>{currentJointName}</h2>
                </div>
                <div style={trayStatsGrid}>
                  <InfoBadge label="Trays" value={renderedTrayCount} />
                  <InfoBadge label="Fibres" value={model.length} />
                  <InfoBadge label="Mapped" value={mappingRows.length} />
                </div>
              </div>

              <div style={trayCanvasSurface}>
                {jointType === "Meet Me Chamber" ? (
                  <MeetMeTrayView
                    model={model}
                    mappingRows={mappingRows}
                    searchMatches={searchMatches}
                    moveMode={moveMode}
                    moveSrc={moveSrc}
                    selectedFibre={selectedFibre}
                    onSelectFibre={setSelectedFibre}
                    onFibreClick={handleFibreClick}
                  />
                ) : jointType === "LMJ (40 trays)" ? (
                  <LMJTrayView
                    model={model}
                    searchMatches={searchMatches}
                    moveMode={moveMode}
                    moveSrc={moveSrc}
                    onFibreClick={handleFibreClick}
                  />
                ) : (
                  <svg width={svgWidth} height={svgHeight} style={{ minWidth: svgWidth }}>
                    {visibleTrays.map((tray, visibleIndex) => {
                      const y = top + visibleIndex * (trayH + trayGap);

                      return (
                        <g key={tray}>
                          <text
                            x={15}
                            y={y + trayH / 2 + 3}
                            fill="#cbd5e1"
                            fontSize={12}
                            fontWeight={800}
                          >
                            Tray {tray + 1}
                          </text>

                          <rect
                            x={left - 10}
                            y={y}
                            width={(cfg.fibresPerTray - 1) * gap + 42}
                            height={trayH}
                            fill={TRAY_COLOR}
                            stroke={TRAY_OUTLINE}
                            rx={7}
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
                                {highlight && (
                                  <circle
                                    cx={fx}
                                    cy={fy}
                                    r={22}
                                    fill="none"
                                    stroke="#fde68a"
                                    strokeWidth={3}
                                    opacity={0.9}
                                  />
                                )}
                                {isUsed && !isMoveSource && !highlight && (
                                  <circle
                                    cx={fx}
                                    cy={fy}
                                    r={23}
                                    fill="none"
                                    stroke="#020617"
                                    strokeWidth={3}
                                    opacity={0.9}
                                  />
                                )}
                                <circle
                                  cx={fx}
                                  cy={fy}
                                  r={isUsed ? 20 : 12}
                                  fill={fillColour}
                                  stroke={isMoveSource ? "#ffffff" : isUsed ? "#38bdf8" : "#334155"}
                                  strokeWidth={isMoveSource ? 4 : isUsed ? 3 : 1}
                                />

                                <text
                                  x={fx}
                                  y={fy + 3}
                                  textAnchor="middle"
                                  fontSize={isUsed ? 12 : 10}
                                  fontWeight="800"
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
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div
            style={{
              borderLeft: "1px solid rgba(148, 163, 184, 0.16)",
              borderTop: "none",
              padding: 14,
              overflow: "auto",
              background: "#08111f",
              minHeight: undefined,
              WebkitOverflowScrolling: "touch",
            }}
          >
            {jointType === "LMJ (40 trays)" ? (
              <LMJContinuityViewer
                model={model}
                selectedFibre={selectedFibre}
              />
            ) : (
              <ContinuityViewer
                model={model}
                selectedFibre={selectedFibre}
                extraRows={meetMeContinuityRows}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
};

function InfoBadge({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={infoBadge}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const editorHeroPanel: React.CSSProperties = {
  border: "1px solid rgba(96, 165, 250, 0.34)",
  background: "linear-gradient(180deg, rgba(15, 23, 42, 0.96), rgba(15, 23, 42, 0.72))",
  borderRadius: 10,
  padding: 12,
  display: "grid",
  gap: 7,
};

const editorKicker: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const editorTitle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 22,
  fontWeight: 950,
  lineHeight: 1.1,
};

const editorSubtleText: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 800,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const editorPillRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};

const editorStatusPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  border: "1px solid rgba(96, 165, 250, 0.36)",
  borderRadius: 999,
  padding: "3px 8px",
  color: "#bfdbfe",
  background: "rgba(37, 99, 235, 0.12)",
  fontSize: 11,
  fontWeight: 900,
};

const formSectionTitle: React.CSSProperties = {
  color: "#93c5fd",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  marginTop: 6,
};

const formLabel: React.CSSProperties = {
  color: "#e5e7eb",
  fontSize: 12,
  fontWeight: 850,
};

const formControl: React.CSSProperties = {
  width: "100%",
  minHeight: 34,
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(148, 163, 184, 0.24)",
  background: "#020617",
  color: "#f8fafc",
  boxSizing: "border-box",
  outline: "none",
};

const fileInputStyle: React.CSSProperties = {
  ...formControl,
  padding: "7px 9px",
  cursor: "pointer",
};

const fieldNote: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.35,
};

const helperCard: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: "#cbd5e1",
  background: "#0f1b2d",
  border: "1px solid rgba(148, 163, 184, 0.14)",
  padding: 10,
  borderRadius: 8,
};

const noticeCard: React.CSSProperties = {
  ...helperCard,
  color: "#fed7aa",
  background: "rgba(124, 45, 18, 0.28)",
  border: "1px solid rgba(251, 146, 60, 0.36)",
};

const selectedSummaryCard: React.CSSProperties = {
  ...helperCard,
  color: "#e0f2fe",
  background: "rgba(30, 64, 175, 0.22)",
  border: "1px solid rgba(96, 165, 250, 0.34)",
};

const trayWorkspacePanel: React.CSSProperties = {
  minHeight: "100%",
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr)",
  gap: 12,
};

const trayWorkspaceHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "#0f1b2d",
  borderRadius: 10,
  padding: "12px 14px",
};

const trayWorkspaceTitle: React.CSSProperties = {
  margin: "3px 0 0",
  color: "#f8fafc",
  fontSize: 20,
  fontWeight: 950,
};

const trayStatsGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(76px, 1fr))",
  gap: 8,
};

const infoBadge: React.CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 76,
  border: "1px solid rgba(96, 165, 250, 0.24)",
  background: "#07111f",
  borderRadius: 8,
  padding: "7px 9px",
  color: "#94a3b8",
  fontSize: 11,
};

const trayCanvasSurface: React.CSSProperties = {
  overflow: "auto",
  minHeight: 0,
  border: "1px solid rgba(148, 163, 184, 0.16)",
  background: "#0b1424",
  borderRadius: 10,
  padding: 14,
  boxShadow: "inset 0 0 0 1px rgba(255, 255, 255, 0.02)",
};

const btnSecondary: React.CSSProperties = {
  minHeight: 34,
  padding: "8px 10px",
  border: "1px solid rgba(96, 165, 250, 0.34)",
  background: "#14345f",
  color: "white",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 850,
};

const btnDanger: React.CSSProperties = {
  minHeight: 34,
  padding: "8px 10px",
  border: "1px solid rgba(248, 113, 113, 0.42)",
  background: "#7f1d1d",
  color: "white",
  borderRadius: 8,
  cursor: "pointer",
  fontWeight: 850,
};
