// =====================================================
// FILE: src/services/areaAssetIndex.ts
// PURPOSE: Lightweight project-area/category indexing for Alistra GIS.
//
// IMPORTANT:
// - This does NOT replace mapAssets/main/chunks.
// - This does NOT move or duplicate authoritative assets.
// - It stamps assets with area/category metadata so the UI can load/filter
//   Baildon South, Baildon West, etc. without relying only on geometry checks.
// =====================================================

import type { SavedMapAsset } from "../components/map/types";

export type AreaAssetCategory =
  | "polygon"
  | "home"
  | "or"
  | "audit"
  | "street-cab"
  | "exchange"
  | "dp"
  | "cable"
  | "drop"
  | "pole"
  | "chamber"
  | "joint-cmj"
  | "joint-midj"
  | "joint-lmj"
  | "joint-mmj"
  | "joint"
  | "other";

export type AreaIndexedAsset = SavedMapAsset & {
  areaId?: string;
  projectAreaId?: string;
  projectId?: string;
  areaName?: string;
  projectAreaName?: string;
  areaCode?: string;
  projectAreaCode?: string;
  areaSlug?: string;
  areaStorageKey?: string;
  assetCategory?: AreaAssetCategory;
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function cleanId(value: unknown): string {
  return String(value ?? "").trim().replace(/\//g, "_");
}

function slugify(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const AREA_CODE_NAME_MAP: Record<string, string> = {
  BAS: "Baildon South",
  BAE: "Baildon East",
  BAW: "Baildon West",
  BAN: "Baildon North",
  BAC: "Baildon Central",
};

function inferAreaCodeFromText(value: unknown): string {
  const text = String(value ?? "").toUpperCase();
  const bdMatch = text.match(/\bBD[-_\s]?(BAS|BAE|BAW|BAN|BAC)\b/);
  if (bdMatch?.[1]) return bdMatch[1];

  const looseMatch = text.match(/\b(BAS|BAE|BAW|BAN|BAC)\b/);
  if (looseMatch?.[1]) return looseMatch[1];

  if (text.includes("BAILDON SOUTH")) return "BAS";
  if (text.includes("BAILDON EAST")) return "BAE";
  if (text.includes("BAILDON WEST")) return "BAW";
  if (text.includes("BAILDON NORTH")) return "BAN";
  if (text.includes("BAILDON CENTRAL")) return "BAC";

  return "";
}

function inferAreaNameFromCode(code: string): string {
  return AREA_CODE_NAME_MAP[String(code || "").toUpperCase()] || "";
}

function getAreaSourceText(asset: any): string {
  return [
    asset?.areaCode,
    asset?.areaName,
    asset?.projectAreaName,
    asset?.projectName,
    asset?.name,
    asset?.label,
    asset?.id,
    asset?.properties?.areaCode,
    asset?.properties?.areaName,
    asset?.properties?.projectAreaName,
    asset?.properties?.projectName,
    asset?.properties?.name,
    asset?.properties?.label,
  ]
    .map((value) => String(value ?? ""))
    .filter(Boolean)
    .join(" ");
}

function getText(asset: any): string {
  return [
    asset?.assetType,
    asset?.type,
    asset?.jointType,
    asset?.cableType,
    asset?.name,
    asset?.label,
    asset?.category,
    asset?.source,
    asset?.referenceSubtype,
    asset?.closureType,
    asset?.dpType,
    asset?.properties?.assetType,
    asset?.properties?.type,
    asset?.properties?.jointType,
    asset?.properties?.name,
  ]
    .map((value) => norm(value))
    .filter(Boolean)
    .join(" ");
}

export function getAssetAreaId(asset: any): string {
  // IMPORTANT:
  // projectId is not the same thing as an area/polygon id.
  // Imported homes are created with projectId before they are polygon-filtered.
  // If projectId is treated as areaId here, those homes can be rejected before
  // the geometry check runs, causing GeoJSON home imports to return 0 results.
  return cleanId(
    asset?.areaId ||
      asset?.projectAreaId ||
      asset?.properties?.areaId ||
      asset?.properties?.projectAreaId ||
      "",
  );
}

export function getAssetAreaCode(asset: any): string {
  return String(
    asset?.areaCode ||
      asset?.properties?.areaCode ||
      inferAreaCodeFromText(getAreaSourceText(asset)) ||
      "",
  )
    .trim()
    .toUpperCase();
}

export function getAssetAreaSlug(asset: any): string {
  return slugify(
    asset?.areaSlug ||
      asset?.properties?.areaSlug ||
      asset?.areaName ||
      asset?.projectAreaName ||
      asset?.properties?.areaName ||
      asset?.properties?.projectAreaName ||
      inferAreaNameFromCode(getAssetAreaCode(asset)) ||
      getAssetAreaId(asset),
  );
}

export function getProjectAreaIdentity(area: any): {
  id: string;
  code: string;
  slug: string;
  name: string;
} {
  const name = String(area?.name || area?.label || area?.areaName || area?.projectAreaName || "").trim();
  const code = String(
    area?.areaCode || area?.properties?.areaCode || inferAreaCodeFromText(getAreaSourceText(area)),
  )
    .trim()
    .toUpperCase();

  return {
    id: cleanId(area?.id || area?.areaId || area?.projectAreaId || ""),
    code,
    slug: slugify(name || inferAreaNameFromCode(code) || area?.id),
    name,
  };
}

export function isAssetAssignedToArea(asset: any, areaId: string | null | undefined): boolean {
  const requestedAreaId = cleanId(areaId || "");
  if (!requestedAreaId) return true;

  const assetAreaId = getAssetAreaId(asset);
  if (!assetAreaId) return true;

  return assetAreaId === requestedAreaId;
}

export function isAssetAssignedToProjectArea(asset: any, area: any): boolean {
  if (!area) return true;

  const active = getProjectAreaIdentity(area);
  const assetAreaId = getAssetAreaId(asset);
  const assetAreaCode = getAssetAreaCode(asset);
  const assetAreaSlug = getAssetAreaSlug(asset);

  // Explicit saved IDs take priority. If an asset already belongs to another
  // project area, keep it out of this workspace before doing geometry checks.
  if (assetAreaId && active.id && assetAreaId !== active.id) {
    const idLooksLikeSlug = assetAreaId === active.slug;
    if (!idLooksLikeSlug) return false;
  }

  // Existing Baildon naming convention gives us a safe virtual grouping without
  // duplicating data or moving Firestore docs: BD-BAS => Baildon South,
  // BD-BAE => Baildon East, BD-BAW => Baildon West.
  if (assetAreaCode && active.code && assetAreaCode !== active.code) return false;

  if (assetAreaSlug && active.slug && assetAreaSlug !== active.slug) {
    if (!assetAreaCode || !active.code || assetAreaCode !== active.code) return false;
  }

  return true;
}

export function inferAreaAssetCategory(asset: any): AreaAssetCategory {
  const text = getText(asset);
  const assetType = norm(asset?.assetType || asset?.type);
  const jointType = norm(asset?.jointType);
  const cableType = norm(asset?.cableType);
  const geometryType = norm(asset?.geometry?.type || asset?.geometryType);

  if (
    asset?.readOnly === true ||
    asset?.isReferenceAsset === true ||
    norm(asset?.source).includes("openreach") ||
    norm(asset?.source).includes("pia") ||
    assetType === "pia-route" ||
    cableType === "pia overlay" ||
    text.includes("or duct") ||
    text.includes("or pole") ||
    text.includes("or chamber")
  ) {
    return "or";
  }

  if (assetType === "audit" || text.includes("audit")) return "audit";

  if (
    cableType === "drop" ||
    text.includes("home drop") ||
    text.includes("drop cable") ||
    text.includes("drop-cable") ||
    asset?.isDropCable === true ||
    asset?.isHomeDrop === true ||
    asset?.generatedDrop === true ||
    asset?.autoGeneratedDrop === true
  ) {
    return "drop";
  }

  if (
    assetType === "home" ||
    Boolean(asset?.uprn || asset?.UPRN || asset?.homeId || asset?.properties?.UPRN || asset?.properties?.uprn) ||
    text.includes("home") ||
    text.includes("premise") ||
    text.includes("property")
  ) {
    return "home";
  }

  if (assetType === "cable" || geometryType === "linestring" || cableType) {
    return "cable";
  }

  if (
    assetType === "area" ||
    assetType === "polygon" ||
    assetType === "project-area" ||
    geometryType === "polygon" ||
    text.includes("polygon area")
  ) {
    return "polygon";
  }

  if (assetType === "street-cab" || text.includes("street cab") || text.includes("street-cab")) {
    return "street-cab";
  }

  if (assetType === "exchange" || text.includes("exchange")) return "exchange";

  if (
    assetType === "distribution-point" ||
    assetType === "dp" ||
    text.includes("distribution point") ||
    text.includes("cbt") ||
    text.includes("afn") ||
    text.includes("mdu_splitter")
  ) {
    return "dp";
  }

  if (assetType === "pole" || text.includes(" pole")) return "pole";
  if (assetType === "chamber" || text.includes("chamber")) return "chamber";

  if (assetType === "ag-joint" || jointType || text.includes("joint")) {
    if (text.includes("cmj")) return "joint-cmj";
    if (text.includes("midj")) return "joint-midj";
    if (text.includes("lmj")) return "joint-lmj";
    if (text.includes("mmj")) return "joint-mmj";
    return "joint";
  }

  return "other";
}

export function withAreaAssetIndex<T extends SavedMapAsset>(
  asset: T,
  areaId?: string | null,
  areaName?: string | null,
): T {
  const explicitAreaId = cleanId(areaId || getAssetAreaId(asset));
  const inferredCode = getAssetAreaCode(asset) || inferAreaCodeFromText(areaName);
  const inferredName = inferAreaNameFromCode(inferredCode);

  const nextAreaName = String(
    areaName ||
      (asset as any).areaName ||
      (asset as any).projectAreaName ||
      (asset as any).properties?.areaName ||
      (asset as any).properties?.projectAreaName ||
      inferredName ||
      "",
  ).trim();

  // For newly created assets in an active project area this remains the real
  // polygon/project id. For older assets with BD-BAS/BD-BAE style names, this
  // becomes a safe slug like baildon-south so they can be grouped without
  // duplicating or moving Firestore documents.
  const nextAreaId = explicitAreaId || slugify(nextAreaName);
  const nextAreaSlug = slugify(nextAreaName || nextAreaId);
  const nextAreaCode = inferredCode || inferAreaCodeFromText(nextAreaName);
  const nextAreaStorageKey =
    nextAreaSlug ||
    slugify(inferAreaNameFromCode(nextAreaCode)) ||
    slugify(nextAreaId);

  const category = inferAreaAssetCategory(asset);

  return {
    ...(asset as any),
    ...(nextAreaId
      ? {
          areaId: nextAreaId,
          projectAreaId: nextAreaId,
          projectId: (asset as any).projectId || nextAreaId,
        }
      : {}),
    ...(nextAreaName
      ? {
          areaName: nextAreaName,
          projectAreaName: nextAreaName,
        }
      : {}),
    ...(nextAreaCode ? { areaCode: nextAreaCode, projectAreaCode: nextAreaCode } : {}),
    ...(nextAreaSlug ? { areaSlug: nextAreaSlug } : {}),
    ...(nextAreaStorageKey ? { areaStorageKey: nextAreaStorageKey } : {}),
    assetCategory: category,
    properties: {
      ...((asset as any).properties || {}),
      ...(nextAreaId
        ? {
            areaId: nextAreaId,
            projectAreaId: nextAreaId,
            projectId: (asset as any).properties?.projectId || (asset as any).projectId || nextAreaId,
          }
        : {}),
      ...(nextAreaName
        ? {
            areaName: nextAreaName,
            projectAreaName: nextAreaName,
          }
        : {}),
      ...(nextAreaCode ? { areaCode: nextAreaCode, projectAreaCode: nextAreaCode } : {}),
      ...(nextAreaSlug ? { areaSlug: nextAreaSlug } : {}),
      ...(nextAreaStorageKey ? { areaStorageKey: nextAreaStorageKey } : {}),
      assetCategory: category,
    },
  } as T;
}

export function getAreaAssetCategoryLabel(category: AreaAssetCategory): string {
  const labels: Record<AreaAssetCategory, string> = {
    polygon: "Polygons",
    home: "Homes",
    or: "OR",
    audit: "Audits",
    "street-cab": "Street Cabs",
    exchange: "Exchanges",
    dp: "DPs",
    cable: "Cables",
    drop: "Drops",
    pole: "Poles",
    chamber: "Chambers",
    "joint-cmj": "Joints - CMJ",
    "joint-midj": "Joints - MidJ",
    "joint-lmj": "Joints - LMJ",
    "joint-mmj": "Joints - MMJ",
    joint: "Joints",
    other: "Other",
  };

  return labels[category] || "Other";
}

export function buildAreaAssetCategoryCounts(assets: SavedMapAsset[]): Record<AreaAssetCategory, number> {
  const counts = {} as Record<AreaAssetCategory, number>;

  assets.forEach((asset) => {
    const category = ((asset as any).assetCategory || inferAreaAssetCategory(asset)) as AreaAssetCategory;
    counts[category] = (counts[category] || 0) + 1;
  });

  return counts;
}
