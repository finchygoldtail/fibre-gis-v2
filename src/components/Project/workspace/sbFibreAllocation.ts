import type { SavedMapAsset } from "../../map/types";

// =====================================================
// FILE: sbFibreAllocation.ts
// PURPOSE: Read-only SB fibre allocation intelligence sourced from
//          uploaded AG/LMJ/CMJ joint mapping rows. This does NOT allocate
//          fibres by guessing SB order and does NOT write to Firestore.
//
// Engineering rule used here:
// - Joint Excel upload is the source of truth.
// - Fibres mapped to the selected SB-SP are USED HERE.
// - Fibres lower than the selected SB's local allocation are PASSTHROUGH
//   downstream/further along the run.
// - Fibres higher than the selected SB's local allocation are ALLOCATED
//   UPSTREAM / already used before this SB.
// - Unmapped fibres on the through cable are TRUE SPARE.
// =====================================================

export type SbFibreRole = "LOCAL" | "PASSTHROUGH" | "UPSTREAM" | "SPARE";

export type SbFibreRow = {
  fibre: number;
  role: SbFibreRole;
  cableName: string;
  destinationAssetId: string;
  destinationName: string;
  note: string;
  sourceAssetName?: string;
};

export type SbChainNode = {
  asset: SavedMapAsset;
  assetId: string;
  name: string;
  chainKey: string;
  sequence: number;
  connectedHomes: number;
  splitterRatio: string;
  splitterPorts: number;
  inputFibresRequired: number;
  localFibres: number[];
};

export type SbFibreAllocation = {
  isSb: boolean;
  selectedAssetId: string;
  selectedName: string;
  chainKey: string;
  chainPosition: string;
  splitterRatio: string;
  splitterPorts: number;
  connectedHomes: number;
  inputFibresRequired: number;
  localFibres: number[];
  throughCableName: string;
  fibreCapacity: number;
  passthroughRows: SbFibreRow[];
  localRows: SbFibreRow[];
  upstreamRows: SbFibreRow[];
  spareRows: SbFibreRow[];
  rows: SbFibreRow[];
  chain: SbChainNode[];
  warnings: string[];
};

