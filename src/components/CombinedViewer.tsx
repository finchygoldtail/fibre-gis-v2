import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

import JointMapManager, {
  type SavedMapAsset,
} from "./JointMapManager";

import {
  buildJoint,
  JOINT_TYPES,
  type JointTypeLabel,
  type FibreCell,
} from "../logic/jointConfig";

import {
  getColourForFibre,
  SEARCH_HIGHLIGHT,
  TRAY_COLOR,
  TRAY_OUTLINE,
} from "../logic/fibreColours";

import { loadMappingFile } from "../logic/mappingParser";
import * as XLSX from "xlsx";
import { convertLmjSheetToStandardRows } from "../logic/lmjSheetConverter";

// =====================================================
// HELPERS
// =====================================================

function cleanCell(v: any): string {
  if (v === null || v === undefined) return "";
  let s = String(v).trim();
  if (!s || s.toLowerCase() === "nan") return "";
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s;
}

function extractChain(row: any[]): string[] {
  const hops: string[] = [];

  const linkCable = cleanCell(row[0]);
  const linkFibre = cleanCell(row[1]);

  if (linkCable) {
    if (linkFibre) hops.push(`${linkCable} (${linkFibre})`);
    else hops.push(linkCable);
  }

  for (let i = 2; i < row.length; i += 3) {
    const cable = cleanCell(row[i]);
    const fibre = cleanCell(row[i + 1]);
    const end = cleanCell(row[i + 2]);

    if (!cable) continue;

    if (fibre) hops.push(`${cable} (${fibre})`);
    else hops.push(cable);

    if (end) hops.push(end);
  }

  return hops;
}

function chainForFibre(mappingRows: any[][], fibre: number): string {
  const row = mappingRows.find((r) => r.includes(fibre));
  if (!row) return "No continuity path found.";
  return extractChain(row).join(" → ");
}

function isJointTypeLabel(value: string): value is JointTypeLabel {
  return Object.keys(JOINT_TYPES).includes(value);
}

function cleanForFirebase(value: SavedMapAsset[]): any[] {
  return value.map((asset: any) => {
    const copy = { ...asset };

    if (Array.isArray(copy.mappingRows)) {
      copy.mappingRowsJson = JSON.stringify(copy.mappingRows);
      delete copy.mappingRows;
    }

    return JSON.parse(JSON.stringify(copy));
  });
}

function parseSavedJointsFromFirestore(data: any): SavedMapAsset[] {
  return Array.isArray(data?.savedJoints)
    ? data.savedJoints.map((asset: any) => ({
        ...asset,
        mappingRows: asset.mappingRowsJson
          ? JSON.parse(asset.mappingRowsJson)
          : asset.mappingRows || [],
      }))
    : [];
}

function withTracking(asset: SavedMapAsset, isNew: boolean): SavedMapAsset {
  const user = auth.currentUser;
  const now = new Date().toISOString();

  return {
    ...asset,
    ...(isNew
      ? {
          createdAt: (asset as any).createdAt || now,
          createdByUid: (asset as any).createdByUid || user?.uid || "unknown",
          createdByEmail:
            (asset as any).createdByEmail || user?.email || "unknown",
        }
      : {}),
    updatedAt: now,
    updatedByUid: user?.uid || "unknown",
    updatedByEmail: user?.email || "unknown",
  } as SavedMapAsset;
}

// =====================================================
// COMPONENT
// =====================================================

