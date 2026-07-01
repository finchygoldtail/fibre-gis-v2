import type { SavedMapAsset } from "../../components/map/types";
import type { TopologyNodeKind } from "./topologyTypes";

export function normaliseTopologyText(value: unknown): string {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[_/]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function compactTopologyText(value: unknown): string {
  return normaliseTopologyText(value).replace(/[^A-Z0-9]/g, "");
}

export function assetDisplayName(asset: SavedMapAsset | null | undefined): string {
  return String(
    asset?.name ||
      (asset as any)?.label ||
      (asset as any)?.title ||
      asset?.id ||
      "Unnamed asset",
  ).trim();
}

export function classifyTopologyAsset(asset: SavedMapAsset): TopologyNodeKind {
  const name = normaliseTopologyText(assetDisplayName(asset));
  const compact = compactTopologyText(name);
  const assetType = normaliseTopologyText(asset.assetType);
  const jointType = normaliseTopologyText(asset.jointType);
  const chamberType = normaliseTopologyText((asset as any).chamberDetails?.chamberType);

  if (assetType === "HOME") return "home";
  if (assetType === "CABLE" || jointType.includes("CABLE")) return "cable";
  if (assetType === "STREET-CAB" || jointType.includes("STREET CAB")) return "street-cab";

  if (jointType.includes("MEET ME") || jointType.includes("MEET-ME") || jointType.includes("MEETME")) {
    return "meet-me";
  }

  if (
    name.includes("EXCHANGE") ||
    compact.includes("EXCHANGE") ||
    compact.includes("OLT") ||
    compact.includes("ODF")
  ) {
    return "exchange";
  }

  if (
    name.includes("MEET") ||
    name.includes("MEET-ME") ||
    compact.includes("MEETME") ||
    compact.includes("MMC") ||
    chamberType.includes("MEET")
  ) {
    return "meet-me";
  }

  if (compact.includes("LMJ")) return "lmj";
  if (compact.includes("MMJ")) return "mmj";
  if (compact.includes("CMJ") || compact.includes("MIDJ")) return "cmj";

  if (
    assetType === "DISTRIBUTION-POINT" ||
    /\bSB\d{1,4}\b/.test(name) ||
    /\bSP\d{1,4}\b/.test(name) ||
    compact.includes("AFN")
  ) {
    return compact.includes("SB") || compact.includes("SP") ? "sb" : "dp";
  }

  if (assetType === "CHAMBER" || jointType.includes("CHAMBER")) return "chamber";
  if (assetType === "AG-JOINT" || assetType === "JOINT" || jointType.includes("JOINT")) return "joint";

  return "unknown";
}

export function topologyRank(kind: TopologyNodeKind): number {
  switch (kind) {
    case "home":
      return 0;
    case "sb":
    case "dp":
      return 10;
    case "cmj":
      return 20;
    case "mmj":
      return 25;
    case "lmj":
      return 30;
    case "meet-me":
    case "chamber":
      return 40;
    case "street-cab":
      return 50;
    case "exchange":
      return 60;
    case "joint":
      return 22;
    case "cable":
      return 15;
    default:
      return 5;
  }
}

export function parseFibreNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const match = String(value ?? "").match(/\b(?:FIBRE|FIBER|F)\s*0*(\d{1,4})\b/i);
  if (match) return Number(match[1]);
  const direct = Number(String(value ?? "").trim());
  return Number.isFinite(direct) && direct > 0 ? direct : undefined;
}

export function rowToSearchText(row: unknown): string {
  if (!Array.isArray(row)) return normaliseTopologyText(row);
  return normaliseTopologyText(row.map((cell) => String(cell ?? "").trim()).filter(Boolean).join(" | "));
}

function findLabelledValue(rawText: string, labels: string[], valuePattern = "[A-Z0-9./:_-]{1,40}"): string | undefined {
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = rawText.match(new RegExp(`\\b(?:${labelPattern})\\b\\s*[:#-]?\\s*(${valuePattern})`, "i"));
  return match?.[1] ? normaliseTopologyText(match[1]) : undefined;
}

function extractExchangePatchInfo(rawText: string) {
  const exchangeName = findLabelledValue(rawText, ["EXCHANGE", "EXCH", "HEADEND", "HE"], "[A-Z0-9 -]{2,40}");
  const olt = findLabelledValue(rawText, ["OLT"]);
  const lt = findLabelledValue(rawText, ["LT", "LINE TERMINAL", "LINE CARD"]);
  const pon = findLabelledValue(rawText, ["PON"]);
  const odf = findLabelledValue(rawText, ["ODF", "ODF PORT", "PATCH PANEL"]);
  const ebcl = findLabelledValue(rawText, ["EBCL", "E-BCL", "BCL"]);
  const feederName = findLabelledValue(rawText, ["FEEDER", "FEEDER CABLE", "FC"], "[A-Z0-9 -]{2,40}");
  const strand = findLabelledValue(rawText, ["STRAND", "STR", "FIBRE STRAND"], "[A-Z0-9 -]{1,20}");

  const compact = compactTopologyText(rawText);
  const looksLikeExchangeRow =
    Boolean(exchangeName || olt || lt || pon || odf || ebcl || feederName || strand) ||
    compact.includes("EXCHANGE") ||
    compact.includes("OLT") ||
    compact.includes("PON") ||
    compact.includes("EBCL") ||
    compact.includes("MEETME");

  if (!looksLikeExchangeRow) return {};

  return { exchangeName, olt, lt, pon, odf, ebcl, feederName, strand };
}


