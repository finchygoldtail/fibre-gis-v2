// =====================================================
// FILE: jointIntelligence.ts
// PURPOSE: Central source of truth for joint engineering
//          intelligence used by workspace panels.
//
// Keep joint/tray/splice calculations out of React components.
// Components should consume getJointIntelligence() rather than
// rebuilding these values locally.
// =====================================================

import type { SavedMapAsset } from "../components/map/types";

export type JointIntelligenceRowValue = string | number | null | undefined;

export type JointIntelligence = {
  jointType: JointIntelligenceRowValue;
  trayRows: JointIntelligenceRowValue;
  spliceCount: JointIntelligenceRowValue;
  usedFibres: JointIntelligenceRowValue;
  importedFiles: JointIntelligenceRowValue;
  updatedBy: JointIntelligenceRowValue;
};

function read(
  asset: any,
  keys: string[],
  fallback: JointIntelligenceRowValue = "—",
): JointIntelligenceRowValue {
  for (const key of keys) {
    const value = asset?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return fallback;
}

function toNumber(value: any): number | null {
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
}

function arrayLength(asset: any, keys: string[]): number | null {
  for (const key of keys) {
    const value = asset?.[key];
    if (Array.isArray(value)) return value.length;
  }

  return null;
}

export function parseJointTrayCountFromText(value: any): number | null {
  const text = String(value || "");
  const match = text.match(/(\d+)\s*(tray|trays|rfs|rows?)/i);
  if (!match) return null;

  const next = Number(match[1]);
  return Number.isFinite(next) ? next : null;
}

export function extractJointMappingRows(asset: SavedMapAsset | null): any[] {
  const item = asset as any;

  const directRows = [
    item?.mappingRows,
    item?.continuityRows,
    item?.spliceRows,
    item?.trayRows,
    item?.rows,
  ].find((value) => Array.isArray(value));

  if (Array.isArray(directRows)) {
    return directRows;
  }

  const jsonSources = [
    item?.mappingRowsJson,
    item?.continuityRowsJson,
    item?.spliceRowsJson,
    item?.trayRowsJson,
  ];

  for (const source of jsonSources) {
    if (!source || typeof source !== "string") continue;

    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Ignore malformed legacy rows.
    }
  }

  return [];
}

export function countTruthyMappedRows(rows: any[]): number {
  return rows.filter((row) => {
    if (!row || typeof row !== "object") return false;

    const values = Object.values(row)
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);

    if (!values.length) return false;

    return values.some((value) => value !== "-" && value.toLowerCase() !== "spare");
  }).length;
}

export function getJointIntelligence(asset: SavedMapAsset | null): JointIntelligence {
  const item = asset as any;

  const mappingRows = extractJointMappingRows(asset);

  const mappingRowCount =
    (Array.isArray(mappingRows) && mappingRows.length
      ? mappingRows.length
      : null) ??
    arrayLength(item, ["mappingRows", "trayRows", "fibreRows", "spliceRows", "continuityRows", "rows"]) ??
    toNumber(read(item, ["mappingRowsCount", "trayRowsCount", "continuityRowsCount", "rowCount"], null));

  const parsedTrayCount =
    parseJointTrayCountFromText(item?.jointType) ??
    parseJointTrayCountFromText(item?.status) ??
    parseJointTrayCountFromText(item?.name) ??
    parseJointTrayCountFromText(item?.notes);

  const explicitTrayCount = toNumber(read(item, ["trayCount", "trays", "numberOfTrays"], null));

  const usedFibres =
    toNumber(read(item, ["usedFibres", "usedFibers", "fibresUsed", "usedCoreCount"], null)) ??
    (Array.isArray(mappingRows) && mappingRows.length ? countTruthyMappedRows(mappingRows) : null);

  const spliceCount =
    toNumber(read(item, ["spliceCount", "splices", "spliceRowsCount", "usedSplices"], null)) ??
    usedFibres;

  return {
    jointType: read(item, ["jointType", "assetType", "type"], "Joint"),
    trayRows:
      mappingRowCount && mappingRowCount > 0
        ? mappingRowCount
        : explicitTrayCount ?? parsedTrayCount ?? "—",
    spliceCount: spliceCount ?? "—",
    usedFibres: usedFibres ?? spliceCount ?? "—",
    importedFiles: Array.isArray(item?.importedFiles)
      ? item.importedFiles.length
      : read(item, ["importedFilesCount", "filesImported"], "—"),
    updatedBy: read(item, ["updatedByEmail", "updatedBy", "lastEditedBy"], "—"),
  };
}
