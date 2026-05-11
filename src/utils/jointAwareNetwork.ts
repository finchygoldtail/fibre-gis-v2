// =====================================================
// FILE: jointAwareNetwork.ts
// PURPOSE: Read Fibre Tray Editor continuity/mapping rows
//          and turn them into cable/fibre topology links.
// =====================================================

import type { SavedMapAsset } from "../components/map/types";

export type FibreTrayCableHop = {
  cableName: string;
  cableKey: string;
  fibre: number | null;
  endPoint?: string;
};

export type FibreTrayContinuityLink = {
  jointId: string;
  sourceCableName: string;
  sourceCableKey: string;
  sourceFibre: number | null;
  targetCableName: string;
  targetCableKey: string;
  targetFibre: number | null;
  endPoint?: string;
  rawRowIndex: number;
};

export type FibreTrayTopologySummary = {
  mappedJoints: number;
  mappingRows: number;
  cableRefs: number;
  matchedCableRefs: number;
  unmatchedCableRefs: string[];
  routeLinks: number;
  links: FibreTrayContinuityLink[];
};

function cleanCell(value: any): string {
  if (value === null || value === undefined) return "";
  let text = String(value).trim();
  if (!text || text.toLowerCase() === "nan") return "";
  if (text.endsWith(".0")) text = text.slice(0, -2);
  return text;
}

function parseFibreNumber(value: any): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = cleanCell(value);
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeCableName(value: any): string {
  return cleanCell(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeCableName(value: any): boolean {
  const text = normalizeCableName(value);
  if (!text) return false;

  // Main patterns seen in the platform: LC, FC, FULW, FUW, FUG, FUL, drop cable names.
  return /(^|[-\s])(LC|FC)\d+/i.test(text) || /\d+F(U|UG|UL|ULW|UW|ULW)?/i.test(text) || /FULW\d+/i.test(text) || /FUG\d+/i.test(text);
}

export function extractFibreTrayContinuityLinks(
  jointId: string,
  rows: any[][],
): FibreTrayContinuityLink[] {
  const links: FibreTrayContinuityLink[] = [];

  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length < 4) return;

    const first = normalizeCableName(row[0]);
    const second = cleanCell(row[1]).toUpperCase();

    // Skip header rows like "Link Cable / Link Fibre / Cable Name / Fibre / End Point".
    if (first === "LINK CABLE" || second === "LINK FIBRE") return;

    const sourceCableName = cleanCell(row[0]);
    const sourceCableKey = normalizeCableName(sourceCableName);
    const sourceFibre = parseFibreNumber(row[1]);

    if (!sourceCableKey || !looksLikeCableName(sourceCableName)) return;

    let previousHop: FibreTrayCableHop = {
      cableName: sourceCableName,
      cableKey: sourceCableKey,
      fibre: sourceFibre,
    };

    // Standard CMJ/MMJ rows are:
    // Link Cable, Link Fibre, Cable Name, Fibre, End Point, Cable Name, Fibre, End Point...
    for (let col = 2; col < row.length; col += 3) {
      const targetCableName = cleanCell(row[col]);
      const targetCableKey = normalizeCableName(targetCableName);
      const targetFibre = parseFibreNumber(row[col + 1]);
      const endPoint = cleanCell(row[col + 2]);

      if (!targetCableKey || !looksLikeCableName(targetCableName)) continue;

      links.push({
        jointId,
        sourceCableName: previousHop.cableName,
        sourceCableKey: previousHop.cableKey,
        sourceFibre: previousHop.fibre,
        targetCableName,
        targetCableKey,
        targetFibre,
        endPoint: endPoint || undefined,
        rawRowIndex: rowIndex,
      });

      previousHop = {
        cableName: targetCableName,
        cableKey: targetCableKey,
        fibre: targetFibre,
        endPoint: endPoint || undefined,
      };
    }
  });

  return links;
}

export function buildCableNameRegistry(assets: SavedMapAsset[]): Map<string, SavedMapAsset> {
  const registry = new Map<string, SavedMapAsset>();

  assets.forEach((asset) => {
    if (asset.assetType !== "cable") return;

    const names = [
      (asset as any).name,
      (asset as any).cableName,
      (asset as any).label,
      (asset as any).id,
    ];

    names.forEach((name) => {
      const key = normalizeCableName(name);
      if (key && !registry.has(key)) registry.set(key, asset);
    });
  });

  return registry;
}

export function buildFibreTrayTopologySummary(
  rowsByJointId: Record<string, any[][]>,
  assets: SavedMapAsset[],
): FibreTrayTopologySummary {
  const cableRegistry = buildCableNameRegistry(assets);
  const links: FibreTrayContinuityLink[] = [];
  let mappingRows = 0;

  Object.entries(rowsByJointId).forEach(([jointId, rows]) => {
    if (!Array.isArray(rows) || rows.length === 0) return;
    mappingRows += rows.length;
    links.push(...extractFibreTrayContinuityLinks(jointId, rows));
  });

  const cableRefs = new Map<string, string>();
  links.forEach((link) => {
    cableRefs.set(link.sourceCableKey, link.sourceCableName);
    cableRefs.set(link.targetCableKey, link.targetCableName);
  });

  const unmatchedCableRefs = Array.from(cableRefs.entries())
    .filter(([key]) => !cableRegistry.has(key))
    .map(([, displayName]) => displayName)
    .sort((a, b) => a.localeCompare(b));

  return {
    mappedJoints: Object.values(rowsByJointId).filter(
      (rows) => Array.isArray(rows) && rows.length > 0,
    ).length,
    mappingRows,
    cableRefs: cableRefs.size,
    matchedCableRefs: cableRefs.size - unmatchedCableRefs.length,
    unmatchedCableRefs,
    routeLinks: links.length,
    links,
  };
}