function extractMeetMeSpliceInfo(row: unknown[], rawText: string) {
  const inputCableName = normaliseTopologyText(row?.[5] || "").replace(/\s+/g, "");
  const inputFibre = parseFibreNumber(row?.[6]);
  const outputCableName = normaliseTopologyText(row?.[7] || "").replace(/\s+/g, "");
  const outputFibre = parseFibreNumber(row?.[8]);
  const compact = compactTopologyText(rawText);

  const looksLikeMeetMeSplice = Boolean(
    (compact.includes("MEETME") || compact.includes("EBCL") || inputCableName.includes("EBCL")) &&
      inputCableName &&
      outputCableName &&
      (inputFibre || outputFibre),
  );

  if (!looksLikeMeetMeSplice) return {};

  return {
    spliceMode: "fibre-to-fibre" as const,
    inputCableName,
    inputFibre,
    outputCableName,
    outputFibre: outputFibre ?? inputFibre,
    ebcl: inputCableName.includes("EBCL") ? inputCableName : undefined,
    feederName: outputCableName,
  };
}

export function extractFibreRefsFromRow(row: unknown[], rowIndex: number) {
  const refs: {
    fibre?: number;
    tray?: number;
    cableName?: string;
    splitterName?: string;
    exchangeName?: string;
    olt?: string;
    lt?: string;
    pon?: string;
    odf?: string;
    ebcl?: string;
    feederName?: string;
    strand?: string;
    spliceMode?: "splitter" | "fibre-to-fibre";
    inputCableName?: string;
    inputFibre?: number;
    outputCableName?: string;
    outputFibre?: number;
    rowIndex: number;
    rawText: string;
  }[] = [];
  const rawText = rowToSearchText(row);

  const fibreFromSecondColumn = parseFibreNumber(row?.[1]);
  const fibreMatches = [...rawText.matchAll(/\b(?:FIBRE|FIBER|F)\s*0*(\d{1,4})\b/g)].map((m) => Number(m[1]));
  const trayMatch = rawText.match(/\b(?:TRAY|T)\s*0*(\d{1,3})\b/);
  const tray = trayMatch ? Number(trayMatch[1]) : undefined;
  const cableMatches = [
    ...rawText.matchAll(/\b(?:[A-Z]{2,4}-[A-Z]{2,6}-(?:AG|LC)?\d{0,3}-?)?\d{1,3}\s*F\s*(?:ULW|LC|FC|FEEDER|LINK)\s*\d{1,5}\b/g),
    ...rawText.matchAll(/\b[A-Z]{2,4}-[A-Z]{2,6}-(?:LC|FC)\d{1,5}\b/g),
  ].map((m) => normaliseTopologyText(m[0]).replace(/\s+/g, ""));
  const splitterMatch = rawText.match(/\b(?:1:2|1:4|1:8|1:16|1:32|SPLITTER|SPL)\s*[A-Z0-9-]*/);
  const exchangePatchInfo = extractExchangePatchInfo(rawText);
  const meetMeSpliceInfo = extractMeetMeSpliceInfo(row, rawText);
  const hasExchangePatchInfo = Object.values(exchangePatchInfo).some(Boolean);
  const hasMeetMeSpliceInfo = Object.values(meetMeSpliceInfo).some(Boolean);

  const fibres = [fibreFromSecondColumn, ...fibreMatches].filter(
    (value, index, array): value is number =>
      typeof value === "number" && Number.isFinite(value) && array.indexOf(value) === index,
  );

  if (fibres.length === 0 && cableMatches.length === 0 && !splitterMatch && tray === undefined && !hasExchangePatchInfo && !hasMeetMeSpliceInfo) {
    return [{ rowIndex, rawText }];
  }

  const uniqueCableNames = Array.from(new Set(cableMatches));
  const baseCableName = uniqueCableNames[0] || (meetMeSpliceInfo as any).inputCableName || exchangePatchInfo.feederName;

  if (fibres.length === 0) {
    refs.push({
      rowIndex,
      rawText,
      tray,
      cableName: baseCableName,
      splitterName: splitterMatch?.[0],
      ...exchangePatchInfo,
      ...meetMeSpliceInfo,
    });
  } else {
    fibres.forEach((fibre) =>
      refs.push({
        fibre,
        tray,
        rowIndex,
        rawText,
        cableName: baseCableName,
        splitterName: splitterMatch?.[0],
        ...exchangePatchInfo,
        ...meetMeSpliceInfo,
      }),
    );
  }

  return refs;
}
