import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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

import { exportLmjExcelInPlace } from "../logic/exportLmjExcel";
import { exportAgExcelInPlace } from "../logic/exportAgExcel";
import { exportStreetCabExcelInPlace } from "../logic/exportStreetCabExcel";

import { ContinuityViewer } from "./ContinuityViewer";
import { LMJContinuityViewer } from "./LMJContinuityViewer";
import LMJTrayView from "./LMJTrayView";
import MapView from "./MapView";
import NetworkTreeView from "./NetworkTreeView";
import JointMapManager, { type SavedJoint } from "./JointMapManager";
import StreetCabEditor from "./StreetCabEditor";

/* -------------------------------------------------------------
  Persistence
------------------------------------------------------------- */
const STORAGE_KEY = "fibre-tray-project-v1";

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
  return rows.flat().map((v) => cleanCell(v)).filter(Boolean);
}

function detectJointTypeFromRows(rows: any[][]): JointTypeLabel {
  const text = extractAllText(rows).join(" ").toUpperCase();

  if (text.includes("LMJ")) return "LMJ (40 trays)";
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

/* -------------------------------------------------------------
  MAIN COMPONENT
------------------------------------------------------------- */
export const FibreTrayEditor: React.FC = () => {
  const [activeView, setActiveView] = useState<
    "editor" | "map" | "network" | "joint-map"
  >("joint-map");

  const [assetType, setAssetType] = useState<"ag-joint" | "street-cab">(
    "ag-joint"
  );
  const [loadedFileName, setLoadedFileName] = useState("");
  const [originalFile, setOriginalFile] = useState<File | null>(null);

  const [savedJoints, setSavedJoints] = useState<SavedJoint[]>([]);
  const [selectedJointId, setSelectedJointId] = useState<string | null>(null);

  const [jointType, setJointType] =
    useState<JointTypeLabel>("CMJ (12 trays)");
  const [model, setModel] = useState<FibreCell[]>(() =>
    buildJoint("CMJ (12 trays)")
  );

  const [mappingRows, setMappingRows] = useState<any[][]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [moveMode, setMoveMode] = useState(false);
  const [moveSrc, setMoveSrc] = useState<FibreCell | null>(null);
  const [selectedFibre, setSelectedFibre] = useState<number | null>(null);

  const [trayFilter, setTrayFilter] = useState<number | "all">("all");
  const trayContainerRef = useRef<HTMLDivElement | null>(null);

  const updateModel = (fn: (prev: FibreCell[]) => FibreCell[]) =>
    setModel((prev) => fn(prev.map((f) => ({ ...f }))));

  const cfg = JOINT_TYPES[jointType];

  const selectedMapJoint = selectedJointId
    ? savedJoints.find((j) => j.id === selectedJointId) || null
    : null;

  const currentJointName =
    selectedMapJoint?.name ||
    (mappingRows.length > 0
      ? deriveJointNameFromRows(mappingRows)
      : "UNKNOWN-JOINT");

  /* -------------------------------------------------------------
    Load persisted project
  ------------------------------------------------------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed: PersistedProject = JSON.parse(raw);

      if (parsed.assetType === "ag-joint" || parsed.assetType === "street-cab") {
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
    Persist project
  ------------------------------------------------------------- */
  useEffect(() => {
    try {
      const project: PersistedProject = {
        assetType,
        jointType,
        model,
        mappingRows,
        savedJoints,
        selectedFibre,
        loadedFileName,
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
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
    targetJointType: JointTypeLabel
  ) => {
    const base = buildJoint(targetJointType);

    if (targetJointType === "LMJ (40 trays)") {
      applyLmjRowsToModel(rows, base, (row) => extractChain(row).join(" → "));
    } else {
      rows.forEach((row: any[]) => {
        const fibre = row[1];
        const fullChain = extractChain(row).join(" → ");

        if (typeof fibre === "number") {
          const cell = base.find((f) => f.globalNo === fibre);
          if (cell) cell.label = fullChain;
        }
      });
    }

    setModel(base);
  };

  /* -------------------------------------------------------------
    Open saved asset
  ------------------------------------------------------------- */
  const openSavedJoint = (joint: SavedJoint) => {
    const isStreetCab = joint.assetType === "street-cab";
    const rows = joint.mappingRows || [];

    setSelectedJointId(joint.id);
    setLoadedFileName(rows.length ? joint.name || "" : "");
    setMappingRows(rows);
    setSearchTerm("");
    setMoveMode(false);
    setMoveSrc(null);
    setSelectedFibre(null);
    setTrayFilter("all");

    if (isStreetCab) {
      setAssetType("street-cab");
      setActiveView("editor");
      return;
    }

    const jt = (joint.jointType in JOINT_TYPES
      ? joint.jointType
      : "CMJ (12 trays)") as JointTypeLabel;

    setAssetType("ag-joint");
    setJointType(jt);
    if (rows.length > 0) {
      applyMappingRowsToModel(rows, jt);
    } else {
      setModel(buildJoint(jt));
    }
    setActiveView("editor");
  };

  /* -------------------------------------------------------------
    Load mapping file
  ------------------------------------------------------------- */
  const handleLoadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setOriginalFile(file);
      setLoadedFileName(selectedMapJoint ? `${selectedMapJoint.name} - ${file.name}` : file.name);

      const rows = await loadMappingFile(file);
      const detectedAssetType = detectAssetTypeFromRows(rows);
      const detectedJointType = detectJointTypeFromRows(rows);

      if (selectedJointId) {
        setSavedJoints((prev) =>
          prev.map((asset) => {
            if (asset.id !== selectedJointId) return asset;
            return {
              ...asset,
              assetType: asset.assetType || detectedAssetType,
              jointType:
                asset.assetType === "street-cab" ? "Street Cab" : detectedJointType,
              mappingRows: rows,
              importedFiles: [
                ...(asset.importedFiles || []),
                {
                  name: file.name,
                  importedAt: new Date().toISOString(),
                  rowCount: rows.length,
                },
              ],
            };
          })
        );
      }
      setAssetType(selectedMapJoint?.assetType === "street-cab" ? "street-cab" : detectedAssetType);
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
        const base = buildJoint(detectedJointType);

        rows.forEach((row: any[]) => {
          const fibre = row[1];
          const fullChain = extractChain(row).join(" → ");

          if (typeof fibre === "number") {
            const cell = base.find((f) => f.globalNo === fibre);
            if (cell) cell.label = fullChain;
          }
        });

        setJointType(detectedJointType);
        setModel(base);
      }

      e.target.value = "";
    } catch (err: any) {
      console.error(err);
      alert("Failed to load file: " + err.message);
    }
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
    [model]
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

      updateModel((prev) => {
        const a = prev.find((f) => f.globalNo === aNo);
        const b = prev.find((f) => f.globalNo === bNo);
        if (!a || !b) return prev;

        [a.label, b.label] = [b.label, a.label];
        return prev;
      });

      setMoveSrc(null);
      return;
    }

    setSelectedFibre(cell.globalNo);
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
  const handleJointTypeChange = (
    e: React.ChangeEvent<HTMLSelectElement>
  ) => {
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

  const visibleTrays =
    trayFilter === "all"
      ? Array.from({ length: cfg.trays }, (_, i) => i)
      : [trayFilter];

  const svgWidth = left + cfg.fibresPerTray * gap + 60;
  const svgHeight = top + visibleTrays.length * (trayH + trayGap) + 40;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "320px 1fr 420px",
        height: "100vh",
      }}
    >
      {/* LEFT PANEL */}
      <div
        style={{
          borderRight: "1px solid #444",
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <button style={btnSecondary} onClick={() => setActiveView("map")}>
          Open Map
        </button>

        <button style={btnSecondary} onClick={() => setActiveView("network")}>
          Full Network Map
        </button>

        <button style={btnSecondary} onClick={() => setActiveView("joint-map")}>
          Joint Map Manager
        </button>

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
                  {Array.from({ length: cfg.trays }, (_, i) => (
                    <option key={i + 1} value={i}>
                      Tray {i + 1}
                    </option>
                  ))}
                </select>
              </>
            )}
          </>
        )}

        <label>Load Mapping File</label>
        <input
          type="file"
          accept=".csv,.xls,.xlsx,.xlsm"
          onChange={handleLoadFile}
        />

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
            style={{ padding: "1rem", overflow: "auto" }}
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
              borderLeft: "1px solid #444",
              padding: "1rem",
              overflow: "auto",
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