import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import type { SavedMapAsset } from "../../map/types";

export type FasSbRouteImportRoute = {
  id: string;
  fromSbName: string;
  toSbName: string;
  parentFibres: number[];
  localFibres: number[];
  supportingCableName?: string;
  source?: "fas-import" | "manual";
  note?: string;
};

export type FasSbRouteImportRequest = {
  routes: FasSbRouteImportRoute[];
  note: string;
  replaceImportedRoutes: boolean;
};

type Props = {
  projectAssets: SavedMapAsset[];
  onApplySbRouteAssignments?: (request: FasSbRouteImportRequest) => void | Promise<void>;
};

const panel: React.CSSProperties = {
  background: "#0f1b2d",
  border: "1px solid rgba(56,189,248,0.28)",
  borderRadius: 10,
  padding: 16,
  minHeight: 190,
  gridColumn: "span 2",
};

const title: React.CSSProperties = { margin: "0 0 12px", fontSize: 15, fontWeight: 900, color: "#e5e7eb" };
const muted: React.CSSProperties = { color: "#94a3b8", fontSize: 12, lineHeight: 1.45 };
const button: React.CSSProperties = { border: "1px solid rgba(14,165,233,0.35)", background: "#0284c7", color: "#f8fafc", borderRadius: 8, padding: "10px 12px", fontWeight: 900, cursor: "pointer" };
const smallBox: React.CSSProperties = { background: "#0b1424", border: "1px solid rgba(148,163,184,0.16)", borderRadius: 10, padding: 12 };

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normaliseRef(value: unknown): string {
  return text(value).toUpperCase().replace(/[–—]/g, "-").replace(/[^A-Z0-9]/g, "");
}

function stripSplitterPort(value: unknown): string {
  return text(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/-SP\s*\d+\b/i, "")
    .replace(/\s+/g, "");
}

function parseFibre(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  const match = text(value).match(/\d+/);
  if (!match) return null;
  const next = Number(match[0]);
  return Number.isFinite(next) && next > 0 ? Math.floor(next) : null;
}

function looksLikeCable(value: unknown): boolean {
  const raw = text(value).toUpperCase();
  return /(\d+\s*F|FULW|ULW|LC\d|CABLE|FEEDER|LINK)/i.test(raw) && !/\bSB\s*\d/i.test(raw);
}

function looksLikeSb(value: unknown): boolean {
  return /\b[A-Z]{2,4}-[A-Z]{2,6}-AG\d+-SB\d+|\bSB\s*\d+|\bSB\d+/i.test(text(value));
}

function looksLikeRouteEndpoint(value: unknown): boolean {
  const raw = text(value);
  return looksLikeSb(raw) || /\b(?:MIDJ|MID J|CMJ|MMJ|LMJ|DP)\s*\d+/i.test(raw);
}

function routeKey(route: Omit<FasSbRouteImportRoute, "id">): string {
  return [route.fromSbName, route.toSbName, route.supportingCableName || "supporting-cable-not-set"]
    .map(normaliseRef)
    .join("__");
}

function getAssetName(asset: SavedMapAsset): string {
  const item = asset as any;
  return String(item.name || item.jointName || item.label || item.assetId || item.id || "");
}

function isDp(asset: SavedMapAsset): boolean {
  const item = asset as any;
  if (asset.geometry?.type === "LineString") return false;
  const haystack = [item.assetType, item.type, item.jointType, item.dpType, item.closureType, item.name, item.label]
    .map(text)
    .join(" ")
    .toUpperCase();
  return haystack.includes("DISTRIBUTION") || haystack.includes("AFN") || haystack.includes("CBT") || haystack.includes("MDU") || /\bSB\s*\d+|SB\d+/.test(haystack);
}

function findDpForSb(projectAssets: SavedMapAsset[], sbName: string): SavedMapAsset | null {
  const wanted = normaliseRef(stripSplitterPort(sbName));
  if (!wanted) return null;
  return projectAssets.find((asset) => {
    if (!isDp(asset)) return false;
    const candidates = [asset.id, (asset as any).assetId, getAssetName(asset), (asset as any).label]
      .map((value) => normaliseRef(stripSplitterPort(value)))
      .filter(Boolean);
    return candidates.some((candidate) => candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate));
  }) || null;
}

function parseRoutesFromWorkbook(workbook: XLSX.WorkBook): FasSbRouteImportRoute[] {
  const grouped = new Map<string, FasSbRouteImportRoute>();

  workbook.SheetNames.forEach((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "", blankrows: false });

    rows.forEach((row) => {
      const groups: { cable: string; fibre: number; endpoint: string }[] = [];
      let linkFibre: number | null = null;

      if (/^link cable$/i.test(text(row[0])) || /^link fibre$/i.test(text(row[1]))) {
        return;
      }

      if (/link/i.test(text(row[0]))) {
        linkFibre = parseFibre(row[1]);
      }

      for (let index = 0; index <= row.length - 3; index += 1) {
        const cable = text(row[index]);
        const fibre = parseFibre(row[index + 1]);
        const endpoint = stripSplitterPort(row[index + 2]);

        if (!looksLikeCable(cable) || fibre === null || !looksLikeRouteEndpoint(endpoint)) continue;
        groups.push({ cable, fibre, endpoint });
      }

      groups.forEach((child, index) => {
        if (!looksLikeSb(child.endpoint)) return;

        const upstream = index > 0 ? groups[index - 1] : null;
        const fromName = upstream?.endpoint || text(row[0]) || "FAS Link Cable";
        const parentFibre = upstream?.fibre || linkFibre || child.fibre;

        if (!fromName || !child.endpoint) return;
        if (normaliseRef(fromName) === normaliseRef(child.endpoint)) return;

        const partial = {
          fromSbName: stripSplitterPort(fromName),
          toSbName: child.endpoint,
          parentFibres: [parentFibre],
          localFibres: [child.fibre],
          supportingCableName: child.cable,
          source: "fas-import" as const,
          note: `${stripSplitterPort(fromName)} feeds ${child.endpoint} from FAS import`,
        };

        const key = routeKey(partial);
        const existing = grouped.get(key);
        if (existing) {
          existing.parentFibres = Array.from(new Set([...existing.parentFibres, parentFibre])).sort((a, b) => a - b);
          existing.localFibres = Array.from(new Set([...existing.localFibres, child.fibre])).sort((a, b) => a - b);
        } else {
          grouped.set(key, { ...partial, id: `fas_${key}` });
        }
      });
    });
  });

  return Array.from(grouped.values()).sort((a, b) => a.toSbName.localeCompare(b.toSbName, undefined, { numeric: true }) || a.fromSbName.localeCompare(b.fromSbName, undefined, { numeric: true }));
}

