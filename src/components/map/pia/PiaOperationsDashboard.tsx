import { getDistanceMeters as routeDistanceMeters } from "../../../utils/mapMeasure";
import React, { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../types";
import type {
  PiaAcceptanceStats,
  PiaAcceptanceStatus,
} from "../../../services/piaIntelligence";
import {
  getPiaAcceptanceContractor,
  getPiaAcceptanceDetails,
  getPiaAcceptancePhotoCount,
  getPiaAcceptanceStatus,
  getPiaAcceptanceStatusLabel,
} from "../../../services/piaIntelligence";

type Props = {
  projectName: string;
  projectArea?: SavedMapAsset | null;
  assets: SavedMapAsset[];
  piaAssets: SavedMapAsset[];
  filteredPiaAssets: SavedMapAsset[];
  piaQaStats: PiaAcceptanceStats<any>;
  selectedAsset: SavedMapAsset | null;
  searchTerm: string;
  statusFilter: PiaAcceptanceStatus | "all";
  contractorFilter: string;
  contractorOptions: string[];
  openreachLayers?: unknown;
  visibleLayers?: unknown;
  networkState?: unknown;
  traceHighlightedAssetIds?: string[];
  traceHighlightKinds?: Record<string, string>;
  onSearchTermChange: (value: string) => void;
  onStatusFilterChange: (value: PiaAcceptanceStatus | "all") => void;
  onContractorFilterChange: (value: string) => void;
  onSelectAsset: (asset: SavedMapAsset | null) => void;
  onStatusChange: (asset: SavedMapAsset, status: PiaAcceptanceStatus) => void;
  onDetailsSave: (asset: SavedMapAsset, patch: Record<string, any>) => void;
  onClose: () => void;
  onExport?: () => void;
};

type PiaEvidencePhoto = {
  url?: string;
  thumbUrl?: string;
  name?: string;
  fileName?: string;
  capturedAt?: string;
  uploadedAt?: string;
  [key: string]: any;
};

function formatNumber(value: number | undefined): string {
  return (value ?? 0).toLocaleString("en-GB");
}

function getAssetTitle(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(
    item.name ||
      item.jointName ||
      item.label ||
      item.assetId ||
      item.id ||
      "Unnamed asset",
  );
}

function getAssetType(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(item.assetType || item.type || item.jointType || "Asset");
}

function getAssetKey(asset: SavedMapAsset | null | undefined): string {
  const item = (asset || {}) as any;
  return String(
    item.id || item.assetId || item.name || item.jointName || item.label || "",
  );
}

function sameAsset(
  a: SavedMapAsset | null | undefined,
  b: SavedMapAsset | null | undefined,
): boolean {
  const aKey = getAssetKey(a);
  const bKey = getAssetKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}

function statusColour(status: PiaAcceptanceStatus): string {
  if (status === "not_required") return "#64748b";
  if (status === "photos_uploaded") return "#38bdf8";
  if (status === "contractor_pass") return "#f97316";
  if (status === "please_review") return "#a855f7";
  if (status === "pia_pass") return "#22c55e";
  if (status === "pia_fail") return "#ef4444";
  return "#94a3b8";
}

function isReviewedStatus(status: PiaAcceptanceStatus): boolean {
  return (
    status === "pia_pass" || status === "pia_fail" || status === "not_required"
  );
}

function getLastUpdatedLabel(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  const details = getPiaAcceptanceDetails(item);
  const raw =
    details.lastUpdatedAt ||
    details.updatedAt ||
    details.piaReviewDate ||
    details.reviewDate ||
    item?.updatedAt ||
    item?.lastUpdatedAt ||
    item?.properties?.updatedAt ||
    "";

  if (!raw) return "—";

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw).slice(0, 16);

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}

function getRequiredReviewProgress(stats: PiaAcceptanceStats<any>) {
  const required = Math.max(
    0,
    stats.requiredTotal ?? stats.total - (stats.notRequired || 0),
  );
  const reviewed = Math.max(0, (stats.piaPass || 0) + (stats.piaFail || 0));
  const remaining = Math.max(0, required - reviewed);
  const percent = required ? Math.round((reviewed / required) * 100) : 0;
  return { required, reviewed, remaining, percent };
}

function normalisePhotoRecord(photo: any): PiaEvidencePhoto | null {
  if (!photo) return null;
  if (typeof photo === "string")
    return { url: photo, thumbUrl: photo, name: "PIA evidence" };
  if (typeof photo !== "object") return null;

  const url =
    photo.url ||
    photo.downloadUrl ||
    photo.downloadURL ||
    photo.publicUrl ||
    photo.storageUrl ||
    photo.fullUrl ||
    photo.src ||
    photo.path ||
    photo.previewUrl ||
    photo.imageUrl ||
    photo.photoUrl ||
    photo.uri ||
    "";

  const thumbUrl =
    photo.thumbUrl ||
    photo.thumbnailUrl ||
    photo.thumbnail ||
    photo.previewUrl ||
    url ||
    "";

  return {
    ...photo,
    url: String(url || ""),
    thumbUrl: String(thumbUrl || ""),
    name: String(
      photo.name ||
        photo.fileName ||
        photo.filename ||
        photo.label ||
        "PIA evidence",
    ),
    fileName: String(photo.fileName || photo.filename || photo.name || ""),
  };
}

function collectPhotos(value: any): PiaEvidencePhoto[] {
  if (!value) return [];
  if (Array.isArray(value))
    return value
      .map(normalisePhotoRecord)
      .filter(Boolean) as PiaEvidencePhoto[];
  if (typeof value === "string") {
    const normalised = normalisePhotoRecord(value);
    return normalised ? [normalised] : [];
  }
  if (typeof value === "object") {
    const nested =
      value.photos ||
      value.photoEvidence ||
      value.evidencePhotos ||
      value.uploadedEvidence ||
      value.images ||
      value.files;
    if (Array.isArray(nested))
      return nested
        .map(normalisePhotoRecord)
        .filter(Boolean) as PiaEvidencePhoto[];
    const normalised = normalisePhotoRecord(value);
    return normalised ? [normalised] : [];
  }
  return [];
}

