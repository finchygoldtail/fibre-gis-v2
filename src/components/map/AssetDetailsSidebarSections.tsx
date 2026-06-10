import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useAppMode } from "../../context/AppModeContext";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../firebase";
import type {
  ChamberDetails,
  DistributionPointDetails,
  PoleDetails,
  SavedMapAsset,
} from "./types";
import {
  applyDpFibrePlanToDetails,
  buildDpFibrePlan,
  getArchitectureConsistencyWarnings,
} from "../../services/dpArchitecturePlanner";
import {
  allocateDpFibresForPlan,
  rebuildThroughCableReservations,
  type RebuildThroughCableReservationResult,
} from "../../services/dpFibreAutoAllocator";

type ConnectedHome = {
  port: number;
  homeId: string;
  homeName: string;
  status: string;
};

type Props = {
  assetType: string;
  poleDetails: PoleDetails;
  chamberDetails: ChamberDetails;
  dpDetails: DistributionPointDetails;
  onChangePoleDetails: (details: PoleDetails) => void;
  onChangeChamberDetails: (details: ChamberDetails) => void;
  onChangeDpDetails: (details: DistributionPointDetails) => void;
  onRebuildThroughCableReservations?: (
    result: RebuildThroughCableReservationResult,
  ) => void;
  connectedHomes?: ConnectedHome[];
  availableThroughCables?: SavedMapAsset[];
  allDistributionPoints?: SavedMapAsset[];
  allAssets?: SavedMapAsset[];
  currentDpId?: string | null;
  inputStyle: React.CSSProperties;
  labelStyle: React.CSSProperties;
  secondaryButtonStyle: React.CSSProperties;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function uploadAssetFile(assetFolder: string, file: File) {
  const fileRef = ref(
    storage,
    `asset-uploads/${assetFolder}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(file.name)}`,
  );
  await uploadBytes(fileRef, file, { contentType: file.type || undefined });
  return getDownloadURL(fileRef);
}

function keepSavedUrls(values: string[] = []) {
  return values.filter(
    (value) =>
      value && !value.startsWith("blob:") && !value.startsWith("data:"),
  );
}

function niceDocName(doc: string) {
  if (!doc.startsWith("http")) return doc;
  return decodeURIComponent(doc.split("/").pop()?.split("?")[0] || "Document");
}

function normaliseCableLabel(value: unknown): string {
  return String(value || "").trim();
}

function fibreNumber(value: unknown): number {
  return Number(String(value || "").replace(/\D/g, "")) || 0;
}

function isThroughCableOption(asset: SavedMapAsset): boolean {
  const item = asset as any;
  const assetType = String(item.assetType || "").toLowerCase();
  const cableType = String(item.cableType || "").toLowerCase();
  const name = String(item.name || item.cableId || item.id || "").toLowerCase();

  if (item.geometry?.type !== "LineString") return false;
  if (assetType && assetType !== "cable") return false;

  // Drops are end-customer cables and must not appear as AFN through-cables.
  if (cableType.includes("drop") || name.includes("drop")) return false;

  // Keep this deliberately broad: through-cables may be Feeder, Link, Spine,
  // Distribution, ULW, OH, or older saved records with only a fibre count.
  return (
    cableType.includes("feeder") ||
    cableType.includes("link") ||
    cableType.includes("spine") ||
    cableType.includes("distribution") ||
    cableType.includes("ulw") ||
    String(item.installMethod || "").toLowerCase() === "oh" ||
    fibreNumber(item.fibreCount) >= 12
  );
}

function getDpDisplayName(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return String(
    item?.name ||
      item?.jointName ||
      item?.label ||
      item?.assetId ||
      item?.id ||
      "DP",
  );
}

function normaliseDpLookup(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9]/g, "");
}

function refsLookLikeSameAsset(a: unknown, b: unknown): boolean {
  const left = normaliseDpLookup(a);
  const right = normaliseDpLookup(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function assetIdentityValues(asset: any): string[] {
  return [
    asset?.id,
    asset?.assetId,
    asset?.name,
    asset?.jointName,
    asset?.label,
    asset?.dpId,
  ]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

function findAssetByAnyReference(
  assets: SavedMapAsset[],
  references: unknown[],
): SavedMapAsset | null {
  const wanted = references.map(normaliseDpLookup).filter(Boolean);
  if (!wanted.length) return null;

  return (
    assets.find((asset) =>
      assetIdentityValues(asset).some((identity) =>
        wanted.some((reference) => refsLookLikeSameAsset(identity, reference)),
      ),
    ) || null
  );
}

function readPositiveFibres(values: unknown[]): number[] {
  const fibres: number[] = [];

  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const number = Number(entry);
        if (Number.isFinite(number) && number > 0) fibres.push(Math.floor(number));
      });
      return;
    }

    if (typeof value === "string") {
      value.split(/[,;\s]+/).forEach((entry) => {
        const number = Number(entry.replace(/[^0-9]/g, ""));
        if (Number.isFinite(number) && number > 0) fibres.push(Math.floor(number));
      });
      return;
    }

    const number = Number(value);
    if (Number.isFinite(number) && number > 0) fibres.push(Math.floor(number));
  });

  return Array.from(new Set(fibres)).sort((a, b) => a - b);
}


type ManualSbRoute = {
  id?: string;
  fromSbId?: string;
  fromSbName?: string;
  toSbId?: string;
  toSbName?: string;
  parentFibres?: number[];
  localFibres?: number[];
  spliceFibres?: number[];
  splitterFibres?: number[];
  supportingCableId?: string;
  supportingCableName?: string;
  note?: string;
};

function getStoredSbRoutes(details: any): ManualSbRoute[] {
  const routes = details?.afnDetails?.sbToSbRoutes;
  return Array.isArray(routes) ? routes : [];
}


type PointLike = { lat: number; lng: number };

function getAssetPointForRoute(asset: SavedMapAsset | null | undefined): PointLike | null {
  const item = asset as any;
  if (!item) return null;

  if (typeof item.lat === "number" && typeof item.lng === "number") {
    return { lat: item.lat, lng: item.lng };
  }

  const coords = item.geometry?.coordinates;
  if (item.geometry?.type === "Point" && Array.isArray(coords)) {
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function getCableEndpointPoints(asset: SavedMapAsset | null | undefined): PointLike[] {
  const coords = (asset as any)?.geometry?.coordinates;
  if ((asset as any)?.geometry?.type !== "LineString" || !Array.isArray(coords)) {
    return [];
  }

  return coords
    .map((coord: any) => ({ lat: Number(coord?.[0]), lng: Number(coord?.[1]) }))
    .filter((point: PointLike) => Number.isFinite(point.lat) && Number.isFinite(point.lng));
}

function routeDistanceMeters(a: PointLike, b: PointLike): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(h));
}

