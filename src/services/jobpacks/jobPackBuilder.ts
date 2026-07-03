import type { SavedMapAsset } from "../../components/map/types";
import { buildJobPackRoutes, isJobPackRouteFibreCount } from "./jobPackRouteBuilder";
import type {
  BuildJobPackDraftInput,
  JobPackAssetGroup,
  JobPackDraft,
  JobPackDraftAsset,
  JobPackRiskDraft,
  JobPackScheduleRow,
} from "./jobPackTypes";

const normalize = (value?: string) => (value || "").toLowerCase().replace(/[\s_-]/g, "");

function assetGroup(asset: SavedMapAsset): JobPackAssetGroup {
  const type = normalize(asset.assetType || asset.jointType);
  if (type === "area") return "boundary";
  if (type === "cable" || type === "piaroute") return "route";
  if (type === "distributionpoint") return "distributionPoint";
  if (type === "joint" || type === "agjoint") return "joint";
  if (type === "chamber") return "chamber";
  if (type === "pole") return "pole";
  if (type === "home") return "home";
  return "other";
}

function assetName(asset: SavedMapAsset): string {
  const anyAsset = asset as any;
  return anyAsset.name || anyAsset.label || anyAsset.properties?.name || asset.id;
}

function formatFibres(fibres?: number[]): string {
  if (!fibres?.length) return "";
  const sorted = [...fibres].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return ranges.join(", ");
}

function detailFor(asset: SavedMapAsset): string {
  if (asset.assetType === "distribution-point") {
    const homes = asset.dpDetails?.connectionsToHomes ?? 0;
    const architecture = asset.dpDetails?.closureType || asset.dpDetails?.networkArchitecture || "DP";
    const fibres = formatFibres(
      asset.dpDetails?.autoFibrePlan?.inputFibres ||
      asset.dpDetails?.afnDetails?.inputFibres ||
      asset.dpDetails?.mduDetails?.inputFibres ||
      asset.allocatedInputFibres,
    );
    return `${architecture}, ${homes} connected homes${fibres ? `, fibres ${fibres}` : ""}`;
  }
  if (asset.assetType === "cable" || asset.assetType === "pia-route") {
    return [asset.fibreCount, asset.installMethod, asset.cableType].filter(Boolean).join(" / ") || "Route";
  }
  if (asset.assetType === "home") return asset.homeType || "Premises";
  if (asset.assetType === "chamber") return asset.chamberDetails?.size || asset.chamberDetails?.chamberType || "Chamber";
  if (asset.assetType === "pole") return asset.poleDetails?.poleType || "Pole";
  return asset.notes || asset.assetType || "Asset";
}

function toDraftAsset(asset: SavedMapAsset): JobPackDraftAsset {
  return {
    id: asset.id,
    name: assetName(asset),
    group: assetGroup(asset),
    assetType: asset.assetType || asset.jointType || "unknown",
    status: asset.status || undefined,
    fibreCount: isJobPackRouteFibreCount(asset.fibreCount) ? asset.fibreCount : asset.fibreCount,
    installMethod: asset.installMethod,
    cableType: asset.cableType,
    notes: asset.notes,
    geometry: asset.geometry,
    sourceAsset: asset,
  };
}

function scheduleRow(asset: JobPackDraftAsset): JobPackScheduleRow {
  return {
    id: asset.id,
    asset: asset.name,
    type: asset.assetType,
    detail: detailFor(asset.sourceAsset),
    status: asset.status || "Review",
    reviewNote: asset.notes || "Check against live design before issue.",
  };
}

function buildRisks(assets: JobPackDraftAsset[]): JobPackRiskDraft[] {
  const risks: JobPackRiskDraft[] = [];
  assets.forEach((asset) => {
    if (asset.group === "route" && !asset.fibreCount) {
      risks.push({
        id: `risk-fibre-${asset.id}`,
        level: "warning",
        title: "Route missing fibre count",
        assetId: asset.id,
        assetName: asset.name,
        action: "Confirm whether route belongs on a 96F, 48F, 36F, 24F or 12F page.",
      });
    }
    if ((asset.group === "distributionPoint" || asset.group === "home") && !asset.status) {
      risks.push({
        id: `risk-status-${asset.id}`,
        level: "info",
        title: "Status not set",
        assetId: asset.id,
        assetName: asset.name,
        action: "Review status before issuing the contractor pack.",
      });
    }
  });
  return risks;
}

export function buildJobPackDraftFromLiveMap(input: BuildJobPackDraftInput): JobPackDraft {
  const assets = input.assets.map(toDraftAsset);
  const routes = buildJobPackRoutes(assets);
  const risks = buildRisks(assets);
  const count = (group: JobPackDraftAsset["group"]) => assets.filter((asset) => asset.group === group).length;
  const generatedAt = new Date().toISOString();
  const revision = input.revision || "DRAFT-01";

  return {
    id: `job-pack-draft-${input.areaId}-${Date.now()}`,
    areaId: input.areaId,
    areaName: input.areaName,
    packNumber: `AL-${input.areaName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toUpperCase()}-${revision}`,
    revision,
    status: "draft",
    generatedAt,
    source: "live_map",
    assets,
    routes,
    dpSchedule: assets.filter((asset) => asset.group === "distributionPoint").map(scheduleRow),
    homesSchedule: assets.filter((asset) => asset.group === "home").map(scheduleRow),
    fasRows: assets
      .filter((asset) => asset.group === "route" || asset.group === "distributionPoint")
      .map(scheduleRow),
    buildNotes: [
      "Draft generated directly from the live map.",
      "Review FAS rows, route sheets, UPRNs, build notes and risks before export.",
      "Draft edits are isolated from the live map until explicitly pushed back in a later controlled workflow.",
    ],
    risks,
    summary: {
      totalAssets: assets.length,
      boundaries: count("boundary"),
      routes: count("route"),
      distributionPoints: count("distributionPoint"),
      joints: count("joint"),
      chambers: count("chamber"),
      poles: count("pole"),
      homes: count("home"),
      risks: risks.length,
      blockers: risks.filter((risk) => risk.level === "blocker").length,
    },
  };
}