function getPiaEvidencePhotos(
  asset: SavedMapAsset | null | undefined,
): PiaEvidencePhoto[] {
  const item = asset as any;
  if (!item) return [];

  const details = getPiaAcceptanceDetails(item);
  const sources = [
    details?.photos,
    details?.photoEvidence,
    details?.evidencePhotos,
    details?.uploadedEvidence,
    details?.images,
    item.photos,
    item.photoEvidence,
    item.evidencePhotos,
    item.uploadedEvidence,
    item.piaPhotos,
    item.piaQa?.photos,
    item.piaQa?.photoEvidence,
    item.piaQaDetails?.photos,
    item.piaQaDetails?.photoEvidence,
    item.poleDetails?.photos,
    item.poleDetails?.piaQa?.photos,
    item.poleDetails?.piaQa?.photoEvidence,
    item.chamberDetails?.photos,
    item.chamberDetails?.piaQa?.photos,
    item.chamberDetails?.piaQa?.photoEvidence,
    item.properties?.photos,
    item.properties?.photoEvidence,
    item.properties?.evidencePhotos,
    item.properties?.uploadedEvidence,
    item.properties?.piaQa?.photos,
    item.properties?.piaQa?.photoEvidence,
    item.properties?.poleDetails?.photos,
    item.properties?.poleDetails?.piaQa?.photos,
    item.properties?.chamberDetails?.photos,
    item.properties?.chamberDetails?.piaQa?.photos,
  ];

  const seen = new Set<string>();
  return sources.flatMap(collectPhotos).filter((photo) => {
    const key =
      photo.url || photo.thumbUrl || photo.name || JSON.stringify(photo);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function KpiTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  tone?: "default" | "good" | "warn" | "bad" | "info";
}) {
  const colour =
    tone === "good"
      ? "#22c55e"
      : tone === "warn"
        ? "#f97316"
        : tone === "bad"
          ? "#ef4444"
          : tone === "info"
            ? "#38bdf8"
            : "#e5e7eb";
  return (
    <div style={kpiTile}>
      <div style={kpiLabel}>{label}</div>
      <div style={{ ...kpiValue, color: colour }}>{value}</div>
    </div>
  );
}

type RouteReviewGroup = {
  id: string;
  label: string;
  cable: SavedMapAsset;
  assets: SavedMapAsset[];
  reviewed: number;
  total: number;
  percent: number;
};

type RoutePoint = { lat: number; lng: number };

function normaliseRouteKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function getRouteAssetLabel(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return String(
    item?.name || item?.cableId || item?.label || item?.id || "Route",
  );
}

function getAssetRouteText(asset: SavedMapAsset | null | undefined): string {
  const item = asset as any;
  return [
    item?.assetType,
    item?.type,
    item?.cableType,
    item?.name,
    item?.label,
    item?.jointName,
    item?.category,
    item?.properties?.assetType,
    item?.properties?.type,
  ]
    .map((value) => String(value ?? "").toLowerCase())
    .join(" ");
}

function isRouteCableAsset(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset || asset.geometry?.type !== "LineString") return false;
  const text = getAssetRouteText(asset);
  if (text.includes("drop") || text.includes("home drop")) return false;
  return (
    text.includes("cable") ||
    text.includes("ulw") ||
    text.includes("feeder") ||
    text.includes("link") ||
    text.includes("route")
  );
}

function getAssetPointForRouteReview(
  asset: SavedMapAsset | null | undefined,
): RoutePoint | null {
  const item = asset as any;
  if (!item) return null;
  if (typeof item.lat === "number" && typeof item.lng === "number")
    return { lat: item.lat, lng: item.lng };
  if (
    asset?.geometry?.type === "Point" &&
    Array.isArray(asset.geometry.coordinates)
  ) {
    const [lat, lng] = asset.geometry.coordinates as any[];
    const nextLat = Number(lat);
    const nextLng = Number(lng);
    if (Number.isFinite(nextLat) && Number.isFinite(nextLng))
      return { lat: nextLat, lng: nextLng };
  }
  return null;
}

function getCableRoutePoints(
  asset: SavedMapAsset | null | undefined,
): RoutePoint[] {
  if (!asset || asset.geometry?.type !== "LineString") return [];
  return ((asset.geometry.coordinates || []) as any[])
    .map((coord) => ({ lat: Number(coord?.[0]), lng: Number(coord?.[1]) }))
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function distancePointToRouteMeters(
  point: RoutePoint,
  route: RoutePoint[],
): { distance: number; order: number } {
  if (!route.length) return { distance: Number.POSITIVE_INFINITY, order: 0 };
  if (route.length === 1)
    return { distance: routeDistanceMeters(point, route[0]), order: 0 };

  let bestDistance = Number.POSITIVE_INFINITY;
  let bestOrder = 0;
  let travelled = 0;

  for (let index = 0; index < route.length - 1; index += 1) {
    const start = route[index];
    const end = route[index + 1];
    const segmentLength = Math.max(routeDistanceMeters(start, end), 0.0001);

    // This is a small-distance approximation, but accurate enough for ordering
    // assets along a local fibre route inside one AG.
    const x1 = start.lng;
    const y1 = start.lat;
    const x2 = end.lng;
    const y2 = end.lat;
    const px = point.lng;
    const py = point.lat;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((px - x1) * dx + (py - y1) * dy) /
          Math.max(dx * dx + dy * dy, 0.000000000001),
      ),
    );
    const projected = { lat: y1 + dy * t, lng: x1 + dx * t };
    const distance = routeDistanceMeters(point, projected);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestOrder = travelled + segmentLength * t;
    }

    travelled += segmentLength;
  }

  return { distance: bestDistance, order: bestOrder };
}

function getExplicitRouteRefs(
  asset: SavedMapAsset | null | undefined,
): string[] {
  const item = asset as any;
  if (!item) return [];
  return [
    item.cableId,
    item.cableName,
    item.routeId,
    item.routeName,
    item.parentCableId,
    item.supportingCableId,
    item.supportingCableName,
    item.properties?.cableId,
    item.properties?.cableName,
    item.properties?.routeId,
    item.properties?.routeName,
  ]
    .map(normaliseRouteKey)
    .filter(Boolean);
}

function buildRouteReviewGroups(
  allAssets: SavedMapAsset[],
  reviewAssets: SavedMapAsset[],
): RouteReviewGroup[] {
  const cables = allAssets.filter(isRouteCableAsset);
  const reviewableByKey = new Map<string, SavedMapAsset>();
  reviewAssets.forEach((asset) => {
    const key = getAssetKey(asset);
    if (key) reviewableByKey.set(key, asset);
  });

  const groups = cables
    .map((cable) => {
      const route = getCableRoutePoints(cable);
      const cableRefs = [
        cable.id,
        (cable as any).name,
        (cable as any).cableId,
        (cable as any).label,
      ]
        .map(normaliseRouteKey)
        .filter(Boolean);

      const members = reviewAssets
        .map((asset) => {
          const explicitMatch = getExplicitRouteRefs(asset).some((ref) =>
            cableRefs.includes(ref),
          );
          const point = getAssetPointForRouteReview(asset);
          const routeMatch = point
            ? distancePointToRouteMeters(point, route)
            : { distance: Number.POSITIVE_INFINITY, order: 0 };
          const isMember = explicitMatch || routeMatch.distance <= 35;
          return isMember
            ? {
                asset,
                order: explicitMatch ? routeMatch.order : routeMatch.order,
                distance: routeMatch.distance,
              }
            : null;
        })
        .filter(
          (
            item,
          ): item is {
            asset: SavedMapAsset;
            order: number;
            distance: number;
          } => Boolean(item),
        )
        .sort((a, b) => a.order - b.order || a.distance - b.distance)
        .map((item) => item.asset);

      const uniqueMembers = Array.from(
        new Map(members.map((asset) => [getAssetKey(asset), asset])).values(),
      );
      if (!uniqueMembers.length) return null;
      const reviewed = uniqueMembers.filter((asset) =>
        isReviewedStatus(getPiaAcceptanceStatus(asset as any)),
      ).length;
      const total = uniqueMembers.length;
      const percent = total ? Math.round((reviewed / total) * 100) : 0;

      return {
        id: String(cable.id || getRouteAssetLabel(cable)),
        label: getRouteAssetLabel(cable),
        cable,
        assets: uniqueMembers,
        reviewed,
        total,
        percent,
      };
    })
    .filter((group): group is RouteReviewGroup => Boolean(group))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  // Limit to useful route groups to keep the UI fast and readable on large AGs.
  return groups.slice(0, 24);
}