function isRouteSupportingCableCandidate(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;
  const item = asset as any;
  const textValue = [
    item.assetType,
    item.type,
    item.cableType,
    item.name,
    item.label,
    item.generatedBy,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");

  if (asset.geometry?.type !== "LineString") return false;
  if (textValue.includes("drop")) return false;
  if (item.isDropCable || item.isHomeDrop || item.generatedDrop || item.autoGeneratedDrop) {
    return false;
  }

  return true;
}

function findSupportingCableForSbRoute(
  fromAsset: SavedMapAsset | null,
  toAsset: SavedMapAsset | null,
  candidateCables: SavedMapAsset[],
): SavedMapAsset | null {
  const fromPoint = getAssetPointForRoute(fromAsset);
  const toPoint = getAssetPointForRoute(toAsset);
  if (!fromPoint || !toPoint) return null;

  const matches = candidateCables
    .filter(isRouteSupportingCableCandidate)
    .map((cable) => {
      const points = getCableEndpointPoints(cable);
      if (points.length < 2) return null;

      const start = points[0];
      const end = points[points.length - 1];

      const directStart = routeDistanceMeters(fromPoint, start);
      const directEnd = routeDistanceMeters(toPoint, end);
      const reverseStart = routeDistanceMeters(fromPoint, end);
      const reverseEnd = routeDistanceMeters(toPoint, start);

      const directMax = Math.max(directStart, directEnd);
      const reverseMax = Math.max(reverseStart, reverseEnd);
      const directScore = directStart + directEnd;
      const reverseScore = reverseStart + reverseEnd;

      const maxEndpointDistance = Math.min(directMax, reverseMax);
      const score = Math.min(directScore, reverseScore);

      return { cable, maxEndpointDistance, score };
    })
    .filter(
      (item): item is {
        cable: SavedMapAsset;
        maxEndpointDistance: number;
        score: number;
      } => Boolean(item),
    )
    // Allow a little tolerance because manually drawn cable endpoints are often
    // slightly offset from the SB marker.
    .filter((item) => item.maxEndpointDistance <= 35)
    .sort((a, b) => a.score - b.score);

  return matches[0]?.cable || null;
}

function getDpStatusForSidebar(
  currentDp: SavedMapAsset | null,
  details: DistributionPointDetails,
): string {
  const raw = String(
    (currentDp as any)?.dpDetails?.buildStatus ||
      (currentDp as any)?.properties?.dpDetails?.buildStatus ||
      (currentDp as any)?.buildStatus ||
      (currentDp as any)?.status ||
      details.buildStatus ||
      "Planned",
  )
    .trim()
    .toLowerCase();

  if (raw === "live") return "Live";
  if (raw === "built") return "Built";
  if (raw === "tested") return "Tested";
  if (raw === "blocked") return "Blocked";
  if (raw === "bwip") return "BWIP";
  if (raw === "unserviceable") return "Unserviceable";
  if (raw === "live not ready for service" || raw === "lnrfs") {
    return "Live not ready for service";
  }
  return "Planned";
}

function parseFibreListInput(value: string): number[] {
  const fibres = new Set<number>();
  String(value || "")
    .split(/[,;\s]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (range) {
        const start = Number(range[1]);
        const end = Number(range[2]);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          const low = Math.min(start, end);
          const high = Math.max(start, end);
          for (let fibre = low; fibre <= high; fibre += 1) fibres.add(fibre);
        }
        return;
      }
      const single = Number(part.replace(/[^0-9]/g, ""));
      if (Number.isFinite(single) && single > 0) fibres.add(single);
    });
  return Array.from(fibres).sort((a, b) => a - b);
}

function formatFibreList(values?: number[]): string {
  return Array.isArray(values) && values.length ? values.join(",") : "";
}


function cleanFasCell(value: unknown): string {
  return String(value ?? "").trim();
}

function readFasFibre(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
  const text = cleanFasCell(value);
  if (!text) return null;
  const match = text.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function normaliseFasSbName(value: unknown): string {
  const raw = cleanFasCell(value).toUpperCase().replace(/[–—]/g, "-");
  if (!raw) return "";

  // Convert BD-BAS-AG1-SB01-SP2 back to BD-BAS-AG1-SB01.
  const full = raw.match(/\b([A-Z]{2,4}-[A-Z]{2,6}-AG\d+-SB\d{1,3})(?:-SP\d+)?\b/i);
  if (full?.[1]) return full[1].toUpperCase();

  const local = raw.match(/\b(SB\d{1,3})(?:-SP\d+)?\b/i);
  return local?.[1]?.toUpperCase() || "";
}

function parseFasSbRoutesFromRows(rows: any[][]): ManualSbRoute[] {
  const grouped = new Map<string, ManualSbRoute>();

  rows.slice(1).forEach((row) => {
    if (!Array.isArray(row)) return;

    const hops: { cableName: string; fibre: number; endpoint: string; sbName: string }[] = [];

    for (let col = 2; col + 2 < row.length; col += 3) {
      const cableName = cleanFasCell(row[col]);
      const fibre = readFasFibre(row[col + 1]);
      const endpoint = cleanFasCell(row[col + 2]);
      const sbName = normaliseFasSbName(endpoint);

      if (cableName && fibre && sbName) {
        hops.push({ cableName, fibre, endpoint, sbName });
      }
    }

    for (let index = 0; index < hops.length - 1; index += 1) {
      const parent = hops[index];
      const child = hops[index + 1];
      if (!parent.sbName || !child.sbName || refsLookLikeSameAsset(parent.sbName, child.sbName)) continue;

      const key = `${parent.sbName}__${child.sbName}__${child.cableName}`;
      const current = grouped.get(key) || {
        id: key,
        fromSbName: parent.sbName,
        toSbName: child.sbName,
        parentFibres: [],
        localFibres: [],
        supportingCableName: child.cableName,
        note: "Imported from FAS sheet",
      };

      current.parentFibres = Array.from(new Set([...(current.parentFibres || []), parent.fibre])).sort((a, b) => a - b);
      current.localFibres = Array.from(new Set([...(current.localFibres || []), child.fibre])).sort((a, b) => a - b);
      grouped.set(key, current);
    }
  });

  return Array.from(grouped.values()).filter(
    (route) => route.fromSbName && route.toSbName && route.parentFibres?.length && route.localFibres?.length,
  );
}

async function readFasSbRoutesFromFile(file: File): Promise<ManualSbRoute[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];
  const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
  return parseFasSbRoutesFromRows(rows);
}


type FasSbFibreState = {
  sbName: string;
  spliceFibres: number[];
  splitterFibres: number[];
};

function getOrCreateFasState(map: Map<string, FasSbFibreState>, sbName: string): FasSbFibreState {
  const key = normaliseDpLookup(sbName);
  let current = map.get(key);
  if (!current) {
    current = { sbName, spliceFibres: [], splitterFibres: [] };
    map.set(key, current);
  }
  return current;
}

function parseFasSbFibreStatesFromRows(rows: any[][]): FasSbFibreState[] {
  const states = new Map<string, FasSbFibreState>();

  rows.slice(1).forEach((row) => {
    if (!Array.isArray(row)) return;

    const hops: { cableName: string; fibre: number; endpoint: string; sbName: string; isSplitterEndpoint: boolean }[] = [];

    for (let col = 2; col + 2 < row.length; col += 3) {
      const cableName = cleanFasCell(row[col]);
      const fibre = readFasFibre(row[col + 1]);
      const endpoint = cleanFasCell(row[col + 2]);
      const sbName = normaliseFasSbName(endpoint);
      const isSplitterEndpoint = /-SP\d+\b/i.test(endpoint);

      if (cableName && fibre && sbName) {
        hops.push({ cableName, fibre, endpoint, sbName, isSplitterEndpoint });
      }
    }

    hops.forEach((hop, index) => {
      const nextHop = hops[index + 1];
      const state = getOrCreateFasState(states, hop.sbName);

      // If the row continues onto another cable/SB after this endpoint, this
      // fibre is physically spliced in the current SB. Example:
      // 96FULW01 F53 -> SB25, then 48FULW01 F1 -> SB22-SP1.
      if (nextHop && !refsLookLikeSameAsset(hop.sbName, nextHop.sbName)) {
        state.spliceFibres = Array.from(new Set([...state.spliceFibres, hop.fibre])).sort((a, b) => a - b);
        return;
      }

      // If the endpoint is explicitly a splitter port and there is no onward
      // cable on the row, the fibre feeds the local splitter.
      if (hop.isSplitterEndpoint) {
        state.splitterFibres = Array.from(new Set([...state.splitterFibres, hop.fibre])).sort((a, b) => a - b);
      }
    });
  });

  return Array.from(states.values()).filter((state) => state.spliceFibres.length || state.splitterFibres.length);
}

