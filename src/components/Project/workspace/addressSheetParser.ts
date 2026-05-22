import type { SavedMapAsset } from "../../map/types";

export type AddressSheetRow = {
  rowNumber: number;
  opsRegion: string;
  opsCluster: string;
  fibrehoodName: string;
  fibrehoodCode: string;
  agCode: string;
  splitterBox: string;
  premiseType: string;
  uprn: string;
  poleChamber: string;
  dropType: string;
  address: string;
  raw: Record<string, unknown>;
};

export type AddressSheetMatchedRow = AddressSheetRow & {
  homeAsset?: SavedMapAsset;
  homeMatchType: "uprn" | "address" | "none";
  splitterAsset?: SavedMapAsset;
  splitterMatchType: "name" | "none";
  poleChamberAsset?: SavedMapAsset;
  poleChamberMatchType: "reference" | "none";
};

export type AddressSheetMatchReport = {
  rows: AddressSheetMatchedRow[];
  splitterBoxes: string[];
  poleChambers: string[];
  stats: {
    rows: number;
    uniqueUprns: number;
    splitterBoxes: number;
    poleChambers: number;
    matchedHomes: number;
    matchedHomesByUprn: number;
    matchedHomesByAddress: number;
    unmatchedHomes: number;
    matchedSplitters: number;
    unmatchedSplitters: number;
    matchedPoleChambers: number;
    unmatchedPoleChambers: number;
  };
};

type XlsxModule = {
  read: (data: ArrayBuffer, options?: Record<string, unknown>) => any;
  utils: {
    sheet_to_json: (sheet: any, options?: Record<string, unknown>) => Record<string, unknown>[];
  };
};

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function normalise(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, " ");
}

function normaliseCompact(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function normaliseHeader(value: unknown): string {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function readField(row: Record<string, unknown>, aliases: string[]): string {
  const wanted = new Set(aliases.map(normaliseHeader));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normaliseHeader(key))) return clean(value);
  }
  return "";
}

function getUprnFromAsset(asset: SavedMapAsset): string {
  const item = asset as any;
  return clean(
    item.uprn ||
      item.UPRN ||
      item.properties?.UPRN ||
      item.properties?.uprn ||
      item.homeId ||
      item.addressBaseUprn,
  );
}

function getAddressFromAsset(asset: SavedMapAsset): string {
  const item = asset as any;
  return clean(
    item.address ||
      item.fullAddress ||
      item.properties?.address ||
      item.properties?.Address ||
      item.label ||
      item.name,
  );
}

function getAssetTitle(asset: SavedMapAsset): string {
  const item = asset as any;
  return clean(item.name || item.jointName || item.label || item.assetId || item.id || "Asset");
}

function getAssetReferenceText(asset: SavedMapAsset): string {
  const item = asset as any;
  return [
    item.id,
    item.assetId,
    item.name,
    item.jointName,
    item.label,
    item.piaRef,
    item.orRef,
    item.reference,
    item.referenceId,
    item.poleChamber,
    item.pole_chamber,
    item.importedProperties?.Name,
    item.importedProperties?.name,
    item.importedProperties?.Reference,
    item.importedProperties?.reference,
    item.importedProperties?.ref,
    item.importedProperties?.Ref,
  ]
    .map(clean)
    .filter(Boolean)
    .join(" ");
}

function isLineAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const text = [item.assetType, item.type, item.cableType, item.name].map(normalise).join(" ");
  return asset.geometry?.type === "LineString" || text.includes("cable") || text.includes("route");
}

function isDistributionPointOrSplitter(asset: SavedMapAsset): boolean {
  const item = asset as any;
  if (isLineAsset(asset)) return false;

  const text = [
    item.assetType,
    item.type,
    item.jointType,
    item.dpType,
    item.distributionPointType,
    item.closureType,
    item.name,
    item.label,
  ]
    .map(normalise)
    .join(" ");

  return (
    text.includes("distribution") ||
    text.includes("splitter") ||
    text.includes("sb") ||
    text.includes("dp") ||
    text.includes("cbt") ||
    text.includes("afn") ||
    text.includes("mdu")
  );
}