function readAssetValue(asset: any, keys: string[]): string {
  for (const key of keys) {
    const parts = key.split(".");
    let cursor = asset;
    for (const part of parts) cursor = cursor?.[part];
    if (cursor !== undefined && cursor !== null && String(cursor).trim())
      return String(cursor).trim();
  }
  return "";
}

function getExpectedPiaLabels(asset: SavedMapAsset | null | undefined): {
  expectedNoi: string;
  expectedAfn: string;
} {
  const item = asset as any;
  if (!item) return { expectedNoi: "", expectedAfn: "" };

  const details = getPiaAcceptanceDetails(item);
  const expectedNoi =
    readAssetValue(details, [
      "piaNoi",
      "pianoi",
      "piaNOI",
      "noi",
      "noiNumber",
      "piaNoiNumber",
      "piaNoiRef",
    ]) ||
    readAssetValue(item, [
      "piaNoi",
      "pianoi",
      "piaNOI",
      "noi",
      "noiNumber",
      "piaNoiNumber",
      "piaNoiRef",
      "poleDetails.piaNoi",
      "poleDetails.pianoi",
      "poleDetails.noiNumber",
      "chamberDetails.piaNoi",
      "chamberDetails.pianoi",
      "chamberDetails.noiNumber",
      "properties.piaNoi",
      "properties.pianoi",
      "properties.noiNumber",
      "properties.poleDetails.piaNoi",
      "properties.chamberDetails.piaNoi",
    ]);

  const expectedAfn =
    readAssetValue(details, [
      "afn",
      "afnLabel",
      "afnNumber",
      "afnRef",
      "afnId",
    ]) ||
    readAssetValue(item, [
      "afn",
      "afnLabel",
      "afnNumber",
      "afnRef",
      "afnId",
      "poleDetails.afn",
      "poleDetails.afnLabel",
      "poleDetails.afnNumber",
      "chamberDetails.afn",
      "chamberDetails.afnLabel",
      "chamberDetails.afnNumber",
      "properties.afn",
      "properties.afnLabel",
      "properties.afnNumber",
      "properties.poleDetails.afn",
      "properties.chamberDetails.afn",
    ]);

  return { expectedNoi, expectedAfn };
}

function PhotoViewer({
  photos,
  index,
  onIndexChange,
  onClose,
}: {
  photos: PiaEvidencePhoto[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1.45);
  const [rotation, setRotation] = useState(0);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const photo = photos[index];
  const url = photo?.url || photo?.thumbUrl || "";
  const label = photo?.name || photo?.fileName || `PIA evidence ${index + 1}`;

  useEffect(() => {
    setZoom(1.45);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
  }, [index]);

  const resetImage = () => {
    setZoom(1.45);
    setRotation(0);
    setBrightness(100);
    setContrast(100);
  };

  if (!photo) return null;

  const previous = () =>
    onIndexChange(index <= 0 ? photos.length - 1 : index - 1);
  const next = () => onIndexChange(index >= photos.length - 1 ? 0 : index + 1);

  return (
    <div style={viewerBackdrop} onClick={onClose}>
      <div style={viewerPanel} onClick={(event) => event.stopPropagation()}>
        <div style={viewerHeader}>
          <div>
            <div style={viewerKicker}>PIA Photo Inspector</div>
            <div style={viewerTitle}>{label}</div>
            <div style={viewerSub}>
              Use zoom to check PIANOI / AFN labels clearly.
            </div>
          </div>
          <div style={viewerActions}>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setZoom((value) => Math.max(0.8, value - 0.25))}
            >
              −
            </button>
            <span style={zoomBadge}>{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setZoom((value) => Math.min(5, value + 0.25))}
            >
              +
            </button>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setRotation((value) => value - 90)}
            >
              ↺
            </button>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setRotation((value) => value + 90)}
            >
              ↻
            </button>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setBrightness((value) => Math.max(60, value - 10))}
            >
              B−
            </button>
            <button
              type="button"
              style={viewerButton}
              onClick={() =>
                setBrightness((value) => Math.min(160, value + 10))
              }
            >
              B+
            </button>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setContrast((value) => Math.max(60, value - 10))}
            >
              C−
            </button>
            <button
              type="button"
              style={viewerButton}
              onClick={() => setContrast((value) => Math.min(180, value + 10))}
            >
              C+
            </button>
            <button type="button" style={viewerButton} onClick={resetImage}>
              Reset
            </button>
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                style={viewerButton}
              >
                Open
              </a>
            ) : null}
            <button type="button" style={viewerButton} onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div style={viewerBody}>
          {photos.length > 1 ? (
            <button
              type="button"
              style={{ ...viewerArrow, left: 18 }}
              onClick={previous}
            >
              ‹
            </button>
          ) : null}
          <div
            style={imagePanArea}
            onWheel={(event) => {
              event.preventDefault();
              setZoom((value) =>
                Math.max(
                  0.8,
                  Math.min(5, value + (event.deltaY < 0 ? 0.15 : -0.15)),
                ),
              );
            }}
          >
            {url ? (
              <img
                src={url}
                alt={label}
                style={{
                  ...viewerImage,
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  filter: `brightness(${brightness}%) contrast(${contrast}%)`,
                }}
              />
            ) : (
              <div style={viewerEmpty}>
                No preview URL found for this photo record.
              </div>
            )}
          </div>
          {photos.length > 1 ? (
            <button
              type="button"
              style={{ ...viewerArrow, right: 18 }}
              onClick={next}
            >
              ›
            </button>
          ) : null}
        </div>

        <div style={viewerFooter}>
          <span>
            {index + 1} / {photos.length}
          </span>
          <span>
            Manual check: zoom into the photo and compare the visible PIANOI /
            AFN label against the expected asset record.
          </span>
        </div>
      </div>
    </div>
  );
}