async function readFasSbFibreStatesFromFile(file: File): Promise<FasSbFibreState[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!worksheet) return [];
  const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: "" });
  return parseFasSbFibreStatesFromRows(rows);
}


type ParentSbReservationSummary = {
  parentName: string;
  childName: string;
  branchCableName: string;
  fibresNeeded: number;
  parentFibres: number[];
  localFibres: number[];
  mappingRows: { parent: number; local: number }[];
  isShootOff: boolean;
};

function buildParentSbReservationSummary(args: {
  currentDpId?: string | null;
  selectedCable?: SavedMapAsset | null;
  selectedCableId?: string;
  currentInputFibres: number[];
  allDistributionPoints: SavedMapAsset[];
  allAssets: SavedMapAsset[];
}): ParentSbReservationSummary | null {
  const {
    currentDpId,
    selectedCable,
    selectedCableId,
    currentInputFibres,
    allDistributionPoints,
    allAssets,
  } = args;

  const distributionPoints = allDistributionPoints.length
    ? allDistributionPoints
    : allAssets.filter((asset: any) => asset?.assetType === "distribution-point");

  const child =
    findAssetByAnyReference(distributionPoints, [currentDpId]) || null;
  if (!child || !selectedCableId) return null;

  const cable =
    selectedCable ||
    allAssets.find((asset) =>
      refsLookLikeSameAsset(asset?.id, selectedCableId),
    ) ||
    null;

  const cableData = cable as any;
  const childIdentities = assetIdentityValues(child);

  const endpointRefs = [
    cableData?.fromAssetId,
    cableData?.fromId,
    cableData?.sourceAssetId,
    cableData?.sourceId,
    cableData?.aEndAssetId,
    cableData?.startAssetId,
    cableData?.toAssetId,
    cableData?.toId,
    cableData?.targetAssetId,
    cableData?.targetId,
    cableData?.zEndAssetId,
    cableData?.endAssetId,
  ].filter(Boolean);

  const parentByEndpoint = distributionPoints.find((candidate) => {
    if (candidate.id === child.id) return false;
    const candidateIdentities = assetIdentityValues(candidate);
    const endpointMatchesCandidate = endpointRefs.some((ref) =>
      candidateIdentities.some((identity) => refsLookLikeSameAsset(ref, identity)),
    );
    const endpointMatchesChild = endpointRefs.some((ref) =>
      childIdentities.some((identity) => refsLookLikeSameAsset(ref, identity)),
    );
    return endpointMatchesCandidate && endpointMatchesChild;
  });

  const explicitParent = findAssetByAnyReference(distributionPoints, [
    cableData?.parentDpId,
    cableData?.parentAssetId,
    cableData?.upstreamDpId,
    cableData?.upstreamAssetId,
    (child as any)?.parentDpId,
    (child as any)?.parentAssetId,
    (child as any)?.dpDetails?.parentDpId,
    (child as any)?.dpDetails?.parentAssetId,
    (child as any)?.dpDetails?.upstreamDpId,
    (child as any)?.dpDetails?.upstreamAssetId,
  ]);

  const parent = explicitParent || parentByEndpoint || null;

  const localFibres = readPositiveFibres([
    currentInputFibres,
    (child as any)?.dpDetails?.afnDetails?.inputFibres,
    (child as any)?.dpDetails?.mduDetails?.inputFibres,
    (child as any)?.dpDetails?.autoFibrePlan?.inputFibres,
  ]);

  const parentFibres = readPositiveFibres([
    cableData?.allocatedInputFibres,
    cableData?.parentInputFibres,
    cableData?.upstreamInputFibres,
    cableData?.sourceFibres,
    cableData?.sourceFibreNumbers,
    cableData?.parentFibres,
    cableData?.reservationFibres,
    cableData?.reservedFibres,
  ]);

  const fibresNeeded = Math.max(localFibres.length, parentFibres.length);
  if (!fibresNeeded) return null;

  const mappingRows = Array.from({ length: Math.min(parentFibres.length, localFibres.length) }, (_, index) => ({
    parent: parentFibres[index],
    local: localFibres[index],
  }));

  return {
    parentName: parent ? getDpDisplayName(parent) : "Parent SB",
    childName: getDpDisplayName(child),
    branchCableName: cable
      ? normaliseCableLabel((cable as any).name || (cable as any).cableId || cable.id)
      : normaliseCableLabel(selectedCableId),
    fibresNeeded,
    parentFibres,
    localFibres,
    mappingRows,
    isShootOff: Boolean(parent && parent.id !== child.id),
  };
}

const helpText: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: "0.82rem",
  lineHeight: 1.35,
  marginTop: 4,
};

const miniGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginTop: 8,
};

const photoCard: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: 8,
};

const photoImg: React.CSSProperties = {
  width: "100%",
  height: 95,
  objectFit: "cover",
  borderRadius: 6,
  display: "block",
};

const docRow: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  background: "#111827",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "7px 8px",
  marginTop: 6,
  fontSize: "0.85rem",
};

const modeBannerStyle = (
  activeMode: "survey" | "build" | "maintenance",
): React.CSSProperties => ({
  background:
    activeMode === "maintenance"
      ? "#7f1d1d"
      : activeMode === "build"
        ? "#1e3a8a"
        : "#14532d",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 12,
  padding: 12,
  marginBottom: 16,
});

function WorkflowModeBanner({
  activeMode,
}: {
  activeMode: "survey" | "build" | "maintenance";
}) {
  return (
    <div style={modeBannerStyle(activeMode)}>
      <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
        Current Workflow Mode
      </div>

      <div style={{ fontWeight: 800, fontSize: 16 }}>
        {activeMode === "survey" && "Survey Mode"}
        {activeMode === "build" && "Build Mode"}
        {activeMode === "maintenance" && "Maintenance Mode"}
      </div>

      <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
        {activeMode === "survey" && "Fast planning and survey workflow active."}
        {activeMode === "build" && "Operational build workflow active."}
        {activeMode === "maintenance" &&
          "Audit and maintenance traceability active."}
      </div>
    </div>
  );
}