function isHomeAsset(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const hasPointGeometry =
    asset.geometry?.type === "Point" ||
    (typeof item.lat === "number" && typeof item.lng === "number");

  if (!hasPointGeometry || isLineAsset(asset) || isDistributionPointOrSplitter(asset)) return false;

  const text = [item.assetType, item.type, item.homeType, item.name, item.label, item.category]
    .map(normalise)
    .join(" ");

  return Boolean(
    getUprnFromAsset(asset) ||
      text.includes("home") ||
      text.includes("premise") ||
      text.includes("property") ||
      text.includes("sdu") ||
      text.includes("flat"),
  );
}

function createHomeIndexes(projectAssets: SavedMapAsset[]) {
  const byUprn = new Map<string, SavedMapAsset>();
  const byAddress = new Map<string, SavedMapAsset>();

  projectAssets.filter(isHomeAsset).forEach((asset) => {
    const uprn = normaliseCompact(getUprnFromAsset(asset));
    if (uprn && !byUprn.has(uprn)) byUprn.set(uprn, asset);

    const address = normaliseCompact(getAddressFromAsset(asset));
    if (address && !byAddress.has(address)) byAddress.set(address, asset);
  });

  return { byUprn, byAddress };
}

function createReferenceIndexes(projectAssets: SavedMapAsset[]) {
  const splitterByName = new Map<string, SavedMapAsset>();
  const poleChamberByRef = new Map<string, SavedMapAsset>();

  projectAssets.forEach((asset) => {
    const title = getAssetTitle(asset);
    const referenceText = getAssetReferenceText(asset);

    if (isDistributionPointOrSplitter(asset)) {
      const direct = normaliseCompact(title);
      if (direct && !splitterByName.has(direct)) splitterByName.set(direct, asset);

      const ref = normaliseCompact(referenceText);
      if (ref && !splitterByName.has(ref)) splitterByName.set(ref, asset);
    }

    const compactReference = normaliseCompact(referenceText);
    if (compactReference && !poleChamberByRef.has(compactReference)) {
      poleChamberByRef.set(compactReference, asset);
    }
  });

  return { splitterByName, poleChamberByRef };
}

function findSplitterAsset(splitterBox: string, splitterByName: Map<string, SavedMapAsset>): SavedMapAsset | undefined {
  const compact = normaliseCompact(splitterBox);
  if (!compact) return undefined;

  const direct = splitterByName.get(compact);
  if (direct) return direct;

  for (const [key, asset] of splitterByName.entries()) {
    if (key.includes(compact) || compact.includes(key)) return asset;
  }

  return undefined;
}

function findPoleChamberAsset(reference: string, poleChamberByRef: Map<string, SavedMapAsset>): SavedMapAsset | undefined {
  const compact = normaliseCompact(reference);
  if (!compact) return undefined;

  const direct = poleChamberByRef.get(compact);
  if (direct) return direct;

  for (const [key, asset] of poleChamberByRef.entries()) {
    if (key.includes(compact) || compact.includes(key)) return asset;
  }

  return undefined;
}