type MappingHop = {
  sourceAssetId: string;
  sourceAssetName: string;
  rowIndex: number;
  cableName: string;
  fibre: number;
  endpoint: string;
  nextCableName?: string;
  nextFibre?: number;
  nextEndpoint?: string;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function norm(value: unknown): string {
  return text(value).toLowerCase();
}

function compact(value: unknown): string {
  return norm(value).replace(/[^a-z0-9]+/g, "");
}

function readAny(item: any, keys: string[], fallback: unknown = ""): unknown {
  for (const key of keys) {
    const parts = key.split(".");
    let cursor = item;
    for (const part of parts) {
      cursor = cursor?.[part];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return fallback;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = text(value).match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function assetName(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return text(item?.name || item?.jointName || item?.label || item?.assetId || item?.id || "Asset");
}

export function getSbAssetName(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return text(
    item?.splitterBox ||
      item?.properties?.splitterBox ||
      item?.name ||
      item?.label ||
      item?.assetId ||
      item?.id ||
      "SB",
  );
}

export function isSplitterBoxAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const haystack = [
    item.assetType,
    item.type,
    item.jointType,
    item.dpType,
    item.distributionPointType,
    item.closureType,
    item.splitterBox,
    item.name,
    item.label,
    item.dpDetails?.closureType,
    item.properties?.splitterBox,
  ]
    .map(norm)
    .join(" ");

  return (
    haystack.includes("splitter box") ||
    haystack.includes("splitterbox") ||
    haystack.includes(" sb") ||
    haystack.endsWith("sb") ||
    item.dpType === "SB" ||
    Boolean(item.splitterBox || item.properties?.splitterBox) ||
    /(?:^|[-_\s])sb\d+\b/i.test(String(item.name || item.label || ""))
  );
}

export function parseSplitterPorts(value: unknown): number {
  const raw = text(value);
  const ratioMatch = raw.match(/1\s*:\s*(\d+)/i);
  if (ratioMatch) {
    const ports = Number(ratioMatch[1]);
    if (Number.isFinite(ports) && ports > 0) return ports;
  }

  const direct = toNumber(raw);
  if (direct && direct > 1) return direct;

  return 8;
}

export function getSbSplitterRatio(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  const raw = readAny(item, [
    "dpDetails.splitterRatio",
    "dpDetails.ratio",
    "dpDetails.splitter",
    "dpDetails.afnDetails.splitterRatio",
    "afnDetails.splitterRatio",
    "splitterRatio",
    "ratio",
    "properties.splitterRatio",
    "properties.dpDetails.splitterRatio",
  ], "");

  const value = text(raw);
  if (value) return value.includes(":") ? value : `1:${parseSplitterPorts(value)}`;
  return "1:8";
}

export function getSbConnectedHomes(asset: SavedMapAsset | null | undefined): number {
  const item = asset as any;
  const value = readAny(item, [
    "dpDetails.connectedHomes",
    "dpDetails.connectionsToHomes",
    "connectedHomes",
    "homesConnected",
    "homeCount",
    "homes",
    "servedHomes",
    "properties.dpDetails.connectedHomes",
    "properties.connectedHomes",
  ], 0);

  const parsed = toNumber(value);
  return parsed ?? 0;
}

export function getSbInputFibresRequired(asset: SavedMapAsset | null | undefined): number {
  const item = asset as any;
  const explicitInputFibres = readAny(item, [
    "dpDetails.inputFibres",
    "dpDetails.afnDetails.inputFibres",
    "afnDetails.inputFibres",
    "inputFibres",
    "properties.dpDetails.inputFibres",
  ], null);

  if (Array.isArray(explicitInputFibres) && explicitInputFibres.length > 0) {
    return explicitInputFibres.length;
  }

  const explicitCount = readAny(item, [
    "dpDetails.fibreCountUsed",
    "dpDetails.inputFibreCount",
    "dpDetails.splitterCount",
    "dpDetails.splitters",
    "dpDetails.numberOfSplitters",
    "afnDetails.fibreCountUsed",
    "afnDetails.splitterCount",
    "inputFibreCount",
    "inputFibresRequired",
    "splitterCount",
    "numberOfSplitters",
    "properties.dpDetails.splitterCount",
  ], null);

  const explicitParsed = toNumber(explicitCount);
  if (explicitParsed && explicitParsed > 0) return explicitParsed;

  const connectedHomes = getSbConnectedHomes(asset);
  const ports = parseSplitterPorts(getSbSplitterRatio(asset));
  return Math.max(connectedHomes > 0 ? Math.ceil(connectedHomes / ports) : 1, 1);
}

function parseSbNumber(value: unknown): string {
  const source = String(value || "");
  const match = source.match(/(?:^|[-_\s])SB[-_\s]*(\d+)\b/i);
  return match ? String(Number(match[1])) : "";
}

function sbTokensForAsset(asset: SavedMapAsset): string[] {
  const rawValues = [
    getSbAssetName(asset),
    (asset as any).name,
    (asset as any).label,
    (asset as any).splitterBox,
    (asset as any).properties?.splitterBox,
  ].map(text).filter(Boolean);

  const tokens = new Set<string>();
  rawValues.forEach((value) => {
    tokens.add(compact(value));
    const sbNumber = parseSbNumber(value);
    if (sbNumber) {
      tokens.add(`sb${sbNumber}`);
      tokens.add(`sb${sbNumber.padStart(2, "0")}`);
    }
  });

  return Array.from(tokens).filter(Boolean).sort((a, b) => b.length - a.length);
}

function endpointContainsSelectedSb(endpoint: string, selectedTokens: string[]): boolean {
  const raw = text(endpoint);
  const value = compact(raw);

  return selectedTokens.some((token) => {
    if (!token) return false;

    const sbMatch = token.match(/^sb0*(\d+)$/i);
    if (sbMatch) {
      const sbNumber = sbMatch[1];
      const endpointSb = raw.match(/(?:^|[-_\s])SB[-_\s]*0*(\d+)\b/i);
      return endpointSb ? endpointSb[1] === sbNumber : false;
    }

    return (
      value === token ||
      value.endsWith(token) ||
      value.startsWith(`${token}sp`) ||
      value.startsWith(`${token}splitter`)
    );
  });
}

function endpointLooksLikeLocalSplitter(endpoint: string, selectedTokens: string[]): boolean {
  if (!endpointContainsSelectedSb(endpoint, selectedTokens)) return false;
  return /(?:^|[-_\s])SP[-_\s]*\d+\b/i.test(endpoint) || /splitter/i.test(endpoint);
}

function endpointDisplayName(endpoint: string): string {
  return text(endpoint) || "—";
}

function readRowsFromAsset(asset: SavedMapAsset): any[] {
  const item = asset as any;
  const directRows = [
    item.mappingRows,
    item.continuityRows,
    item.spliceRows,
    item.trayRows,
    item.rows,
  ].find((value) => Array.isArray(value));

  if (Array.isArray(directRows)) return directRows;

  const jsonSources = [
    item.mappingRowsJson,
    item.continuityRowsJson,
    item.spliceRowsJson,
    item.trayRowsJson,
  ];

  for (const source of jsonSources) {
    if (!source || typeof source !== "string") continue;
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Ignore malformed legacy rows.
    }
  }

  return [];
}

function rowToArray(row: any): unknown[] {
  if (Array.isArray(row)) return row;
  if (Array.isArray(row?.values)) return row.values;
  if (row && typeof row === "object") {
    const keys = Object.keys(row);
    const numericKeys = keys.filter((key) => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b));
    if (numericKeys.length) return numericKeys.map((key) => row[key]);

    const cableName = row.cableName || row["Cable Name"] || row.cable || row.Cable;
    const fibre = row.fibre || row.Fibre || row.fiber || row.Fiber;
    const endpoint = row.endPoint || row.endpoint || row["End Point"] || row.destination || row.Destination;
    if (cableName || fibre || endpoint) return [cableName, fibre, endpoint];
  }
  return [];
}

function isLikelyCableName(value: unknown): boolean {
  const raw = text(value);
  if (!raw || raw.toLowerCase() === "cable name") return false;
  return /\d+\s*f/i.test(raw) || /(?:ulw|lc|feeder|link|cable)/i.test(raw);
}

function parseFibre(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.round(value);
  const raw = text(value);
  if (!raw || /^fibre$/i.test(raw)) return null;
  const match = raw.match(/(?:^|[^\d])(\d{1,4})(?:[^\d]|$)/) || raw.match(/^(\d{1,4})$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function extractMappingHops(projectAssets: SavedMapAsset[]): MappingHop[] {
  const hops: MappingHop[] = [];

  projectAssets.forEach((asset) => {
    const rows = readRowsFromAsset(asset);
    if (!rows.length) return;

    rows.forEach((rawRow, rowIndex) => {
      const row = rowToArray(rawRow);
      if (row.length < 3) return;

      // AG FAS export shape is:
      // Link Cable | Link Fibre | Cable Name | Fibre | End Point | Cable Name | Fibre | End Point...
      // Scan every possible triplet so converted/custom rows still work.
      for (let index = 0; index <= row.length - 3; index += 1) {
        const cableName = text(row[index]);
        const fibre = parseFibre(row[index + 1]);
        const endpoint = text(row[index + 2]);

        if (!isLikelyCableName(cableName) || fibre === null || !endpoint || /^end point$/i.test(endpoint)) {
          continue;
        }

        const nextCableName = text(row[index + 3]);
        const nextFibre = parseFibre(row[index + 4]);
        const nextEndpoint = text(row[index + 5]);

        hops.push({
          sourceAssetId: String(asset.id || assetName(asset)),
          sourceAssetName: assetName(asset),
          rowIndex,
          cableName,
          fibre,
          endpoint,
          nextCableName: isLikelyCableName(nextCableName) ? nextCableName : undefined,
          nextFibre: nextFibre ?? undefined,
          nextEndpoint: nextEndpoint || undefined,
        });
      }
    });
  });

  return hops;
}

function parseCableCapacity(cableName: string, selectedAsset?: SavedMapAsset | null): number {
  const fromCableName = text(cableName).match(/(\d+)\s*f/i);
  if (fromCableName) return Number(fromCableName[1]);

  const item = selectedAsset as any;
  const fromAsset = toNumber(
    item?.fibreCount ||
      item?.fiberCount ||
      item?.coreCount ||
      item?.throughCableFibreCount ||
      item?.properties?.fibreCount,
  );
  return fromAsset && fromAsset > 0 ? fromAsset : 96;
}

function bestThroughCable(localHops: MappingHop[], selectedHops: MappingHop[]): string {
  const counts = new Map<string, number>();
  [...localHops, ...selectedHops].forEach((hop) => {
    if (!hop.cableName) return;
    counts.set(hop.cableName, (counts.get(hop.cableName) || 0) + 1);
  });

  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || "";
}

function destinationForHop(hop: MappingHop): string {
  if (hop.nextEndpoint && hop.nextCableName) return hop.nextEndpoint;
  return hop.endpoint;
}

function buildFromJointMappings(
  selectedAsset: SavedMapAsset,
  projectAssets: SavedMapAsset[],
): SbFibreAllocation | null {
  const selectedId = String(selectedAsset.id || getSbAssetName(selectedAsset));
  const selectedName = getSbAssetName(selectedAsset);
  const selectedTokens = sbTokensForAsset(selectedAsset);
  const warnings: string[] = [];
  const allHops = extractMappingHops(projectAssets);

  if (!allHops.length) return null;

  const selectedHops = allHops.filter((hop) => endpointContainsSelectedSb(hop.endpoint, selectedTokens));
  if (!selectedHops.length) return null;

  const localHops = selectedHops.filter((hop) => endpointLooksLikeLocalSplitter(hop.endpoint, selectedTokens));
  const throughCableName = bestThroughCable(localHops, selectedHops);

  if (!throughCableName) return null;

  const primaryHops = allHops
    .filter((hop) => compact(hop.cableName) === compact(throughCableName))
    .sort((a, b) => a.fibre - b.fibre);

  const localOnPrimary = (localHops.length ? localHops : selectedHops)
    .filter((hop) => compact(hop.cableName) === compact(throughCableName))
    .sort((a, b) => a.fibre - b.fibre);

  if (!localOnPrimary.length) return null;

  const localFibres = Array.from(new Set(localOnPrimary.map((hop) => hop.fibre))).sort((a, b) => a - b);
  const minLocalFibre = Math.min(...localFibres);
  const maxLocalFibre = Math.max(...localFibres);
  const capacity = parseCableCapacity(throughCableName, selectedAsset);
  const hopByFibre = new Map<number, MappingHop>();

  primaryHops.forEach((hop) => {
    if (!hopByFibre.has(hop.fibre)) hopByFibre.set(hop.fibre, hop);
  });

  const localRows = localOnPrimary.map((hop) => ({
    fibre: hop.fibre,
    role: "LOCAL" as const,
    cableName: hop.cableName,
    destinationAssetId: selectedId,
    destinationName: endpointDisplayName(hop.endpoint),
    note: `F${hop.fibre} used here at ${selectedName} from uploaded joint mapping.`,
    sourceAssetName: hop.sourceAssetName,
  }));

  const passthroughRows: SbFibreRow[] = [];
  const upstreamRows: SbFibreRow[] = [];
  const spareRows: SbFibreRow[] = [];

  for (let fibre = 1; fibre <= capacity; fibre += 1) {
    if (localFibres.includes(fibre)) continue;

    const hop = hopByFibre.get(fibre);

    if (hop && fibre < minLocalFibre) {
      const destination = destinationForHop(hop);
      passthroughRows.push({
        fibre,
        role: "PASSTHROUGH",
        cableName: hop.cableName,
        destinationAssetId: compact(destination),
        destinationName: endpointDisplayName(destination),
        note: `F${fibre} passes through ${selectedName} towards ${endpointDisplayName(destination)}.`,
        sourceAssetName: hop.sourceAssetName,
      });
      continue;
    }

    if (hop && fibre > maxLocalFibre) {
      const destination = destinationForHop(hop);
      upstreamRows.push({
        fibre,
        role: "UPSTREAM",
        cableName: hop.cableName,
        destinationAssetId: compact(destination),
        destinationName: endpointDisplayName(destination),
        note: `F${fibre} is already allocated before/upstream of ${selectedName} to ${endpointDisplayName(destination)}.`,
        sourceAssetName: hop.sourceAssetName,
      });
      continue;
    }

    if (!hop) {
      spareRows.push({
        fibre,
        role: "SPARE",
        cableName: throughCableName,
        destinationAssetId: "",
        destinationName: "True spare / unmapped in uploaded joint sheet",
        note: `F${fibre} is not present in the uploaded joint mapping for ${throughCableName}.`,
      });
    }
  }

  if (selectedHops.some((hop) => !endpointLooksLikeLocalSplitter(hop.endpoint, selectedTokens))) {
    warnings.push(`${selectedName} also appears as a passthrough/junction endpoint in the uploaded mapping. Dog-leg fibres are shown by their downstream destination where present.`);
  }

  if (!passthroughRows.length && minLocalFibre > 1) {
    warnings.push(`No mapped downstream fibres were found below F${minLocalFibre}. Check the uploaded joint rows for ${throughCableName}.`);
  }

  const rows = [...passthroughRows, ...localRows, ...upstreamRows, ...spareRows]
    .sort((a, b) => a.fibre - b.fibre || a.role.localeCompare(b.role));

  return {
    isSb: true,
    selectedAssetId: selectedId,
    selectedName,
    chainKey: compact(throughCableName),
    chainPosition: "From uploaded joint mapping",
    splitterRatio: getSbSplitterRatio(selectedAsset),
    splitterPorts: parseSplitterPorts(getSbSplitterRatio(selectedAsset)),
    connectedHomes: getSbConnectedHomes(selectedAsset),
    inputFibresRequired: localFibres.length || getSbInputFibresRequired(selectedAsset),
    localFibres,
    throughCableName,
    fibreCapacity: capacity,
    passthroughRows,
    localRows,
    upstreamRows,
    spareRows,
    rows,
    chain: [],
    warnings,
  };
}

function range(start: number, count: number): number[] {
  return Array.from({ length: Math.max(count, 0) }, (_, index) => start + index);
}

function parseSbChainIdentity(asset: SavedMapAsset): { chainKey: string; sequence: number | null } {
  const name = getSbAssetName(asset);
  const splitterBox = text((asset as any).splitterBox || (asset as any).properties?.splitterBox);
  const source = splitterBox || name;

  const sbMatch = source.match(/^(.*?)(?:[-_\s]*SB[-_\s]*)(\d+)\s*$/i);
  if (sbMatch) {
    return {
      chainKey: compact(sbMatch[1]) || "sb-chain",
      sequence: Number(sbMatch[2]),
    };
  }

  const trailingMatch = source.match(/^(.*?)(\d+)\s*$/);
  if (trailingMatch) {
    return {
      chainKey: compact(trailingMatch[1]) || "sb-chain",
      sequence: Number(trailingMatch[2]),
    };
  }

  const throughCable = text(readAny(asset as any, [
    "throughCable",
    "throughCableId",
    "parentCableId",
    "feedCable",
    "cableId",
    "properties.throughCable",
  ], ""));

  return {
    chainKey: compact(throughCable || source || "sb-chain"),
    sequence: null,
  };
}

function buildFallbackFromSbOrder(
  selectedAsset: SavedMapAsset,
  projectAssets: SavedMapAsset[],
): SbFibreAllocation | null {
  if (!selectedAsset || !isSplitterBoxAsset(selectedAsset)) return null;

  const selectedIdentity = parseSbChainIdentity(selectedAsset);
  const selectedName = getSbAssetName(selectedAsset);
  const selectedId = String(selectedAsset.id || selectedName);
  const warnings: string[] = [
    "No uploaded joint mapping rows were found for this SB. Showing fallback SB-name allocation only — upload/open the source joint Excel for authoritative fibre destinations.",
  ];

  if (selectedIdentity.sequence === null) {
    warnings.push("SB chain order could not be read from the SB name. Use names like SB01, SB02, SB20 for fallback order only.");
  }

  const chainAssets = (projectAssets || [])
    .filter(isSplitterBoxAsset)
    .filter((asset) => {
      const identity = parseSbChainIdentity(asset);
      return identity.chainKey === selectedIdentity.chainKey && identity.sequence !== null;
    });

  const includesSelected = chainAssets.some((asset) => String(asset.id) === selectedId);
  const sourceAssets = includesSelected ? chainAssets : [selectedAsset, ...chainAssets];

  const ordered = sourceAssets
    .map((asset) => {
      const identity = parseSbChainIdentity(asset);
      return {
        asset,
        assetId: String(asset.id || getSbAssetName(asset)),
        name: getSbAssetName(asset),
        chainKey: identity.chainKey,
        sequence: identity.sequence ?? Number.NEGATIVE_INFINITY,
        connectedHomes: getSbConnectedHomes(asset),
        splitterRatio: getSbSplitterRatio(asset),
        splitterPorts: parseSplitterPorts(getSbSplitterRatio(asset)),
        inputFibresRequired: getSbInputFibresRequired(asset),
        localFibres: [] as number[],
      };
    })
    .filter((node) => Number.isFinite(node.sequence))
    .sort((a, b) => b.sequence - a.sequence);

  let nextFibre = 1;
  const allocated = ordered.map((node) => {
    const localFibres = range(nextFibre, node.inputFibresRequired);
    nextFibre += node.inputFibresRequired;
    return { ...node, localFibres };
  });

  const selectedNode =
    allocated.find((node) => node.assetId === selectedId) ||
    allocated.find((node) => compact(node.name) === compact(selectedName));

  if (!selectedNode) return null;

  const downstreamNodes = allocated.filter((node) => node.sequence > selectedNode.sequence);
  const upstreamNodes = allocated.filter((node) => node.sequence < selectedNode.sequence);

  const passthroughRows = downstreamNodes.flatMap((node) =>
    node.localFibres.map((fibre) => ({
      fibre,
      role: "PASSTHROUGH" as const,
      cableName: "Fallback SB chain",
      destinationAssetId: node.assetId,
      destinationName: node.name,
      note: `F${fibre} fallback passthrough to ${node.name}`,
    })),
  );

  const localRows = selectedNode.localFibres.map((fibre) => ({
    fibre,
    role: "LOCAL" as const,
    cableName: "Fallback SB chain",
    destinationAssetId: selectedNode.assetId,
    destinationName: selectedNode.name,
    note: `F${fibre} fallback used here at ${selectedNode.name}`,
  }));

  const upstreamRows = upstreamNodes.flatMap((node) =>
    node.localFibres.map((fibre) => ({
      fibre,
      role: "UPSTREAM" as const,
      cableName: "Fallback SB chain",
      destinationAssetId: node.assetId,
      destinationName: node.name,
      note: `F${fibre} fallback allocated upstream to ${node.name}`,
    })),
  );

  return {
    isSb: true,
    selectedAssetId: selectedNode.assetId,
    selectedName: selectedNode.name,
    chainKey: selectedNode.chainKey,
    chainPosition: `${allocated.findIndex((node) => node.assetId === selectedNode.assetId) + 1} of ${allocated.length} from far end`,
    splitterRatio: selectedNode.splitterRatio,
    splitterPorts: selectedNode.splitterPorts,
    connectedHomes: selectedNode.connectedHomes,
    inputFibresRequired: selectedNode.inputFibresRequired,
    localFibres: selectedNode.localFibres,
    throughCableName: "Fallback SB chain",
    fibreCapacity: Math.max(nextFibre - 1, 0),
    passthroughRows,
    localRows,
    upstreamRows,
    spareRows: [],
    rows: [...passthroughRows, ...localRows, ...upstreamRows].sort((a, b) => a.fibre - b.fibre),
    chain: allocated,
    warnings,
  };
}

export function buildSbFibreAllocation(
  selectedAsset: SavedMapAsset | null | undefined,
  projectAssets: SavedMapAsset[],
): SbFibreAllocation | null {
  if (!selectedAsset || !isSplitterBoxAsset(selectedAsset)) return null;

  return buildFromJointMappings(selectedAsset, projectAssets || []);
}

export function formatFibreList(fibres: number[]): string {
  if (!fibres.length) return "—";

  const sorted = Array.from(new Set(fibres)).sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];

  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }

    ranges.push(start === previous ? `F${start}` : `F${start}-F${previous}`);
    start = current;
    previous = current;
  }

  return ranges.join(", ");
}