export default function AssetDetailsSidebarSections({
  assetType,
  poleDetails,
  chamberDetails,
  dpDetails,
  onChangePoleDetails,
  onChangeChamberDetails,
  onChangeDpDetails,
  onRebuildThroughCableReservations,
  connectedHomes = [],
  availableThroughCables = [],
  allDistributionPoints = [],
  allAssets = [],
  currentDpId,
  inputStyle,
  labelStyle,
  secondaryButtonStyle,
}: Props) {
  const { activeMode } = useAppMode();
  const [uploading, setUploading] = useState(false);
  const [connectedHomesOpen, setConnectedHomesOpen] = useState(false);
  const [manualFromSbId, setManualFromSbId] = useState("");
  const [manualToSbId, setManualToSbId] = useState("");
  const [manualParentFibres, setManualParentFibres] = useState("");
  const [manualLocalFibres, setManualLocalFibres] = useState("");
  const [manualSupportingCable, setManualSupportingCable] = useState("");
  const [manualRouteNote, setManualRouteNote] = useState("");
  const [fasImportStatus, setFasImportStatus] = useState("");

  const allDpOptions = useMemo(
    () => {
      const byId = new Map<string, SavedMapAsset>();
      [...allDistributionPoints, ...allAssets.filter((asset) => asset.assetType === "distribution-point")].forEach((asset) => {
        if (asset?.id) byId.set(asset.id, asset);
      });
      return Array.from(byId.values()).sort((a, b) => getDpDisplayName(a).localeCompare(getDpDisplayName(b), undefined, { numeric: true, sensitivity: "base" }));
    },
    [allAssets, allDistributionPoints],
  );

  const currentDpAsset = useMemo(
    () =>
      allDpOptions.find((asset) => refsLookLikeSameAsset(asset.id, currentDpId)) ||
      allDpOptions.find((asset) => refsLookLikeSameAsset(getDpDisplayName(asset), currentDpId)) ||
      null,
    [allDpOptions, currentDpId],
  );

  const optionalSupportingCables = useMemo(
    () => {
      const byId = new Map<string, SavedMapAsset>();
      [...availableThroughCables, ...allAssets.filter(isThroughCableOption)].forEach((asset) => {
        if (asset?.id) byId.set(asset.id, asset);
      });
      return Array.from(byId.values()).sort((a, b) => normaliseCableLabel((a as any).name || (a as any).cableId || a.id).localeCompare(normaliseCableLabel((b as any).name || (b as any).cableId || b.id), undefined, { numeric: true, sensitivity: "base" }));
    },
    [allAssets, availableThroughCables],
  );

  const primarySbRoute = useMemo(() => {
    const routes = getStoredSbRoutes(dpDetails as any);
    if (!routes.length) return null;
    const currentRefs = [currentDpId, manualToSbId].map(normaliseDpLookup).filter(Boolean);
    return routes.find((route) => {
      const routeRefs = [route.toSbId, route.toSbName].map(normaliseDpLookup).filter(Boolean);
      return routeRefs.length && currentRefs.some((ref) => routeRefs.some((routeRef) => refsLookLikeSameAsset(ref, routeRef)));
    }) || routes[0];
  }, [currentDpId, dpDetails, manualToSbId]);

  useEffect(() => {
    const route = getStoredSbRoutes(dpDetails as any)[0];
    const routeSupportingCableId =
      route?.supportingCableId ||
      optionalSupportingCables.find((asset) =>
        [asset.id, (asset as any).name, (asset as any).cableId].some((value) =>
          refsLookLikeSameAsset(value, route?.supportingCableName),
        ),
      )?.id ||
      "";
    setManualFromSbId(route?.fromSbId || "");
    setManualToSbId(route?.toSbId || currentDpId || "");
    setManualParentFibres(formatFibreList(route?.parentFibres));
    setManualLocalFibres(formatFibreList(route?.localFibres));
    setManualSupportingCable(routeSupportingCableId);
    setManualRouteNote(route?.note || "");
  }, [currentDpId, dpDetails, optionalSupportingCables]);

  function applyManualSbRoute() {
    const fromAsset = allDpOptions.find((asset) => asset.id === manualFromSbId) || null;
    const toAsset = allDpOptions.find((asset) => asset.id === manualToSbId) || null;
    let supportCable =
      optionalSupportingCables.find((asset) => asset.id === manualSupportingCable) || null;
    const parentFibres = parseFibreListInput(manualParentFibres);
    const localFibres = parseFibreListInput(manualLocalFibres);

    if (!fromAsset || !toAsset) {
      alert("Select both the source SB and target SB before applying the route.");
      return;
    }

    if (!parentFibres.length || !localFibres.length) {
      alert("Enter parent and local fibres, for example 13,14,15 to 1,2,3.");
      return;
    }

    if (!supportCable) {
      supportCable = findSupportingCableForSbRoute(
        fromAsset,
        toAsset,
        optionalSupportingCables,
      );
    }

    if (supportCable?.id) {
      setManualSupportingCable(supportCable.id);
    }

    const nextRoute: ManualSbRoute = {
      id: `${fromAsset.id || getDpDisplayName(fromAsset)}__${toAsset.id || getDpDisplayName(toAsset)}`,
      fromSbId: fromAsset.id,
      fromSbName: getDpDisplayName(fromAsset),
      toSbId: toAsset.id,
      toSbName: getDpDisplayName(toAsset),
      parentFibres,
      localFibres,
      supportingCableId: supportCable?.id || undefined,
      supportingCableName: supportCable ? normaliseCableLabel((supportCable as any).name || (supportCable as any).cableId || supportCable.id) : undefined,
      note: manualRouteNote.trim() || undefined,
    };

    const existingRoutes = getStoredSbRoutes(dpDetails as any).filter((route) => route.id !== nextRoute.id);

    onChangeDpDetails({
      ...dpDetails,
      closureType: "AFN",
      connectionsToHomes: localFibres.length * 8,
      afnDetails: {
        ...(dpDetails.afnDetails || {}),
        enabled: true,
        relationshipLed: true,
        splitterRatio: "1:8",
        splitterOutputs: 8,
        inputFibres: localFibres,
        splitterFibres: localFibres,
        fibreCountUsed: localFibres.length,
        // SB → SB route remains the authority. throughCableId is kept in sync
        // as supporting cable evidence so legacy QA does not flag a false issue.
        throughCableId: supportCable?.id,
        throughCableName: supportCable
          ? normaliseCableLabel((supportCable as any).name || (supportCable as any).cableId || supportCable.id)
          : undefined,
        parentInputFibres: parentFibres,
        sbToSbRoutes: [nextRoute, ...existingRoutes],
      },
      autoFibrePlan: undefined,
    } as DistributionPointDetails);
  }



  async function importFasRoutesForCurrentDp(file: File | null) {
    if (!file) return;

    const currentDp = allDpOptions.find((asset) => asset.id === (manualToSbId || currentDpId)) ||
      allDpOptions.find((asset) => asset.id === currentDpId) ||
      null;

    if (!currentDp) {
      alert("Select or open the target SB before importing the FAS sheet.");
      return;
    }

    setFasImportStatus("Reading FAS sheet...");

    try {
      const [importedRoutes, importedStates] = await Promise.all([
        readFasSbRoutesFromFile(file),
        readFasSbFibreStatesFromFile(file),
      ]);
      const currentRefs = [currentDp.id, getDpDisplayName(currentDp)].map(normaliseDpLookup).filter(Boolean);
      const currentFibreState = importedStates.find((state) =>
        currentRefs.some((ref) => refsLookLikeSameAsset(ref, state.sbName)),
      ) || null;

      const matchingRoutes = importedRoutes
        .filter((route) => {
          const routeRefs = [route.fromSbId, route.fromSbName, route.toSbId, route.toSbName].map(normaliseDpLookup).filter(Boolean);
          return routeRefs.some((routeRef) => currentRefs.some((ref) => refsLookLikeSameAsset(ref, routeRef)));
        })
        .map((route) => {
          const currentIsFrom = [route.fromSbId, route.fromSbName]
            .map(normaliseDpLookup)
            .filter(Boolean)
            .some((routeRef) => currentRefs.some((ref) => refsLookLikeSameAsset(ref, routeRef)));
          const currentIsTo = [route.toSbId, route.toSbName]
            .map(normaliseDpLookup)
            .filter(Boolean)
            .some((routeRef) => currentRefs.some((ref) => refsLookLikeSameAsset(ref, routeRef)));
          const fromAsset = currentIsFrom
            ? currentDp
            : allDpOptions.find((asset) =>
                [asset.id, getDpDisplayName(asset)].some((value) => refsLookLikeSameAsset(value, route.fromSbName)),
              );
          const toAsset = currentIsTo
            ? currentDp
            : allDpOptions.find((asset) =>
                [asset.id, getDpDisplayName(asset)].some((value) => refsLookLikeSameAsset(value, route.toSbName)),
              );
          const supportCable =
            optionalSupportingCables.find((asset) =>
              [asset.id, (asset as any).name, (asset as any).cableId].some((value) =>
                refsLookLikeSameAsset(value, route.supportingCableName),
              ),
            ) ||
            findSupportingCableForSbRoute(
              fromAsset || null,
              toAsset || null,
              optionalSupportingCables,
            );
          return {
            ...route,
            id: `${fromAsset?.id || route.fromSbName}__${toAsset?.id || route.toSbName}__${supportCable?.id || route.supportingCableName || "fas"}`,
            fromSbId: fromAsset?.id || route.fromSbId,
            fromSbName: fromAsset ? getDpDisplayName(fromAsset) : route.fromSbName,
            toSbId: toAsset?.id || route.toSbId,
            toSbName: toAsset ? getDpDisplayName(toAsset) : route.toSbName,
            supportingCableId: supportCable?.id || route.supportingCableId,
            supportingCableName: supportCable
              ? normaliseCableLabel((supportCable as any).name || (supportCable as any).cableId || supportCable.id)
              : route.supportingCableName,
            note: `Imported from ${file.name}`,
          } as ManualSbRoute;
        });

      if (!matchingRoutes.length && !currentFibreState) {
        setFasImportStatus(`No FAS SB routes found for ${getDpDisplayName(currentDp)}.`);
        return;
      }

      const primaryRoute = matchingRoutes[0] || null;
      const routesEndingAtCurrent = matchingRoutes.filter((route) =>
        [route.toSbId, route.toSbName]
          .map(normaliseDpLookup)
          .filter(Boolean)
          .some((routeRef) => currentRefs.some((ref) => refsLookLikeSameAsset(ref, routeRef))),
      );
      const routesStartingAtCurrent = matchingRoutes.filter((route) =>
        [route.fromSbId, route.fromSbName]
          .map(normaliseDpLookup)
          .filter(Boolean)
          .some((routeRef) => currentRefs.some((ref) => refsLookLikeSameAsset(ref, routeRef))),
      );

      // Local splitter fibres must be fibres that terminate on this SB's splitter.
      // For a parent SB such as SB25, branch local fibres F1-F8 belong to the
      // outgoing 48F/12F branch cable and must NOT be shown as splitter fibres
      // on the incoming 96F. The FAS fibre-state parser supplies the real
      // splitter fibres such as F61-F62.
      const importedLocalFibres = readPositiveFibres([
        currentFibreState?.splitterFibres || [],
        ...(currentFibreState?.splitterFibres?.length
          ? []
          : routesEndingAtCurrent.flatMap((route) => route.localFibres || [])),
      ]);

      // Splice fibres are parent/main-run fibres that stop at this SB and are
      // joined onto another outgoing branch cable, for example 96F F53-F60 at
      // SB25 spliced to 48F F1-F8. Prefer the dedicated FAS fibre-state parse;
      // fall back to route parent fibres only when that state is unavailable.
      const importedSpliceFibres = readPositiveFibres([
        currentFibreState?.spliceFibres || [],
        ...(currentFibreState?.spliceFibres?.length
          ? []
          : routesStartingAtCurrent.flatMap((route) => route.parentFibres || [])),
      ]);
      const existingRoutes = getStoredSbRoutes(dpDetails as any).filter(
        (route) => !matchingRoutes.some((next) => next.id === route.id),
      );
      const localFibres = importedLocalFibres;
      const spliceFibres = importedSpliceFibres;

      onChangeDpDetails({
        ...dpDetails,
        closureType: "AFN",
        connectionsToHomes: localFibres.length * 8 || dpDetails.connectionsToHomes || 8,
        afnDetails: {
          ...(dpDetails.afnDetails || {}),
          enabled: true,
          relationshipLed: true,
          splitterRatio: "1:8",
          splitterOutputs: 8,
          inputFibres: localFibres,
          splitterFibres: localFibres,
          spliceFibres,
          fibreCountUsed: localFibres.length + spliceFibres.length,
          // SB → SB route remains the authority. throughCableId is kept in sync
          // as supporting cable evidence so legacy QA does not flag a false issue.
          throughCableId: primaryRoute?.supportingCableId,
          throughCableName: primaryRoute?.supportingCableName,
          parentInputFibres: primaryRoute?.parentFibres || spliceFibres || [],
          sbToSbRoutes: [...matchingRoutes, ...existingRoutes],
        },
        autoFibrePlan: undefined,
      } as DistributionPointDetails);

      if (primaryRoute) {
        setManualFromSbId(primaryRoute.fromSbId || "");
        setManualToSbId(primaryRoute.toSbId || currentDp.id || "");
        setManualParentFibres(formatFibreList(primaryRoute.parentFibres));
        setManualLocalFibres(formatFibreList(primaryRoute.localFibres));
        setManualSupportingCable(primaryRoute.supportingCableId || "");
        setManualRouteNote(primaryRoute.note || "");
      }
      setFasImportStatus(`Imported ${matchingRoutes.length} SB route${matchingRoutes.length === 1 ? "" : "s"}, ${spliceFibres.length} splice fibre${spliceFibres.length === 1 ? "" : "s"} and ${localFibres.length} splitter fibre${localFibres.length === 1 ? "" : "s"} for ${getDpDisplayName(currentDp)}.`);
    } catch (err) {
      console.error("Failed to import FAS SB routes", err);
      setFasImportStatus("Could not read this FAS sheet.");
    }
  }

  const updatePole = (key: keyof PoleDetails, value: any) => {
    onChangePoleDetails({ ...poleDetails, [key]: value });
  };

  const updateChamber = (key: keyof ChamberDetails, value: any) => {
    onChangeChamberDetails({ ...chamberDetails, [key]: value });
  };

  const updateDp = (
    key: keyof DistributionPointDetails | string,
    value: any,
  ) => {
    onChangeDpDetails({
      ...(dpDetails as any),
      [key]: value,
    } as DistributionPointDetails);
  };

  async function uploadPhotos(
    kind: "poles" | "chambers",
    files: FileList | null,
    max: number,
  ) {
    const current = keepSavedUrls(
      kind === "poles" ? poleDetails.photos || [] : chamberDetails.photos || [],
    );
    const nextFiles = Array.from(files || []).slice(
      0,
      Math.max(0, max - current.length),
    );
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        nextFiles.map((file) => uploadAssetFile(`${kind}/photos`, file)),
      );
      if (kind === "poles")
        updatePole("photos", [...current, ...uploaded].slice(0, max));
      else updateChamber("photos", [...current, ...uploaded].slice(0, max));
    } finally {
      setUploading(false);
    }
  }

  async function uploadDocuments(
    kind: "poles" | "chambers",
    files: FileList | null,
  ) {
    const current =
      kind === "poles"
        ? poleDetails.documents || []
        : chamberDetails.documents || [];
    const nextFiles = Array.from(files || []);
    if (nextFiles.length === 0) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        nextFiles.map((file) => uploadAssetFile(`${kind}/documents`, file)),
      );
      if (kind === "poles") updatePole("documents", [...current, ...uploaded]);
      else updateChamber("documents", [...current, ...uploaded]);
    } finally {
      setUploading(false);
    }
  }

  async function uploadDpImage(file: File | null) {
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadAssetFile("distribution-points", file);
      updateDp("image", url);
    } finally {
      setUploading(false);
    }
  }

  const selectedCableId =
    dpDetails.afnDetails?.throughCableId ||
    primarySbRoute?.supportingCableId ||
    dpDetails.mduDetails?.throughCableId ||
    "";

  const afnThroughCableOptions = useMemo(() => {
    const byId = new Map<string, SavedMapAsset>();

    [
      ...availableThroughCables,
      ...allAssets.filter(isThroughCableOption),
    ].forEach((cable) => {
      if (!cable?.id || cable.id === currentDpId) return;
      byId.set(cable.id, cable);
    });

    return Array.from(byId.values()).sort((a, b) => {
      const aName = normaliseCableLabel(
        (a as any).name || (a as any).cableId || a.id,
      );
      const bName = normaliseCableLabel(
        (b as any).name || (b as any).cableId || b.id,
      );
      return aName.localeCompare(bName, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }, [availableThroughCables, allAssets, currentDpId]);

  const selectedCable =
    afnThroughCableOptions.find((cable) => cable.id === selectedCableId) ||
    allAssets.find((asset) => asset.id === selectedCableId);
  const currentInputFibres =
    dpDetails.afnDetails?.inputFibres ||
    dpDetails.mduDetails?.inputFibres ||
    [];

  const usedByOtherReservations = useMemo(() => {
    const used = new Set<number>();
    allDistributionPoints.forEach((asset) => {
      if (asset.id === currentDpId) return;
      const afn = asset.dpDetails?.afnDetails;
      const mdu = asset.dpDetails?.mduDetails;
      const throughCableId = afn?.throughCableId || mdu?.throughCableId || "";
      if (!throughCableId || throughCableId !== selectedCableId) return;
      [...(afn?.inputFibres || []), ...(mdu?.inputFibres || [])].forEach(
        (fibre) => used.add(Number(fibre)),
      );
    });
    allAssets.forEach((asset) => {
      if (asset.assetType !== "cable") return;
      if ((asset as any).parentCableId !== selectedCableId) return;
      ((asset as any).allocatedInputFibres || []).forEach((fibre: unknown) => {
        const fibreNumber = Number(fibre);
        if (Number.isFinite(fibreNumber)) used.add(fibreNumber);
      });
    });
    return used;
  }, [allDistributionPoints, allAssets, currentDpId, selectedCableId]);

  const fibreTotal =
    Number(String(selectedCable?.fibreCount || "48F").replace(/\D/g, "")) || 48;
  const dpCapacity =
    dpDetails.closureType === "AFN"
      ? Number(
          dpDetails.autoFibrePlan?.capacity || currentInputFibres.length * 8,
        )
      : dpDetails.closureType === "MDU" || dpDetails.closureType === "MDU_SPLITTER"
        ? Number(
            dpDetails.autoFibrePlan?.capacity ||
              dpDetails.connectionsToHomes ||
              connectedHomes.length ||
              0,
          )
        : Number(
            dpDetails.connectionsToHomes ||
              dpDetails.autoFibrePlan?.capacity ||
              0,
          );
  const dpUsed = connectedHomes.length;
  const dpAvailable = Math.max(0, dpCapacity - dpUsed);

  const dpAutoFibrePlan = useMemo(
    () =>
      buildDpFibrePlan({
        closureType: dpDetails.closureType || "CBT",
        connectedHomes: dpUsed,
        currentInputFibres,
        mduFibres: dpDetails.mduDetails?.mduFibres,
        mduSplitterFibres: dpDetails.mduDetails?.splitterFibres,
      }),
    [
      dpDetails.closureType,
      dpDetails.mduDetails?.mduFibres,
      dpDetails.mduDetails?.splitterFibres,
      dpUsed,
      currentInputFibres,
    ],
  );

  const architectureWarnings = useMemo(
    () =>
      getArchitectureConsistencyWarnings({
        currentDpId,
        currentClosureType: dpDetails.closureType || "CBT",
        currentThroughCableId:
          selectedCableId || dpDetails.mduDetails?.throughCableId || null,
        allDistributionPoints,
      }),
    [
      currentDpId,
      dpDetails.closureType,
      dpDetails.mduDetails?.throughCableId,
      selectedCableId,
      allDistributionPoints,
    ],
  );

  const suggestedFibreAllocation = useMemo(() => {
    if (dpAutoFibrePlan.architecture === "CBT") return null;

    return allocateDpFibresForPlan({
      currentDpId,
      currentClosureType: dpDetails.closureType,
      currentDpDetails: dpDetails,
      connectedHomes: dpUsed,
      plan: dpAutoFibrePlan,
      selectedThroughCableId:
        selectedCableId || dpDetails.mduDetails?.throughCableId || null,
      availableThroughCables,
      allDistributionPoints,
      allAssets,
    });
  }, [
    allAssets,
    allDistributionPoints,
    availableThroughCables,
    currentDpId,
    dpAutoFibrePlan,
    dpDetails,
    dpUsed,
    selectedCableId,
  ]);

  const parentSbReservationSummary = useMemo(
    () =>
      buildParentSbReservationSummary({
        currentDpId,
        selectedCable,
        selectedCableId,
        currentInputFibres,
        allDistributionPoints,
        allAssets,
      }),
    [
      allAssets,
      allDistributionPoints,
      currentDpId,
      currentInputFibres,
      selectedCable,
      selectedCableId,
    ],
  );

  function applyAutoFibrePlan() {
    const allocation = suggestedFibreAllocation || undefined;
    onChangeDpDetails(
      applyDpFibrePlanToDetails(
        dpDetails,
        dpAutoFibrePlan,
        allocation || undefined,
      ),
    );
  }

  function rebuildSelectedThroughCableChain() {
    const throughCableId =
      selectedCableId ||
      dpDetails.mduDetails?.throughCableId ||
      suggestedFibreAllocation?.throughCableId ||
      "";

    const result = rebuildThroughCableReservations({
      throughCableId,
      currentDpId,
      currentDpDetails: dpDetails,
      currentPlan: dpAutoFibrePlan,
      connectedHomes: dpUsed,
      availableThroughCables,
      allDistributionPoints,
      allAssets,
    });

    if (result.warnings.length) {
      alert(result.warnings.join("\n"));
    }

    if (!result.updates.length) return;

    const currentUpdate = result.updates.find(
      (update) => String(update.assetId) === String(currentDpId || ""),
    );

    if (currentUpdate?.dpDetails) {
      onChangeDpDetails(currentUpdate.dpDetails as DistributionPointDetails);
    }

    onRebuildThroughCableReservations?.(result);
  }

  function updateAfnDetails(
    next: Partial<NonNullable<DistributionPointDetails["afnDetails"]>>,
  ) {
    const nextFibres = next.inputFibres || currentInputFibres;
    onChangeDpDetails({
      ...dpDetails,
      closureType: "AFN",
      connectionsToHomes: nextFibres.length * 8,
      afnDetails: {
        enabled: true,
        throughCableId: selectedCableId || undefined,
        inputFibres: nextFibres,
        fibreCountUsed: nextFibres.length,
        splitterRatio: "1:8",
        splitterOutputs: 8,
        ...dpDetails.afnDetails,
        ...next,
      },
    });
  }

  function toggleFibre(fibre: number) {
    const selectedHere = currentInputFibres.includes(fibre);
    if (selectedHere) {
      updateAfnDetails({
        inputFibres: currentInputFibres.filter((item) => item !== fibre),
      });
      return;
    }
    if (currentInputFibres.length >= 24 || usedByOtherReservations.has(fibre))
      return;
    updateAfnDetails({
      inputFibres: [...currentInputFibres, fibre].sort((a, b) => a - b),
    });
  }

  if (assetType === "pole") {
    const photos = keepSavedUrls(poleDetails.photos || []);
    const documents = poleDetails.documents || [];
    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #334155",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Pole Details</div>

        <div style={labelStyle}>Pole Type</div>
        <select
          value={poleDetails.poleType || "new"}
          onChange={(e) => updatePole("poleType", e.target.value)}
          style={inputStyle}
        >
          <option value="new">New Pole</option>
          <option value="or">OR Pole</option>
        </select>

        <div style={labelStyle}>Size</div>
        <input
          value={poleDetails.size || ""}
          onChange={(e) => updatePole("size", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Year</div>
        <input
          value={poleDetails.year || ""}
          onChange={(e) => updatePole("year", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Special Markings</div>
        <input
          value={poleDetails.specialMarkings || ""}
          onChange={(e) => updatePole("specialMarkings", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Test Date</div>
        <input
          type="date"
          value={poleDetails.testDate || ""}
          onChange={(e) => updatePole("testDate", e.target.value)}
          style={inputStyle}
        />

        <div style={labelStyle}>Location</div>
        <select
          value={poleDetails.locationType || "Kerbside"}
          onChange={(e) => updatePole("locationType", e.target.value)}
          style={inputStyle}
        >
          <option>Kerbside</option>
          <option>House Boundary</option>
        </select>

        <div style={labelStyle}>Photos (max 4)</div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => uploadPhotos("poles", e.target.files, 4)}
          style={inputStyle}
        />
        {photos.length > 0 ? (
          <div style={miniGrid}>
            {photos.map((photo, index) => (
              <div key={photo} style={photoCard}>
                <img src={photo} style={photoImg} />
                <button
                  type="button"
                  onClick={() =>
                    updatePole(
                      "photos",
                      photos.filter((_, i) => i !== index),
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    width: "100%",
                    marginTop: 6,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={labelStyle}>Documents</div>
        <input
          type="file"
          multiple
          disabled={uploading}
          onChange={(e) => uploadDocuments("poles", e.target.files)}
          style={inputStyle}
        />
        {documents.map((doc, index) => (
          <div key={`${doc}-${index}`} style={docRow}>
            <span>{niceDocName(doc)}</span>
            <button
              type="button"
              onClick={() =>
                updatePole(
                  "documents",
                  documents.filter((_, i) => i !== index),
                )
              }
              style={secondaryButtonStyle}
            >
              Remove
            </button>
          </div>
        ))}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  if (assetType === "chamber") {
    const photos = keepSavedUrls(chamberDetails.photos || []);
    const documents = chamberDetails.documents || [];
    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #334155",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>Chamber Details</div>

        <div style={labelStyle}>Chamber Type</div>
        <select
          value={chamberDetails.chamberType || "fw2"}
          onChange={(e) => updateChamber("chamberType", e.target.value)}
          style={inputStyle}
        >
          <option value="fw2">FW2</option>
          <option value="fw4">FW4</option>
          <option value="fw6">FW6</option>
          <option value="fw10">FW10</option>
        </select>

        <div style={labelStyle}>Size</div>
        <input
          value={chamberDetails.size || ""}
          onChange={(e) => updateChamber("size", e.target.value)}
          placeholder="600x450"
          style={inputStyle}
        />

        <div style={labelStyle}>Depth</div>
        <input
          value={chamberDetails.depth || ""}
          onChange={(e) => updateChamber("depth", e.target.value)}
          placeholder="750mm"
          style={inputStyle}
        />

        <div style={labelStyle}>Lid Type</div>
        <input
          value={chamberDetails.lidType || ""}
          onChange={(e) => updateChamber("lidType", e.target.value)}
          placeholder="Single / Double / Composite"
          style={inputStyle}
        />

        <div style={labelStyle}>Condition</div>
        <input
          value={chamberDetails.condition || ""}
          onChange={(e) => updateChamber("condition", e.target.value)}
          placeholder="Good / Damaged / Flooded"
          style={inputStyle}
        />

        <div style={labelStyle}>Connected Ducts</div>
        <input
          value={chamberDetails.connectedDucts || ""}
          onChange={(e) => updateChamber("connectedDucts", e.target.value)}
          placeholder="2 in / 2 out"
          style={inputStyle}
        />

        <div style={labelStyle}>Photos (max 6)</div>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={uploading}
          onChange={(e) => uploadPhotos("chambers", e.target.files, 6)}
          style={inputStyle}
        />
        {photos.length > 0 ? (
          <div style={miniGrid}>
            {photos.map((photo, index) => (
              <div key={photo} style={photoCard}>
                <img src={photo} style={photoImg} />
                <button
                  type="button"
                  onClick={() =>
                    updateChamber(
                      "photos",
                      photos.filter((_, i) => i !== index),
                    )
                  }
                  style={{
                    ...secondaryButtonStyle,
                    width: "100%",
                    marginTop: 6,
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div style={labelStyle}>Documents</div>
        <input
          type="file"
          multiple
          disabled={uploading}
          onChange={(e) => uploadDocuments("chambers", e.target.files)}
          style={inputStyle}
        />
        {documents.map((doc, index) => (
          <div key={`${doc}-${index}`} style={docRow}>
            <span>{niceDocName(doc)}</span>
            <button
              type="button"
              onClick={() =>
                updateChamber(
                  "documents",
                  documents.filter((_, i) => i !== index),
                )
              }
              style={secondaryButtonStyle}
            >
              Remove
            </button>
          </div>
        ))}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }

  if (assetType === "distribution-point") {
    const previewImage = String((dpDetails as any).image || "");
    const selectedManualRoute = primarySbRoute;
    const localFibres = parseFibreListInput(manualLocalFibres || formatFibreList(selectedManualRoute?.localFibres));
    const parentFibres = parseFibreListInput(manualParentFibres || formatFibreList(selectedManualRoute?.parentFibres));
    const dpCapacityManual = dpDetails.closureType === "AFN"
      ? localFibres.length * 8
      : Number(dpDetails.connectionsToHomes || 8);
    const dpUsedManual = connectedHomes.length;
    const dpAvailableManual = Math.max(0, dpCapacityManual - dpUsedManual);

    return (
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid #334155",
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          Distribution Point Details
        </div>

        <div style={labelStyle}>Build Status</div>
        <select
          value={getDpStatusForSidebar(currentDpAsset, dpDetails)}
          onChange={(e) => updateDp("buildStatus", e.target.value)}
          style={inputStyle}
        >
          <option value="Planned">Planned</option>
          <option value="Built">Built</option>
          <option value="Tested">Tested</option>
          <option value="Live">Live</option>
          <option value="BWIP">BWIP</option>
          <option value="Live not ready for service">Live not ready for service</option>
          <option value="Unserviceable">Unserviceable</option>
          <option value="Blocked">Blocked</option>
        </select>

        <div style={labelStyle}>Closure Type</div>
        <select
          value={dpDetails.closureType || "CBT"}
          onChange={(e) => {
            const closureType = e.target.value as "CBT" | "AFN" | "MDU" | "MDU_SPLITTER";
            onChangeDpDetails({
              ...dpDetails,
              closureType,
              connectionsToHomes:
                closureType === "AFN"
                  ? localFibres.length * 8
                  : dpDetails.connectionsToHomes || 8,
              afnDetails:
                closureType === "AFN"
                  ? {
                      ...(dpDetails.afnDetails || {}),
                      enabled: true,
                      relationshipLed: true,
                      splitterRatio: "1:8",
                      splitterOutputs: 8,
                      throughCableId: undefined,
                    }
                  : undefined,
              mduDetails:
                closureType === "MDU" || closureType === "MDU_SPLITTER"
                  ? dpDetails.mduDetails || {
                      enabled: true,
                      mduFibres: 6,
                      splitterFibres: closureType === "MDU_SPLITTER" ? 2 : 0,
                      totalReservedFibres: closureType === "MDU_SPLITTER" ? 8 : 6,
                      inputFibres: [],
                    }
                  : undefined,
              autoFibrePlan: undefined,
            } as DistributionPointDetails);
          }}
          style={inputStyle}
        >
          <option value="CBT">CBT</option>
          <option value="AFN">AFN / SB</option>
          <option value="MDU">MDU Direct Feed</option>
          <option value="MDU_SPLITTER">MDU + Splitter</option>
        </select>

        <div style={labelStyle}>DP Role</div>
        <select
          value={(dpDetails as any).dpRole || "serving"}
          onChange={(e) => updateDp("dpRole", e.target.value)}
          style={inputStyle}
        >
          <option value="serving">Serving DP</option>
          <option value="splice_only">Splice-only / passthrough</option>
        </select>

        {dpDetails.closureType === "AFN" ? (
          <div
            style={{
              marginTop: 12,
              padding: 12,
              border: "1px solid rgba(56,189,248,0.42)",
              borderRadius: 12,
              background: "#020617",
            }}
          >
            <div style={{ fontWeight: 900, color: "#e0f2fe", marginBottom: 6 }}>
              SB → SB Fibre Route
            </div>
            <div style={helpText}>
              This is now the authority for SB routing. Joint uploads and cable auto-allocation no longer decide the DP fibre logic.
            </div>

            <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#0f172a", border: "1px solid rgba(125,211,252,0.22)" }}>
              <div style={{ fontWeight: 800, color: "#bae6fd", marginBottom: 4 }}>Auto-build from FAS</div>
              <div style={helpText}>
                Upload the FAS report and this SB will pull only its SB → SB fibre route. The sheet does not overwrite cable geometry or old joint logic.
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.xlsm"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  importFasRoutesForCurrentDp(file);
                  e.currentTarget.value = "";
                }}
                style={{ ...inputStyle, marginTop: 8 }}
              />
              {fasImportStatus ? <div style={{ ...helpText, color: "#bae6fd" }}>{fasImportStatus}</div> : null}
            </div>


            <div style={labelStyle}>From SB</div>
            <select value={manualFromSbId} onChange={(e) => setManualFromSbId(e.target.value)} style={inputStyle}>
              <option value="">Select source SB...</option>
              {allDpOptions.map((dp) => (
                <option key={dp.id} value={dp.id}>{getDpDisplayName(dp)}</option>
              ))}
            </select>

            <div style={labelStyle}>To SB</div>
            <select value={manualToSbId || currentDpId || ""} onChange={(e) => setManualToSbId(e.target.value)} style={inputStyle}>
              <option value="">Select target SB...</option>
              {allDpOptions.map((dp) => (
                <option key={dp.id} value={dp.id}>{getDpDisplayName(dp)}</option>
              ))}
            </select>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={labelStyle}>Parent fibres</div>
                <input
                  value={manualParentFibres}
                  onChange={(e) => setManualParentFibres(e.target.value)}
                  placeholder="13,14,15 or 13-15"
                  style={inputStyle}
                />
              </div>
              <div>
                <div style={labelStyle}>Local fibres</div>
                <input
                  value={manualLocalFibres}
                  onChange={(e) => setManualLocalFibres(e.target.value)}
                  placeholder="1,2,3 or 1-3"
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={labelStyle}>Supporting cable optional</div>
            <select value={manualSupportingCable} onChange={(e) => setManualSupportingCable(e.target.value)} style={inputStyle}>
              <option value="">No cable required for logic</option>
              {optionalSupportingCables.map((cable) => (
                <option key={cable.id} value={cable.id}>
                  {(cable as any).name || (cable as any).cableId || cable.id} — {(cable as any).fibreCount || ""}
                </option>
              ))}
            </select>

            <div style={labelStyle}>Note</div>
            <input
              value={manualRouteNote}
              onChange={(e) => setManualRouteNote(e.target.value)}
              placeholder="Example: SB01 feeds SB04 on F13-F15 to F1-F3"
              style={inputStyle}
            />

            <button
              type="button"
              onClick={applyManualSbRoute}
              style={{
                ...secondaryButtonStyle,
                width: "100%",
                marginTop: 10,
                background: "#0ea5e9",
                color: "#ffffff",
                fontWeight: 900,
              }}
            >
              Apply SB → SB Route
            </button>

            {parentFibres.length || localFibres.length ? (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...helpText, marginBottom: 6, color: "#bae6fd" }}>Current mapping</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 6 }}>
                  {Array.from({ length: Math.max(parentFibres.length, localFibres.length) }).map((_, index) => (
                    <div
                      key={index}
                      style={{
                        padding: "7px 6px",
                        borderRadius: 8,
                        border: "1px solid rgba(125,211,252,0.34)",
                        background: "#0f172a",
                        textAlign: "center",
                        color: "#f8fafc",
                        fontWeight: 900,
                      }}
                    >
                      F{parentFibres[index] || "?"} → F{localFibres[index] || "?"}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {dpDetails.closureType === "MDU" || dpDetails.closureType === "MDU_SPLITTER" ? (
          <>
            <div style={labelStyle}>MDU Fibres</div>
            <input
              type="number"
              min={1}
              max={24}
              value={dpDetails.mduDetails?.mduFibres || 6}
              onChange={(e) => {
                const mduFibres = Number(e.target.value);
                const splitterFibres = dpDetails.mduDetails?.splitterFibres || 0;
                onChangeDpDetails({
                  ...dpDetails,
                  mduDetails: {
                    ...(dpDetails.mduDetails || {}),
                    enabled: true,
                    mduFibres,
                    splitterFibres,
                    totalReservedFibres: mduFibres + splitterFibres,
                    inputFibres: dpDetails.mduDetails?.inputFibres || [],
                  },
                  autoFibrePlan: undefined,
                } as DistributionPointDetails);
              }}
              style={inputStyle}
            />
          </>
        ) : null}

        <div style={labelStyle}>Connections to Homes</div>
        <select
          value={dpDetails.closureType === "AFN" ? dpCapacityManual : dpDetails.connectionsToHomes || 8}
          disabled={dpDetails.closureType === "AFN"}
          onChange={(e) => updateDp("connectionsToHomes", Number(e.target.value))}
          style={inputStyle}
        >
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={24}>24</option>
          <option value={32}>32</option>
        </select>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 10 }}>
          {[
            ["Capacity", dpCapacityManual],
            ["Used", dpUsedManual],
            ["Available", dpAvailableManual],
          ].map(([title, value]) => (
            <div key={String(title)} style={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, padding: 8, textAlign: "center" }}>
              <strong>{value}</strong>
              <br />
              <span style={{ color: "#9ca3af", fontSize: "0.75rem" }}>{title}</span>
            </div>
          ))}
        </div>

        {connectedHomes.length > 0 ? (
          <div style={{ marginTop: 12 }}>
            <button type="button" onClick={() => setConnectedHomesOpen(!connectedHomesOpen)} style={{ ...secondaryButtonStyle, width: "100%" }}>
              {connectedHomesOpen ? "Hide" : "Show"} Connected Homes ({connectedHomes.length})
            </button>
            {connectedHomesOpen ? (
              <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                {connectedHomes.map((home) => (
                  <div key={`${home.homeId}-${home.port}`} style={{ background: "#111827", border: "1px solid #334155", borderRadius: 8, padding: 8, fontSize: "0.8rem" }}>
                    <strong>{home.homeName}</strong>
                    <br />Port {home.port} · {home.status}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={labelStyle}>Image</div>
        <input
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(e) => uploadDpImage(e.target.files?.[0] || null)}
          style={inputStyle}
        />
        {previewImage ? (
          <div style={{ ...photoCard, marginTop: 8 }}>
            <img src={previewImage} style={photoImg} />
            <button
              type="button"
              onClick={() => updateDp("image", "")}
              style={{ ...secondaryButtonStyle, width: "100%", marginTop: 6 }}
            >
              Remove Image
            </button>
          </div>
        ) : null}
        {uploading ? <div style={helpText}>Uploading...</div> : null}
      </div>
    );
  }


  return null;
}