export async function parseAddressSheetFile(file: File): Promise<AddressSheetRow[]> {
  let XLSX: XlsxModule;

  try {
    XLSX = (await import("xlsx")) as XlsxModule;
  } catch (err) {
    throw new Error("The xlsx package is not installed. Run: npm install xlsx");
  }

  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const firstSheetName = workbook.SheetNames?.[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rawRows
    .map((raw, index) => ({
      rowNumber: index + 2,
      opsRegion: readField(raw, ["ag_code - Ops Region", "ops_region", "region"]),
      opsCluster: readField(raw, ["ag_code - Ops Cluster", "ops_cluster", "cluster"]),
      fibrehoodName: readField(raw, ["Fibrehood Name", "fibrehood_name", "project", "area"]),
      fibrehoodCode: readField(raw, ["fibrehood_code", "fibrehood code"]),
      agCode: readField(raw, ["ag_code", "ag code"]),
      splitterBox: readField(raw, ["splitter_box", "splitter box", "sb", "splitter"]),
      premiseType: readField(raw, ["Type", "premise type", "premise_type"]),
      uprn: readField(raw, ["uprn", "UPRN"]),
      poleChamber: readField(raw, ["pole_chamber", "pole chamber", "pole/chamber", "pole chamber ref"]),
      dropType: readField(raw, ["drop_type", "drop type"]),
      address: readField(raw, ["address", "Address", "full address", "premise address"]),
      raw,
    }))
    .filter((row) => row.uprn || row.address || row.splitterBox || row.poleChamber);
}

export function buildAddressSheetMatchReport(
  rows: AddressSheetRow[],
  projectAssets: SavedMapAsset[],
): AddressSheetMatchReport {
  const { byUprn, byAddress } = createHomeIndexes(projectAssets);
  const { splitterByName, poleChamberByRef } = createReferenceIndexes(projectAssets);

  const matchedRows = rows.map((row): AddressSheetMatchedRow => {
    const uprnKey = normaliseCompact(row.uprn);
    const addressKey = normaliseCompact(row.address);

    const homeByUprn = uprnKey ? byUprn.get(uprnKey) : undefined;
    const homeByAddress = !homeByUprn && addressKey ? byAddress.get(addressKey) : undefined;
    const splitterAsset = findSplitterAsset(row.splitterBox, splitterByName);
    const poleChamberAsset = findPoleChamberAsset(row.poleChamber, poleChamberByRef);

    return {
      ...row,
      homeAsset: homeByUprn || homeByAddress,
      homeMatchType: homeByUprn ? "uprn" : homeByAddress ? "address" : "none",
      splitterAsset,
      splitterMatchType: splitterAsset ? "name" : "none",
      poleChamberAsset,
      poleChamberMatchType: poleChamberAsset ? "reference" : "none",
    };
  });

  const splitterBoxes = Array.from(new Set(rows.map((row) => row.splitterBox).filter(Boolean))).sort();
  const poleChambers = Array.from(new Set(rows.map((row) => row.poleChamber).filter(Boolean))).sort();
  const matchedHomes = matchedRows.filter((row) => row.homeAsset);

  return {
    rows: matchedRows,
    splitterBoxes,
    poleChambers,
    stats: {
      rows: matchedRows.length,
      uniqueUprns: new Set(rows.map((row) => row.uprn).filter(Boolean)).size,
      splitterBoxes: splitterBoxes.length,
      poleChambers: poleChambers.length,
      matchedHomes: matchedHomes.length,
      matchedHomesByUprn: matchedRows.filter((row) => row.homeMatchType === "uprn").length,
      matchedHomesByAddress: matchedRows.filter((row) => row.homeMatchType === "address").length,
      unmatchedHomes: matchedRows.filter((row) => !row.homeAsset).length,
      matchedSplitters: matchedRows.filter((row) => row.splitterAsset).length,
      unmatchedSplitters: matchedRows.filter((row) => !row.splitterAsset).length,
      matchedPoleChambers: matchedRows.filter((row) => row.poleChamberAsset).length,
      unmatchedPoleChambers: matchedRows.filter((row) => !row.poleChamberAsset).length,
    },
  };
}

export function addressSheetReportToCsv(report: AddressSheetMatchReport): string {
  const escapeCell = (value: unknown) => {
    const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const headers = [
    "row",
    "uprn",
    "address",
    "splitter_box",
    "pole_chamber",
    "drop_type",
    "home_match",
    "home_asset_id",
    "splitter_match",
    "splitter_asset_id",
    "pole_chamber_match",
    "pole_chamber_asset_id",
  ];

  const lines = report.rows.map((row) =>
    [
      row.rowNumber,
      row.uprn,
      row.address,
      row.splitterBox,
      row.poleChamber,
      row.dropType,
      row.homeMatchType,
      row.homeAsset?.id || "",
      row.splitterMatchType,
      row.splitterAsset?.id || "",
      row.poleChamberMatchType,
      row.poleChamberAsset?.id || "",
    ]
      .map(escapeCell)
      .join(","),
  );

  return [headers.join(","), ...lines].join("\n");
}