export default function PiaReviewWorkspace({
  projectName,
  assets,
  piaAssets,
  filteredPiaAssets,
  piaQaStats,
  selectedAsset,
  searchTerm,
  statusFilter,
  contractorFilter,
  contractorOptions,
  onSearchTermChange,
  onStatusFilterChange,
  onContractorFilterChange,
  onSelectAsset,
  onStatusChange,
  onDetailsSave,
  onClose,
  onExport,
}: Props) {
  const selectedPiaAsset = selectedAsset
    ? piaAssets.find((asset) => sameAsset(asset, selectedAsset)) || null
    : null;
  const selectedPiaAssetKey = getAssetKey(selectedPiaAsset);
  const status = selectedPiaAsset
    ? getPiaAcceptanceStatus(selectedPiaAsset as any)
    : "not_started";
  const evidencePhotos = useMemo(
    () => getPiaEvidencePhotos(selectedPiaAsset),
    [selectedPiaAssetKey],
  );
  const evidencePhotoCount = Math.max(
    selectedPiaAsset ? getPiaAcceptancePhotoCount(selectedPiaAsset as any) : 0,
    evidencePhotos.length,
  );
  const [contractorName, setContractorName] = useState("");
  const [contractorNotes, setContractorNotes] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [reviewDate, setReviewDate] = useState("");
  const [reviewNotes, setReviewNotes] = useState("");
  const [notRequiredReason, setNotRequiredReason] = useState("");
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [activeRouteId, setActiveRouteId] = useState<string>("all");

  const routeReviewGroups = useMemo(
    () => buildRouteReviewGroups(assets, piaAssets),
    [assets, piaAssets],
  );
  const activeRouteGroup =
    activeRouteId === "all"
      ? null
      : routeReviewGroups.find((group) => group.id === activeRouteId) || null;
  const activeRouteAssetKeys = useMemo(
    () => new Set((activeRouteGroup?.assets || []).map(getAssetKey)),
    [activeRouteGroup],
  );
  const displayedPiaAssets = useMemo(() => {
    if (!activeRouteGroup) return filteredPiaAssets;
    return filteredPiaAssets.filter((asset) =>
      activeRouteAssetKeys.has(getAssetKey(asset)),
    );
  }, [activeRouteAssetKeys, activeRouteGroup, filteredPiaAssets]);

  const reviewProgress = getRequiredReviewProgress(piaQaStats);

  const findNextReviewAsset = (
    fromAsset: SavedMapAsset | null,
  ): SavedMapAsset | null => {
    if (!displayedPiaAssets.length) return null;
    const currentIndex = fromAsset
      ? displayedPiaAssets.findIndex((asset) => sameAsset(asset, fromAsset))
      : -1;

    const ordered = [
      ...displayedPiaAssets.slice(Math.max(0, currentIndex + 1)),
      ...displayedPiaAssets.slice(0, Math.max(0, currentIndex + 1)),
    ];

    return (
      ordered.find(
        (asset) => !isReviewedStatus(getPiaAcceptanceStatus(asset as any)),
      ) ||
      ordered.find((asset) => !sameAsset(asset, fromAsset)) ||
      null
    );
  };

  const selectNextReviewAsset = () => {
    const nextAsset = findNextReviewAsset(selectedPiaAsset);
    if (nextAsset) onSelectAsset(nextAsset);
  };

  useEffect(() => {
    const nextDetails = selectedPiaAsset
      ? getPiaAcceptanceDetails(selectedPiaAsset as any)
      : {};
    setContractorName(
      String(nextDetails.contractorName || nextDetails.contractor || ""),
    );
    setContractorNotes(String(nextDetails.contractorNotes || ""));
    setReviewer(String(nextDetails.piaReviewer || nextDetails.reviewer || ""));
    setReviewDate(
      String(nextDetails.piaReviewDate || nextDetails.reviewDate || ""),
    );
    setReviewNotes(
      String(nextDetails.piaReviewNotes || nextDetails.reviewNotes || ""),
    );
    setNotRequiredReason(
      String(
        nextDetails.notRequiredReason || nextDetails.notRequiredNote || "",
      ),
    );
    setViewerIndex(null);
  }, [selectedPiaAssetKey]);

  const buildReviewPatch = () => ({
    contractorName,
    contractor: contractorName,
    contractorNotes,
    piaReviewer: reviewer,
    reviewer,
    piaReviewDate: reviewDate,
    reviewDate,
    piaReviewNotes: reviewNotes,
    reviewNotes,
    notRequiredReason,
    lastUpdatedAt: new Date().toISOString(),
  });

  const save = () => {
    if (!selectedPiaAsset) return;
    onDetailsSave(selectedPiaAsset, buildReviewPatch());
  };

  const saveAndNext = () => {
    if (!selectedPiaAsset) return;
    onDetailsSave(selectedPiaAsset, buildReviewPatch());
    const nextAsset = findNextReviewAsset(selectedPiaAsset);
    if (nextAsset) {
      window.setTimeout(() => onSelectAsset(nextAsset), 0);
    }
  };

  const quickStatus = (nextStatus: PiaAcceptanceStatus) => {
    if (!selectedPiaAsset) return;
    onStatusChange(selectedPiaAsset, nextStatus);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();
      const isTyping =
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable;

      if (viewerIndex !== null) {
        if (event.key === "Escape") {
          event.preventDefault();
          setViewerIndex(null);
        }
        if (event.key === "ArrowLeft" && evidencePhotos.length > 1) {
          event.preventDefault();
          setViewerIndex((current) => {
            const index = current ?? 0;
            return index <= 0 ? evidencePhotos.length - 1 : index - 1;
          });
        }
        if (event.key === "ArrowRight" && evidencePhotos.length > 1) {
          event.preventDefault();
          setViewerIndex((current) => {
            const index = current ?? 0;
            return index >= evidencePhotos.length - 1 ? 0 : index + 1;
          });
        }
        return;
      }

      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
        return;
      }

      if (isTyping) return;
      if (!selectedPiaAsset) return;

      const key = event.key.toLowerCase();
      if (event.key === "Enter") {
        event.preventDefault();
        saveAndNext();
      } else if (key === "p") {
        event.preventDefault();
        quickStatus("pia_pass");
      } else if (key === "f") {
        event.preventDefault();
        quickStatus("pia_fail");
      } else if (key === "r") {
        event.preventDefault();
        quickStatus("please_review");
      } else if (key === "c") {
        event.preventDefault();
        quickStatus("contractor_pass");
      } else if (key === "u") {
        event.preventDefault();
        quickStatus("photos_uploaded");
      } else if (key === "n" || key === "0") {
        event.preventDefault();
        quickStatus("not_required");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    selectedPiaAssetKey,
    viewerIndex,
    evidencePhotos.length,
    contractorName,
    contractorNotes,
    reviewer,
    reviewDate,
    reviewNotes,
    notRequiredReason,
    filteredPiaAssets,
    displayedPiaAssets,
  ]);

  return (
    <div style={root}>
      <header style={header}>
        <div>
          <div style={kicker}>PIA Review Workspace</div>
          <h1 style={title}>{projectName}</h1>
          <div style={subtitle}>
            Evidence review · PIANOI / AFN checks · Contractor acceptance
          </div>
        </div>
        <div style={headerCentre}>
          <span style={headerMetric}>
            Assets <strong>{formatNumber(piaQaStats.total)}</strong>
          </span>
          <span style={headerMetric}>
            Not Required{" "}
            <strong style={{ color: "#94a3b8" }}>
              {formatNumber(piaQaStats.notRequired)}
            </strong>
          </span>
          <span style={headerMetric}>
            Awaiting{" "}
            <strong style={{ color: "#a855f7" }}>
              {formatNumber(piaQaStats.awaitingPiaCheck)}
            </strong>
          </span>
          <span style={headerMetric}>
            Fails{" "}
            <strong style={{ color: "#ef4444" }}>
              {formatNumber(piaQaStats.piaFail)}
            </strong>
          </span>
          <span style={headerMetric}>
            Pass Rate{" "}
            <strong style={{ color: "#22c55e" }}>
              {formatNumber(piaQaStats.passPercent)}%
            </strong>
          </span>
        </div>
        <div style={headerActions}>
          <button type="button" style={button} onClick={selectNextReviewAsset}>
            Next Pending
          </button>
          {onExport ? (
            <button type="button" style={button} onClick={onExport}>
              Export
            </button>
          ) : null}
          <button type="button" style={button} onClick={onClose}>
            Back
          </button>
        </div>
      </header>

      <main style={workspaceGrid}>
        <section style={summaryPanel}>
          <div style={summaryLeft}>
            <div style={sectionKicker}>PIA Workspace Checks</div>
            <div style={progressHeader}>
              <strong>
                {formatNumber(reviewProgress.reviewed)} /{" "}
                {formatNumber(reviewProgress.required)} reviewed
              </strong>
              <span>
                {formatNumber(reviewProgress.remaining)} remaining ·{" "}
                {reviewProgress.percent}% complete
              </span>
            </div>
            <div style={progressTrack}>
              <div
                style={{ ...progressFill, width: `${reviewProgress.percent}%` }}
              />
            </div>
            <div style={kpiGrid}>
              <KpiTile
                label="Not Required"
                value={formatNumber(piaQaStats.notRequired)}
                tone="default"
              />
              <KpiTile
                label="Photos Uploaded"
                value={formatNumber(piaQaStats.photosUploaded)}
                tone="info"
              />
              <KpiTile
                label="Contractor Pass"
                value={formatNumber(piaQaStats.contractorPass)}
                tone="warn"
              />
              <KpiTile
                label="Awaiting Review"
                value={formatNumber(piaQaStats.awaitingPiaCheck)}
                tone="warn"
              />
              <KpiTile
                label="PIA Pass"
                value={formatNumber(piaQaStats.piaPass)}
                tone="good"
              />
              <KpiTile
                label="PIA Fail"
                value={formatNumber(piaQaStats.piaFail)}
                tone="bad"
              />
              <KpiTile
                label="Pass Rate"
                value={`${formatNumber(piaQaStats.passPercent)}%`}
                tone="good"
              />
            </div>
          </div>
          <div style={alertPanel}>
            <div style={sectionKicker}>PIA Alerts</div>
            <div style={alertGrid}>
              <KpiTile
                label="Awaiting"
                value={formatNumber(piaQaStats.awaitingPiaCheck)}
                tone="warn"
              />
              <KpiTile
                label="Failed"
                value={formatNumber(piaQaStats.piaFail)}
                tone="bad"
              />
              <KpiTile
                label="Uploads"
                value={formatNumber(piaQaStats.photosUploaded)}
                tone="info"
              />
              <KpiTile
                label="Contractor"
                value={formatNumber(piaQaStats.contractorPass)}
                tone="warn"
              />
            </div>
            <div style={contractorSummaryList}>
              {(piaQaStats.contractorBreakdown || []).slice(0, 4).map((row) => (
                <div key={row.contractor} style={contractorSummaryRow}>
                  <span>{row.contractor}</span>
                  <strong>{row.passPercent}%</strong>
                  <small>
                    {row.awaitingPiaCheck} awaiting · {row.piaFail} fail
                  </small>
                </div>
              ))}
            </div>
          </div>
          <div style={routeReviewPanel}>
            <div style={sectionKicker}>PIA Route Review</div>
            <div style={routeReviewIntro}>
              Pick a cable route and review the poles, chambers, DPs and joints
              along it in walk order.
            </div>
            <div style={routeChipList}>
              <button
                type="button"
                onClick={() => setActiveRouteId("all")}
                style={{
                  ...routeChip,
                  ...(activeRouteId === "all" ? routeChipActive : {}),
                }}
              >
                All Assets
              </button>
              {routeReviewGroups.slice(0, 8).map((group) => (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => {
                    setActiveRouteId(group.id);
                    const nextAsset =
                      group.assets.find(
                        (asset) =>
                          !isReviewedStatus(
                            getPiaAcceptanceStatus(asset as any),
                          ),
                      ) || group.assets[0];
                    if (nextAsset) onSelectAsset(nextAsset);
                  }}
                  style={{
                    ...routeChip,
                    ...(activeRouteId === group.id ? routeChipActive : {}),
                  }}
                  title={`${group.reviewed}/${group.total} reviewed`}
                >
                  <strong>{group.label}</strong>
                  <span>
                    {group.reviewed}/{group.total} · {group.percent}%
                  </span>
                </button>
              ))}
            </div>
            {activeRouteGroup ? (
              <div style={activeRouteBanner}>
                <span>
                  Reviewing route <strong>{activeRouteGroup.label}</strong>
                </span>
                <span>
                  {activeRouteGroup.reviewed}/{activeRouteGroup.total} reviewed
                </span>
                <button
                  type="button"
                  style={buttonTiny}
                  onClick={selectNextReviewAsset}
                >
                  Next on Route
                </button>
              </div>
            ) : null}
          </div>
        </section>

        <section style={queuePanel}>
          <div style={panelHeader}>
            <div>
              <div style={sectionKicker}>Asset Queue</div>
              <h2 style={panelTitle}>
                {activeRouteGroup
                  ? `Route Assets (${displayedPiaAssets.length})`
                  : `PIA Assets (${displayedPiaAssets.length})`}
              </h2>
              <div style={queueMeta}>
                {activeRouteGroup
                  ? activeRouteGroup.label
                  : `${reviewProgress.remaining} still to review`}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                style={buttonSmall}
                onClick={selectNextReviewAsset}
              >
                Next Pending
              </button>
              {onExport ? (
                <button type="button" style={buttonSmall} onClick={onExport}>
                  Export
                </button>
              ) : null}
            </div>
          </div>

          <div style={filters}>
            <input
              value={searchTerm}
              onChange={(event) => onSearchTermChange(event.target.value)}
              placeholder="Search asset, reviewer, contractor..."
              style={input}
            />
            <select
              value={statusFilter}
              onChange={(event) =>
                onStatusFilterChange(
                  event.target.value as PiaAcceptanceStatus | "all",
                )
              }
              style={input}
            >
              <option value="all">All Statuses</option>
              <option value="not_required">Not Required</option>
              <option value="not_started">Not Started</option>
              <option value="photos_uploaded">Photos Uploaded</option>
              <option value="contractor_pass">Contractor Pass</option>
              <option value="please_review">Please Review</option>
              <option value="pia_pass">PIA Pass</option>
              <option value="pia_fail">PIA Fail</option>
            </select>
            <select
              value={contractorFilter}
              onChange={(event) => onContractorFilterChange(event.target.value)}
              style={input}
            >
              <option value="all">All Contractors</option>
              {contractorOptions.map((contractor) => (
                <option key={contractor} value={contractor}>
                  {contractor}
                </option>
              ))}
            </select>
          </div>

          <div style={assetList}>
            {displayedPiaAssets.length ? (
              displayedPiaAssets.map((asset) => {
                const assetStatus = getPiaAcceptanceStatus(asset as any);
                const assetDetails = getPiaAcceptanceDetails(asset as any);
                const contractor = getPiaAcceptanceContractor(asset as any);
                const selected = sameAsset(selectedPiaAsset, asset);
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => onSelectAsset(asset)}
                    style={{
                      ...assetRow,
                      ...(selected ? selectedAssetRow : {}),
                    }}
                  >
                    <span
                      style={{
                        ...reviewTick,
                        color: isReviewedStatus(assetStatus)
                          ? statusColour(assetStatus)
                          : "#475569",
                      }}
                    >
                      {isReviewedStatus(assetStatus) ? "✓" : "•"}
                    </span>
                    <div style={assetNameBlock}>
                      <strong>{getAssetTitle(asset)}</strong>
                      <span>
                        {getAssetType(asset)} ·{" "}
                        {contractor === "Unassigned"
                          ? "No contractor"
                          : contractor}
                      </span>
                    </div>
                    <span
                      style={{
                        ...statusPill,
                        borderColor: statusColour(assetStatus),
                        color: statusColour(assetStatus),
                        background: `${statusColour(assetStatus)}18`,
                      }}
                    >
                      {getPiaAcceptanceStatusLabel(assetStatus)}
                    </span>
                    <span style={queueMeta}>
                      {assetDetails.piaReviewer || assetDetails.reviewer || "—"}
                    </span>
                    <span style={queueMeta}>
                      {getPiaAcceptancePhotoCount(asset as any)} photos
                    </span>
                    <span style={queueMeta}>{getLastUpdatedLabel(asset)}</span>
                  </button>
                );
              })
            ) : (
              <div style={emptyState}>
                No PIA assets match the current filters.
              </div>
            )}
          </div>
        </section>

        <section
          key={selectedPiaAssetKey || "no-pia-asset-selected"}
          style={reviewPanel}
        >
          {!selectedPiaAsset ? (
            <div style={emptyReview}>
              <h2 style={{ margin: 0 }}>Select a PIA asset</h2>
              <p style={{ color: "#94a3b8", margin: "8px 0 0" }}>
                Pick a pole or chamber from the queue to review evidence and
                update the PIA status.
              </p>
            </div>
          ) : (
            <div style={reviewGrid}>
              <div style={detailsPane}>
                <div style={panelHeader}>
                  <div>
                    <div style={sectionKicker}>Selected Asset Review</div>
                    <h2 style={reviewTitle}>
                      {getAssetTitle(selectedPiaAsset)}
                    </h2>
                    <div style={subtitle}>
                      {getAssetType(selectedPiaAsset)} · {evidencePhotoCount}{" "}
                      photo{evidencePhotoCount === 1 ? "" : "s"}
                      {activeRouteGroup ? ` · ${activeRouteGroup.label}` : ""}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={closeButton}
                    onClick={() => onSelectAsset(null)}
                  >
                    ×
                  </button>
                </div>

                <div style={statusButtons}>
                  {(
                    [
                      "not_required",
                      "not_started",
                      "photos_uploaded",
                      "contractor_pass",
                      "please_review",
                      "pia_pass",
                      "pia_fail",
                    ] as PiaAcceptanceStatus[]
                  ).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => quickStatus(option)}
                      style={{
                        ...statusButton,
                        ...(status === option
                          ? {
                              borderColor: statusColour(option),
                              color: statusColour(option),
                              background: `${statusColour(option)}1f`,
                            }
                          : {}),
                      }}
                    >
                      {getPiaAcceptanceStatusLabel(option)}
                    </button>
                  ))}
                </div>

                <div style={formGrid}>
                  <label style={field}>
                    Contractor
                    <input
                      value={contractorName}
                      onChange={(event) =>
                        setContractorName(event.target.value)
                      }
                      style={input}
                    />
                  </label>
                  <label style={field}>
                    Reviewer
                    <input
                      value={reviewer}
                      onChange={(event) => setReviewer(event.target.value)}
                      style={input}
                    />
                  </label>
                  <label style={field}>
                    Review Date
                    <input
                      type="date"
                      value={reviewDate}
                      onChange={(event) => setReviewDate(event.target.value)}
                      style={input}
                    />
                  </label>
                  <label style={field}>
                    PIA Status
                    <select
                      value={status}
                      onChange={(event) =>
                        quickStatus(event.target.value as PiaAcceptanceStatus)
                      }
                      style={input}
                    >
                      <option value="not_required">Not Required</option>
                      <option value="not_started">Not Started</option>
                      <option value="photos_uploaded">Photos Uploaded</option>
                      <option value="contractor_pass">Contractor Pass</option>
                      <option value="please_review">Please Review</option>
                      <option value="pia_pass">PIA Pass</option>
                      <option value="pia_fail">PIA Fail</option>
                    </select>
                  </label>
                </div>

                {status === "not_required" ? (
                  <label style={field}>
                    Reason Not Required
                    <select
                      value={notRequiredReason}
                      onChange={(event) =>
                        setNotRequiredReason(event.target.value)
                      }
                      style={input}
                    >
                      <option value="">Select reason...</option>
                      <option value="Existing asset untouched">
                        Existing asset untouched
                      </option>
                      <option value="Outside build scope">
                        Outside build scope
                      </option>
                      <option value="Existing Openreach asset">
                        Existing Openreach asset
                      </option>
                      <option value="Existing third-party asset">
                        Existing third-party asset
                      </option>
                      <option value="Survey only">Survey only</option>
                      <option value="Duplicate asset">Duplicate asset</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                ) : null}

                <label style={field}>
                  Contractor Notes
                  <textarea
                    value={contractorNotes}
                    onChange={(event) => setContractorNotes(event.target.value)}
                    style={textarea}
                  />
                </label>
                <label style={field}>
                  PIA Review Notes
                  <textarea
                    value={reviewNotes}
                    onChange={(event) => setReviewNotes(event.target.value)}
                    style={textarea}
                  />
                </label>

                <div style={manualCheckBox}>
                  <div>
                    <strong>Manual PIANOI / AFN Check</strong>
                    <p>
                      Open a photo, zoom into the AFN / PIANOI label, and
                      manually compare it with the expected asset record.
                    </p>
                    <div style={manualCheckGrid}>
                      <span>Expected NOI</span>
                      <strong>
                        {getExpectedPiaLabels(selectedPiaAsset).expectedNoi ||
                          "—"}
                      </strong>
                      <span>Expected AFN</span>
                      <strong>
                        {getExpectedPiaLabels(selectedPiaAsset).expectedAfn ||
                          "—"}
                      </strong>
                    </div>
                  </div>
                  <button
                    type="button"
                    style={buttonSmall}
                    onClick={() =>
                      evidencePhotos.length ? setViewerIndex(0) : undefined
                    }
                    disabled={!evidencePhotos.length}
                  >
                    Open Photo Check
                  </button>
                </div>

                <div style={shortcutHelp}>
                  Shortcuts: <strong>P</strong> pass · <strong>F</strong> fail ·{" "}
                  <strong>R</strong> review · <strong>C</strong> contractor pass
                  · <strong>N/0</strong> not required · <strong>Ctrl+S</strong>{" "}
                  save · <strong>Enter</strong> save & next
                </div>

                <div style={actions}>
                  <button
                    type="button"
                    style={button}
                    onClick={() => onSelectAsset(null)}
                  >
                    Cancel
                  </button>
                  <button type="button" style={button} onClick={save}>
                    Save
                  </button>
                  <button
                    type="button"
                    style={primaryButton}
                    onClick={saveAndNext}
                  >
                    Save & Next
                  </button>
                </div>
              </div>

              <div style={photoPane}>
                <div style={panelHeader}>
                  <div>
                    <div style={sectionKicker}>Photo Evidence</div>
                    <h2 style={panelTitle}>Inspect Labels</h2>
                  </div>
                  <span
                    style={{
                      ...statusPill,
                      borderColor: statusColour(status),
                      color: statusColour(status),
                      background: `${statusColour(status)}18`,
                    }}
                  >
                    {getPiaAcceptanceStatusLabel(status)}
                  </span>
                </div>

                {evidencePhotos.length ? (
                  <div style={photoGrid}>
                    {evidencePhotos.map((photo, index) => {
                      const url = photo.url || photo.thumbUrl || "";
                      const label =
                        photo.name ||
                        photo.fileName ||
                        `PIA evidence ${index + 1}`;
                      return (
                        <button
                          key={`${url || label}-${index}`}
                          type="button"
                          style={photoTile}
                          onClick={() => setViewerIndex(index)}
                        >
                          {url ? (
                            <img
                              src={photo.thumbUrl || url}
                              alt={label}
                              style={photoImage}
                            />
                          ) : (
                            <div style={photoPlaceholder}>No preview URL</div>
                          )}
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={emptyState}>
                    No photos found for this asset yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </main>

      {viewerIndex !== null ? (
        <PhotoViewer
          photos={evidencePhotos}
          index={viewerIndex}
          onIndexChange={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      ) : null}
    </div>
  );
}

const routeReviewPanel: React.CSSProperties = {
  gridColumn: "1 / -1",
  minHeight: 0,
  background: "rgba(2,6,23,0.52)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 12,
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const routeReviewIntro: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  lineHeight: 1.35,
};
const routeChipList: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  maxHeight: 106,
  overflow: "auto",
  paddingRight: 4,
};
const routeChip: React.CSSProperties = {
  background: "rgba(15,23,42,0.8)",
  border: "1px solid rgba(148,163,184,0.2)",
  color: "#cbd5e1",
  borderRadius: 999,
  padding: "7px 10px",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  cursor: "pointer",
};
const routeChipActive: React.CSSProperties = {
  borderColor: "#38bdf8",
  color: "#e0f2fe",
  background: "rgba(56,189,248,0.16)",
};
const activeRouteBanner: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  color: "#cbd5e1",
  fontSize: 12,
  background: "rgba(56,189,248,0.1)",
  border: "1px solid rgba(56,189,248,0.22)",
  borderRadius: 10,
  padding: "8px 10px",
};
const buttonTiny: React.CSSProperties = {
  background: "#0f2b52",
  color: "#dbeafe",
  border: "1px solid rgba(96,165,250,0.36)",
  borderRadius: 8,
  padding: "6px 9px",
  fontWeight: 850,
  cursor: "pointer",
  fontSize: 11,
};

const root: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 6600,
  background:
    "radial-gradient(circle at top left, rgba(37,99,235,0.18), transparent 32%), #020617",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
  fontFamily:
    "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  overflowY: "auto",
  overflowX: "hidden",
};
const header: React.CSSProperties = {
  minHeight: 76,
  padding: "14px 20px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(15,23,42,0.96)",
  backdropFilter: "blur(14px)",
  display: "grid",
  gridTemplateColumns: "330px 1fr auto",
  alignItems: "center",
  gap: 18,
  flexShrink: 0,
  position: "sticky",
  top: 0,
  zIndex: 20,
};
const kicker: React.CSSProperties = {
  color: "#38bdf8",
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: 0.7,
  textTransform: "uppercase",
};
const title: React.CSSProperties = {
  margin: "5px 0 0",
  fontSize: 25,
  lineHeight: 1.05,
  letterSpacing: "-0.04em",
};
const subtitle: React.CSSProperties = {
  marginTop: 6,
  color: "#cbd5e1",
  fontSize: 14,
};
const headerCentre: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};
const headerMetric: React.CSSProperties = {
  background: "rgba(15,23,42,0.75)",
  border: "1px solid rgba(148,163,184,0.16)",
  borderRadius: 10,
  padding: "9px 12px",
  color: "#cbd5e1",
  fontSize: 13,
};
const headerActions: React.CSSProperties = { display: "flex", gap: 10 };
const workspaceGrid: React.CSSProperties = {
  flex: "0 0 auto",
  minHeight: "auto",
  display: "grid",
  gridTemplateColumns: "minmax(360px, 0.72fr) minmax(720px, 1.28fr)",
  gridTemplateRows: "auto auto",
  gap: 16,
  padding: 16,
  overflow: "visible",
};
const summaryPanel: React.CSSProperties = {
  gridColumn: "1 / -1",
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 360px",
  gap: 16,
};
const summaryLeft: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 14,
  padding: 16,
};
const alertPanel: React.CSSProperties = {
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.22)",
  borderRadius: 14,
  padding: 16,
};
const sectionKicker: React.CSSProperties = {
  color: "#bfdbfe",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.45,
  marginBottom: 12,
};
const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
  gap: 12,
};
const alertGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 10,
};
const progressHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  color: "#cbd5e1",
  fontSize: 13,
  marginBottom: 8,
};
const progressTrack: React.CSSProperties = {
  height: 9,
  borderRadius: 999,
  overflow: "hidden",
  background: "rgba(148,163,184,0.18)",
  marginBottom: 14,
};
const progressFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #2563eb, #22c55e)",
  transition: "width 180ms ease",
};
const contractorSummaryList: React.CSSProperties = {
  marginTop: 12,
  display: "grid",
  gap: 7,
};
const contractorSummaryRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 48px",
  gap: 6,
  color: "#cbd5e1",
  background: "rgba(2,6,23,0.45)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 9,
  padding: 8,
  fontSize: 12,
};
const kpiTile: React.CSSProperties = {
  background: "rgba(2,6,23,0.58)",
  border: "1px solid rgba(148,163,184,0.15)",
  borderRadius: 12,
  padding: 12,
  minHeight: 70,
};
const kpiLabel: React.CSSProperties = {
  color: "#cbd5e1",
  fontSize: 11,
  fontWeight: 850,
};
const kpiValue: React.CSSProperties = {
  marginTop: 7,
  fontSize: 27,
  lineHeight: 1,
  fontWeight: 950,
};
const queuePanel: React.CSSProperties = {
  minHeight: 0,
  minWidth: 0,
  height: "auto",
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 14,
  padding: 16,
  display: "flex",
  flexDirection: "column",
};
const reviewPanel: React.CSSProperties = {
  minHeight: 0,
  minWidth: 0,
  height: "auto",
  background: "linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94))",
  border: "1px solid rgba(96,165,250,0.24)",
  borderRadius: 14,
  padding: 16,
  overflow: "visible",
};
const panelHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  marginBottom: 12,
};
const panelTitle: React.CSSProperties = {
  margin: 0,
  color: "#dbeafe",
  fontSize: 18,
};
const reviewTitle: React.CSSProperties = {
  margin: 0,
  color: "#f8fafc",
  fontSize: 22,
  letterSpacing: "-0.03em",
};
const filters: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 150px 170px",
  gap: 10,
  marginBottom: 12,
};
const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "rgba(2,6,23,0.55)",
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 9,
  color: "#f8fafc",
  padding: "10px 12px",
  outline: "none",
};
const textarea: React.CSSProperties = {
  ...input,
  minHeight: 72,
  resize: "vertical",
};
const assetList: React.CSSProperties = {
  flex: "0 0 auto",
  minHeight: 0,
  overflow: "visible",
  display: "grid",
  alignContent: "start",
  gap: 9,
  paddingRight: 4,
};
const assetRow: React.CSSProperties = {
  width: "100%",
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr) auto 82px 74px 76px",
  gap: 10,
  alignItems: "center",
  textAlign: "left",
  background: "rgba(2,6,23,0.48)",
  border: "1px solid rgba(148,163,184,0.12)",
  borderRadius: 11,
  padding: "11px 12px",
  color: "#e5e7eb",
  cursor: "pointer",
};
const selectedAssetRow: React.CSSProperties = {
  background: "rgba(37,99,235,0.30)",
  border: "1px solid rgba(96,165,250,0.55)",
};
const reviewTick: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 999,
  display: "grid",
  placeItems: "center",
  background: "rgba(15,23,42,0.82)",
  border: "1px solid rgba(148,163,184,0.14)",
  fontWeight: 950,
};
const assetNameBlock: React.CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 4,
};
const queueMeta: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  whiteSpace: "nowrap",
};
const statusPill: React.CSSProperties = {
  border: "1px solid",
  borderRadius: 999,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 850,
  whiteSpace: "nowrap",
};
const reviewGrid: React.CSSProperties = {
  height: "auto",
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "minmax(360px, 0.9fr) minmax(420px, 1.1fr)",
  gap: 16,
  overflow: "visible",
};
const detailsPane: React.CSSProperties = {
  minHeight: 0,
  overflowY: "visible",
  overflowX: "visible",
  paddingRight: 4,
};
const photoPane: React.CSSProperties = {
  minHeight: 0,
  overflowY: "visible",
  overflowX: "visible",
  borderLeft: "1px solid rgba(148,163,184,0.12)",
  paddingLeft: 16,
};
const statusButtons: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 14,
};
const statusButton: React.CSSProperties = {
  background: "rgba(2,6,23,0.44)",
  color: "#cbd5e1",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 9,
  padding: "9px 8px",
  cursor: "pointer",
  fontWeight: 850,
  fontSize: 12,
};
const formGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};
const field: React.CSSProperties = {
  display: "grid",
  gap: 7,
  color: "#cbd5e1",
  fontSize: 12,
  fontWeight: 750,
  marginBottom: 12,
};
const manualCheckBox: React.CSSProperties = {
  marginTop: 4,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  border: "1px dashed rgba(56,189,248,0.35)",
  borderRadius: 12,
  padding: 12,
  color: "#cbd5e1",
  background: "rgba(14,165,233,0.08)",
};
const manualCheckGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "110px minmax(0, 1fr)",
  gap: "6px 10px",
  marginTop: 8,
  color: "#cbd5e1",
};
const shortcutHelp: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  lineHeight: 1.45,
  border: "1px solid rgba(148,163,184,0.14)",
  borderRadius: 10,
  padding: 10,
  background: "rgba(2,6,23,0.35)",
  marginTop: 12,
};
const actions: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  marginTop: 14,
};
const button: React.CSSProperties = {
  background: "#132640",
  color: "#e5e7eb",
  border: "1px solid rgba(148,163,184,0.25)",
  borderRadius: 10,
  padding: "10px 13px",
  cursor: "pointer",
  fontWeight: 850,
  textDecoration: "none",
};
const buttonSmall: React.CSSProperties = {
  ...button,
  padding: "8px 12px",
  fontSize: 12,
};
const primaryButton: React.CSSProperties = {
  ...button,
  background: "#2563eb",
  border: "1px solid rgba(96,165,250,0.65)",
};
const closeButton: React.CSSProperties = {
  background: "transparent",
  color: "#f8fafc",
  border: "none",
  fontSize: 28,
  cursor: "pointer",
  lineHeight: 1,
};
const emptyState: React.CSSProperties = {
  border: "1px dashed rgba(148,163,184,0.28)",
  borderRadius: 12,
  padding: 18,
  color: "#94a3b8",
  textAlign: "center",
};
const emptyReview: React.CSSProperties = {
  height: "100%",
  display: "grid",
  placeContent: "center",
  textAlign: "center",
  border: "1px dashed rgba(148,163,184,0.24)",
  borderRadius: 14,
};
const photoGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
};
const photoTile: React.CSSProperties = {
  display: "grid",
  gap: 8,
  textAlign: "left",
  color: "#dbeafe",
  background: "rgba(2,6,23,0.55)",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 10,
  padding: 8,
  minWidth: 0,
  cursor: "zoom-in",
};
const photoImage: React.CSSProperties = {
  width: "100%",
  height: 175,
  objectFit: "cover",
  borderRadius: 8,
  background: "#020617",
  border: "1px solid rgba(148,163,184,0.14)",
};
const photoPlaceholder: React.CSSProperties = {
  height: 175,
  display: "grid",
  placeItems: "center",
  color: "#94a3b8",
  background: "rgba(15,23,42,0.85)",
  border: "1px dashed rgba(148,163,184,0.28)",
  borderRadius: 8,
};
const viewerBackdrop: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 9000,
  background: "rgba(2,6,23,0.88)",
  display: "grid",
  placeItems: "center",
  padding: 24,
};
const viewerPanel: React.CSSProperties = {
  width: "min(1280px, 96vw)",
  height: "min(860px, 92vh)",
  background: "#020617",
  border: "1px solid rgba(96,165,250,0.34)",
  borderRadius: 16,
  display: "grid",
  gridTemplateRows: "auto minmax(0, 1fr) auto",
  overflow: "hidden",
  boxShadow: "0 30px 90px rgba(0,0,0,0.65)",
};
const viewerHeader: React.CSSProperties = {
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  borderBottom: "1px solid rgba(148,163,184,0.15)",
};
const viewerKicker: React.CSSProperties = {
  color: "#38bdf8",
  fontSize: 11,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};