export default function FasSbRouteImportPanel({ projectAssets, onApplySbRouteAssignments }: Props) {
  const [routes, setRoutes] = useState<FasSbRouteImportRoute[]>([]);
  const [fileName, setFileName] = useState("");
  const [replaceImportedRoutes, setReplaceImportedRoutes] = useState(true);
  const [error, setError] = useState("");

  const matchedCount = useMemo(
    () => routes.filter((route) => findDpForSb(projectAssets, route.toSbName)).length,
    [projectAssets, routes],
  );

  const missingRoutes = useMemo(
    () => routes.filter((route) => !findDpForSb(projectAssets, route.toSbName)).slice(0, 8),
    [projectAssets, routes],
  );

  async function handleFile(file: File | null) {
    if (!file) return;
    setError("");
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const parsedRoutes = parseRoutesFromWorkbook(workbook);
      setRoutes(parsedRoutes);
      if (!parsedRoutes.length) {
        setError("No FAS routes into SBs were found. Check the FAS has Cable Name / Fibre / End Point columns.");
      }
    } catch (err) {
      console.error(err);
      setError("Could not read this FAS file.");
      setRoutes([]);
    }
  }

  function applyRoutes() {
    if (!routes.length) {
      alert("Upload a FAS first.");
      return;
    }

    const note = window.prompt(
      `Audit note required: apply ${routes.length} FAS route${routes.length === 1 ? "" : "s"} into SBs?`,
      `Import SB fibre routes from ${fileName || "FAS"}`,
    );

    if (note === null) return;
    const trimmed = note.trim();
    if (!trimmed) {
      alert("An audit note is required before applying FAS SB routes.");
      return;
    }

    onApplySbRouteAssignments?.({ routes, note: trimmed, replaceImportedRoutes });
  }

  return (
    <section style={panel}>
      <h3 style={title}>FAS SB Route Import</h3>
      <p style={{ ...muted, marginTop: -4 }}>
        Bulk imports FAS fibre routes into SBs, including MidJ/source-to-SB breakout rows. Manual SB route editing remains available afterwards. Cable names are stored only as supporting route evidence.
      </p>

      <input
        type="file"
        accept=".xlsx,.xlsm,.xls"
        onChange={(event) => handleFile(event.target.files?.[0] || null)}
        style={{ color: "#cbd5e1", marginTop: 8 }}
      />

      <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#cbd5e1", fontSize: 12, marginTop: 10 }}>
        <input
          type="checkbox"
          checked={replaceImportedRoutes}
          onChange={(event) => setReplaceImportedRoutes(event.target.checked)}
        />
        Replace previous FAS-imported SB routes only. Manual routes are preserved.
      </label>

      {error ? <div style={{ color: "#fecaca", marginTop: 10, fontSize: 12 }}>{error}</div> : null}

      {routes.length ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
          <div style={smallBox}><div style={muted}>Routes found</div><strong style={{ color: "#f8fafc", fontSize: 22 }}>{routes.length}</strong></div>
          <div style={smallBox}><div style={muted}>Matching SBs</div><strong style={{ color: "#86efac", fontSize: 22 }}>{matchedCount}</strong></div>
          <div style={smallBox}><div style={muted}>Not found</div><strong style={{ color: missingRoutes.length ? "#fca5a5" : "#86efac", fontSize: 22 }}>{routes.length - matchedCount}</strong></div>
        </div>
      ) : null}

      {routes.slice(0, 6).map((route) => (
        <div key={route.id} style={{ ...smallBox, marginTop: 8, color: "#cbd5e1", fontSize: 12 }}>
          <strong style={{ color: "#f8fafc" }}>{route.fromSbName} → {route.toSbName}</strong>
          <div>Parent: F{route.parentFibres.join(", F")} → Local: F{route.localFibres.join(", F")}</div>
          <div style={muted}>Cable: {route.supportingCableName || "optional / not set"}</div>
        </div>
      ))}

      {missingRoutes.length ? (
        <div style={{ ...smallBox, marginTop: 10, color: "#fca5a5", fontSize: 12 }}>
          <strong>Some destination SBs were not found on the map:</strong>
          <div style={{ marginTop: 4 }}>{missingRoutes.map((route) => route.toSbName).join(", ")}</div>
        </div>
      ) : null}

      <button
        type="button"
        style={{ ...button, marginTop: 12, opacity: routes.length && onApplySbRouteAssignments ? 1 : 0.55 }}
        disabled={!routes.length || !onApplySbRouteAssignments}
        onClick={applyRoutes}
      >
        Apply FAS Routes To Matching SBs
      </button>
    </section>
  );
}