const CombinedViewer: React.FC = () => {
  // =====================================================
  // STATE: VIEW MODE
  // =====================================================

  const [view, setView] = useState<"map" | "splice">("map");

  // =====================================================
  // STATE: JOINTS / FIREBASE
  // =====================================================

  const [savedJoints, setSavedJoints] = useState<SavedMapAsset[]>([]);
  const [firebaseLoaded, setFirebaseLoaded] = useState(false);
  const lastSavedJsonRef = useRef("");

  // =====================================================
  // STATE: SELECTED JOINT
  // =====================================================

  const [selectedJoint, setSelectedJoint] = useState<SavedMapAsset | null>(
    null
  );

  const [jointType, setJointType] =
    useState<JointTypeLabel>("CMJ (12 trays)");

  const [model, setModel] = useState<FibreCell[]>(() =>
    buildJoint("CMJ (12 trays)")
  );

  const cfg = JOINT_TYPES[jointType];

  // =====================================================
  // STATE: MAPPING / SEARCH / CHAIN VIEW
  // =====================================================

  const [mappingRows, setMappingRows] = useState<any[][]>([]);
  const [selectedFibre, setSelectedFibre] = useState<number | null>(null);

  const [chainText, setChainText] = useState(
    "Create or select a joint from the map, then load a file."
  );

  const [searchTerm, setSearchTerm] = useState("");

  // =====================================================
  // FIREBASE LOAD — SHARED BUSINESS NETWORK
  // =====================================================

  useEffect(() => {
    const ref = doc(db, "businesses", "fibre-gis-v2");

    const unsub = onSnapshot(
      ref,
      async (snap) => {
        if (snap.exists()) {
          const loadedJoints = parseSavedJointsFromFirestore(snap.data());

          lastSavedJsonRef.current = JSON.stringify(
            cleanForFirebase(loadedJoints)
          );

          setSavedJoints(loadedJoints);
        } else {
          const now = new Date().toISOString();

          await setDoc(
            ref,
            {
              savedJoints: [],
              createdAt: now,
              updatedAt: now,
              syncRevision: now,
              updatedByUid: auth.currentUser?.uid || "unknown",
              updatedByEmail: auth.currentUser?.email || "unknown",
            },
            { merge: true }
          );

          lastSavedJsonRef.current = JSON.stringify([]);
          console.log("Created Firestore document: businesses/fibre-gis-v2");
        }

        setFirebaseLoaded(true);
      },
      (err) => {
        console.error("Firebase load failed:", err);
        setFirebaseLoaded(true);
      }
    );

    return () => unsub();
  }, []);

  // =====================================================
  // FIREBASE REFRESH — MOBILE / TABLET SAFETY NET
  // =====================================================

  useEffect(() => {
    const refreshFromFirestore = async () => {
      try {
        const ref = doc(db, "businesses", "fibre-gis-v2");
        const snap = await getDoc(ref);
        if (!snap.exists()) return;

        const loadedJoints = parseSavedJointsFromFirestore(snap.data());

        lastSavedJsonRef.current = JSON.stringify(
          cleanForFirebase(loadedJoints)
        );

        setSavedJoints(loadedJoints);
      } catch (err) {
        console.error("Firebase refresh failed:", err);
      }
    };

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        void refreshFromFirestore();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, []);

  // =====================================================
  // FIREBASE AUTO SAVE — LOOP SAFE
  // =====================================================

  useEffect(() => {
    if (!firebaseLoaded) return;

    const cleanedJoints = cleanForFirebase(savedJoints);
    const json = JSON.stringify(cleanedJoints);

    if (json === lastSavedJsonRef.current) return;

    lastSavedJsonRef.current = json;

    const ref = doc(db, "businesses", "fibre-gis-v2");
    const user = auth.currentUser;
    const now = new Date().toISOString();

    setDoc(
      ref,
      {
        savedJoints: cleanedJoints,
        updatedAt: now,
        syncRevision: now,
        updatedByUid: user?.uid || "unknown",
        updatedByEmail: user?.email || "unknown",
      },
      { merge: true }
    ).catch((err) => {
      console.error("Firebase save failed:", err);
    });
  }, [savedJoints, firebaseLoaded]);

  // =====================================================
  // ACTION: OPEN JOINT FROM MAP
  // =====================================================

  function openJoint(joint: SavedMapAsset) {
    setSavedJoints((prev) => {
      const exists = prev.some((j) => j.id === joint.id);
      if (exists) return prev;

      return [...prev, withTracking(joint, true)];
    });

    setSelectedJoint(joint);

    const jt = joint.jointType || "CMJ (12 trays)";
    const safeType: JointTypeLabel = isJointTypeLabel(jt)
      ? jt
      : "CMJ (12 trays)";

    setJointType(safeType);
    setModel(buildJoint(safeType));

    const rows = Array.isArray(joint.mappingRows)
      ? (joint.mappingRows as any[][])
      : [];

    setMappingRows(rows);
    setSelectedFibre(null);
    setSearchTerm("");

    setChainText(
      rows.length
        ? `Loaded ${rows.length} continuity rows for ${joint.name}. Click any fibre to view the chain.`
        : `${joint.name} selected. Load a mapping file to add splice data.`
    );

    setView("splice");
  }

  // =====================================================
  // ACTION: BACK TO MAP
  // =====================================================

  function backToMap() {
    setView("map");
    setSelectedJoint(null);
    setSelectedFibre(null);
  }

  // =====================================================
  // ACTION: LOAD MAPPING FILE
  // =====================================================

  const handleLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedJoint) return;

    try {
      const rows = await loadMappingFile(file);
      setMappingRows(rows);

      setModel((prev) =>
        prev.map((f) => {
          const match = rows.find((r) => r[1] === f.globalNo);
          return match
            ? { ...f, label: cleanCell(match[0]) }
            : { ...f, label: "" };
        })
      );

      const updatedJoint = withTracking(
        {
          ...selectedJoint,
          mappingRows: rows,
          importedFiles: [
            ...(((selectedJoint as any).importedFiles || []) as any[]),
            {
              name: file.name,
              importedAt: new Date().toISOString(),
              rowCount: rows.length,
              importedByUid: auth.currentUser?.uid || "unknown",
              importedByEmail: auth.currentUser?.email || "unknown",
            },
          ],
        } as SavedMapAsset,
        false
      );

      setSelectedJoint(updatedJoint);

      setSavedJoints((prev) =>
        prev.map((j) => (j.id === updatedJoint.id ? updatedJoint : j))
      );

      setChainText(
        `Loaded ${rows.length} continuity rows into ${selectedJoint.name}. Click any fibre to view the chain.`
      );

      e.target.value = "";
    } catch (err: any) {
      alert("Error loading mapping file: " + err.message);
    }
  };

  // =====================================================
  // ACTION: CONVERT LMJ SHEET ONLY
  // This does NOT load data into the joint.
  // It creates a clean standard Excel file for upload.
  // Supports CSV, XLS, XLSX, XLSM, and XLM-style file extensions.
  // =====================================================

  const handleConvertLmjFile = async (
    e: React.ChangeEvent<HTMLInputElement>
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

      const firstSheetName = workbook.SheetNames[0];
      const firstSheet = workbook.Sheets[firstSheetName];

      if (!firstSheet) {
        throw new Error("No worksheet found in this file.");
      }

      const sourceRows = XLSX.utils.sheet_to_json(firstSheet, {
        header: 1,
        defval: "",
        raw: false,
      }) as any[][];

      const convertedRows = convertLmjSheetToStandardRows(sourceRows);

      if (!convertedRows.length) {
        throw new Error("No LMJ rows could be converted from this file.");
      }

      const outputSheet = XLSX.utils.aoa_to_sheet(convertedRows);
      const outputWorkbook = XLSX.utils.book_new();

      XLSX.utils.book_append_sheet(outputWorkbook, outputSheet, "LMJ_CONVERTED");

      const originalName = file.name.replace(/\.[^.]+$/, "");
      XLSX.writeFile(outputWorkbook, `${originalName}_LMJ_CONVERTED.xlsx`);
    } catch (err: any) {
      alert("LMJ conversion failed: " + (err?.message || String(err)));
    }

    e.target.value = "";
  };

  // =====================================================
  // DERIVED: SEARCH MATCHES
  // =====================================================

  const searchMatches = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return new Set<number>();

    const set = new Set<number>();

    mappingRows.forEach((row) => {
      row.forEach((cell) => {
        if (cell && String(cell).toLowerCase().includes(s)) {
          row.forEach((v) => {
            if (typeof v === "number") set.add(v);
          });
        }
      });
    });

    return set;
  }, [searchTerm, mappingRows]);

  // =====================================================
  // DERIVED: FIBRE LOOKUPS
  // =====================================================

  const findCell = useCallback(
    (tray: number, pos: number) =>
      model.find((f) => f.tray === tray && f.pos === pos),
    [model]
  );

  const selectedCell = selectedFibre
    ? model.find((f) => f.globalNo === selectedFibre)
    : null;

  const selectedRow = selectedFibre
    ? mappingRows.find((r) => r.includes(selectedFibre))
    : null;

  // =====================================================
  // ACTION: FIBRE CLICK
  // =====================================================

  const handleFibreClick = (cell: FibreCell) => {
    setSelectedFibre(cell.globalNo);

    if (mappingRows.length === 0) {
      setChainText("No continuity data loaded.");
      return;
    }

    const chain = chainForFibre(mappingRows, cell.globalNo);
    setChainText(chain);
  };

  // =====================================================
  // SVG LAYOUT SETTINGS
  // =====================================================

  const trayH = 26;
  const trayGap = 6;
  const left = 90;
  const gap = 26;
  const top = 20;

  const svgWidth = left + cfg.fibresPerTray * gap + 60;
  const svgHeight = top + cfg.trays * (trayH + trayGap) + 40;

  // =====================================================
  // RENDER: MAP SCREEN
  // =====================================================

  if (view === "map") {
    return (
      <JointMapManager
        currentJointName=""
        currentJointType="LMJ (40 trays)"
        currentMappingRows={[]}
        savedJoints={savedJoints}
        setSavedJoints={setSavedJoints}
        onClose={() => {}}
        onOpenJoint={openJoint}
      />
    );
  }

  // =====================================================
  // RENDER: SPLICE SCREEN
  // This is the screen with:
  // LEFT   = joint controls
  // CENTRE = tray/fibre drawing
  // RIGHT  = chain viewer
  // =====================================================

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr 500px",
        height: "100vh",
        overflow: "hidden",
        background: "#111827",
        color: "white",
      }}
    >
      {/* =====================================================
          LEFT PANEL: JOINT INFO / FILE UPLOAD / SEARCH
          ===================================================== */}
      <div
        style={{
          padding: "1rem",
          borderRight: "1px solid #374151",
          overflowY: "auto",
          background: "#111827",
          color: "white",
        }}
      >
        <button onClick={backToMap} style={{ marginBottom: "1rem" }}>
          ← Back to Joint Map
        </button>

        <h2>{selectedJoint?.name || "Joint"} Splicing View</h2>

        {selectedJoint && (
          <div style={{ fontSize: "0.8rem", marginBottom: "1rem" }}>
            <div>
              <strong>Last edited by:</strong>{" "}
              {(selectedJoint as any).updatedByEmail || "Unknown"}
            </div>

            <div>
              <strong>Last edited:</strong>{" "}
              {(selectedJoint as any).updatedAt || "Unknown"}
            </div>

            <div>
              <strong>Created by:</strong>{" "}
              {(selectedJoint as any).createdByEmail || "Unknown"}
            </div>
          </div>
        )}

        <label>Load Mapping File</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.xlm"
          onChange={handleLoadFile}
          style={{
            width: "100%",
            marginBottom: "1rem",
            color: "white",
          }}
        />

        {/* =====================================================
            LMJ CONVERTER: CLEAN SUPPLIER SHEETS
            This downloads a converted file.
            It does not import into the selected joint automatically.
            ===================================================== */}
        <label>Convert LMJ Sheet</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm,.xlm"
          onChange={handleConvertLmjFile}
          style={{
            width: "100%",
            marginBottom: "0.5rem",
            color: "white",
          }}
        />

        <div
          style={{
            fontSize: "0.78rem",
            color: "#9ca3af",
            marginBottom: "1rem",
          }}
        >
          Use this for supplier LMJ sheets with different layouts. It will
          download a clean converted Excel file, then you can upload that file
          above as the mapping file.
        </div>

        <label>Search</label>
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: "100%",
            padding: "0.4rem",
            background: "#0f172a",
            color: "white",
            border: "1px solid #374151",
          }}
          placeholder="Search cable, joint, fibre..."
        />

        <small>Matches: {searchMatches.size}</small>

        <hr style={{ borderColor: "#374151" }} />

        <h3>Selected Fibre Info</h3>

        {selectedCell ? (
          <>
            <p>
              <strong>Fibre:</strong> {selectedCell.globalNo}
            </p>
            <p>
              <strong>Tray:</strong> {selectedCell.tray + 1}
            </p>
            <p>
              <strong>Pos:</strong> {selectedCell.pos + 1}
            </p>
            <p>
              <strong>Label:</strong> {selectedCell.label || "(none)"}
            </p>
            <p>
              <strong>Colour:</strong> {getColourForFibre(selectedCell.pos)}
            </p>
          </>
        ) : (
          <p>No fibre selected.</p>
        )}

        {selectedRow && (
          <>
            <h3>Raw XLSM Row</h3>
            <pre
              style={{
                fontSize: "11px",
                whiteSpace: "pre-wrap",
                background: "#0f172a",
                color: "white",
                padding: "0.5rem",
                borderRadius: "6px",
              }}
            >
              {JSON.stringify(selectedRow, null, 2)}
            </pre>
          </>
        )}
      </div>

      {/* =====================================================
          CENTRE PANEL: TRAY / FIBRE SVG DRAWING
          This is the main white area you wanted black.
          ===================================================== */}
      <div
        style={{
          overflow: "auto",
          padding: "1rem",
          background: "#111827",
          minHeight: "100vh",
        }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          style={{
            background: "#111827",
            display: "block",
          }}
        >
          {Array.from({ length: cfg.trays }, (_, tray) => {
            const y = top + tray * (trayH + trayGap);

            return (
              <g key={tray}>
                <text
                  x={15}
                  y={y + trayH / 2 + 3}
                  fontSize={10}
                  fill="#e5e7eb"
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
                  const match = searchMatches.has(cell.globalNo);

                  return (
                    <circle
                      key={pos}
                      cx={fx}
                      cy={fy}
                      r={6}
                      fill={match ? SEARCH_HIGHLIGHT : getColourForFibre(pos)}
                      stroke="#333"
                      onClick={() => handleFibreClick(cell)}
                      style={{ cursor: "pointer" }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* =====================================================
          RIGHT PANEL: CHAIN VIEWER
          ===================================================== */}
      <div
        style={{
          borderLeft: "1px solid #374151",
          padding: "1rem",
          overflowY: "auto",
          background: "#111827",
          color: "white",
        }}
      >
        <h2>Chain Viewer</h2>

        <textarea
          value={chainText}
          readOnly
          style={{
            width: "100%",
            height: "95%",
            resize: "none",
            fontFamily: "monospace",
            fontSize: "14px",
            padding: "0.75rem",
            whiteSpace: "pre-wrap",
            background: "#0f172a",
            color: "white",
            border: "1px solid #374151",
          }}
        />
      </div>
    </div>
  );
};

export default CombinedViewer;