const viewerTitle: React.CSSProperties = {
  marginTop: 4,
  color: "#f8fafc",
  fontWeight: 900,
};
const viewerSub: React.CSSProperties = {
  marginTop: 3,
  color: "#94a3b8",
  fontSize: 12,
};
const viewerActions: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};
const viewerButton: React.CSSProperties = {
  ...buttonSmall,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
const zoomBadge: React.CSSProperties = {
  color: "#cbd5e1",
  minWidth: 54,
  textAlign: "center",
  fontWeight: 850,
};
const viewerBody: React.CSSProperties = {
  position: "relative",
  minHeight: 0,
  overflow: "hidden",
};
const imagePanArea: React.CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "auto",
  display: "grid",
  placeItems: "center",
  background: "#020617",
};
const viewerImage: React.CSSProperties = {
  maxWidth: "92%",
  maxHeight: "88%",
  objectFit: "contain",
  transformOrigin: "center center",
  transition: "transform 120ms ease",
};
const viewerArrow: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  zIndex: 2,
  width: 42,
  height: 58,
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.25)",
  background: "rgba(15,23,42,0.78)",
  color: "#fff",
  fontSize: 34,
  cursor: "pointer",
};
const viewerFooter: React.CSSProperties = {
  padding: "10px 14px",
  borderTop: "1px solid rgba(148,163,184,0.15)",
  color: "#94a3b8",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  fontSize: 12,
  alignItems: "center",
};
const viewerEmpty: React.CSSProperties = {
  color: "#94a3b8",
  border: "1px dashed rgba(148,163,184,0.28)",
  borderRadius: 12,
  padding: 28,
};
