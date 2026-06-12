import React, { useEffect, useMemo, useState } from "react";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "../../../firebase";
import type { DistributionPointDetails, SavedMapAsset } from "../types";
import { buildNetworkState } from "../../../services/network";
import { buildDpRelationshipRouting } from "../../../services/dpRelationshipRouting";

type ConnectedHome = {
  port: number;
  homeId: string;
  homeName: string;
  status: string;
};

type Props = {
  visible: boolean;
  name: string;
  details: DistributionPointDetails;
  connectedHomes?: ConnectedHome[];
  availableThroughCables?: SavedMapAsset[];
  allDistributionPoints?: SavedMapAsset[];
  allAssets?: SavedMapAsset[];
  currentDpId?: string;
  editingAssetId?: string | null;
  onChangeName: (v: string) => void;
  onChange: (v: DistributionPointDetails) => void;
  onSave: (nextDetails?: DistributionPointDetails) => void;
  onCancel: () => void;
  onMoveHomeToDp?: (
    homeId: string,
    fromDpId: string | undefined,
    toDpId: string,
  ) => void;
  onUpdateHomeStatus?: (homeId: string, status: string) => void;
  onToggleHomeDistance?: (homeId: string, showDistance: boolean) => void;
};

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function normaliseRef(value: unknown): string {
  return text(value)
    .toUpperCase()
    .replace(/[–—]/g, "-")
    .replace(/[^A-Z0-9]/g, "");
}

function refsMatch(a: unknown, b: unknown): boolean {
  const left = normaliseRef(a);
  const right = normaliseRef(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function uniqueSortedNumbers(values: unknown[]): number[] {
  return Array.from(
    new Set(values.map((value) => Number(value)).filter(Number.isFinite)),
  ).sort((a, b) => a - b);
}

function getAssetIdentityKeys(asset: any): string[] {
  return [
    asset?.id,
    asset?.assetId,
    asset?.name,
    asset?.jointName,
    asset?.label,
    asset?.dpId,
  ]
    .map((value) => text(value))
    .filter(Boolean);
}

function getAssetTitle(asset: any): string {
  return text(
    asset?.name ||
      asset?.jointName ||
      asset?.label ||
      asset?.assetId ||
      asset?.cableId ||
      asset?.id ||
      "Asset",
  );
}

function getCableFibreTotalFromAsset(cable?: SavedMapAsset | null): number {
  const haystack = [
    (cable as any)?.fibreCount,
    (cable as any)?.fiberCount,
    (cable as any)?.coreCount,
    (cable as any)?.size,
    (cable as any)?.name,
    (cable as any)?.cableId,
  ]
    .map(text)
    .join(" ");
  const match = haystack.match(/(288|144|96|48|36|24|12)\s*F?/i);
  return match ? Number(match[1]) : 0;
}

function getPoint(asset: any): { lat: number; lng: number } | null {
  if (typeof asset?.lat === "number" && typeof asset?.lng === "number") {
    return { lat: asset.lat, lng: asset.lng };
  }

  const coords = asset?.geometry?.coordinates;
  if (asset?.geometry?.type === "Point" && Array.isArray(coords)) {
    const lat = Number(coords[0]);
    const lng = Number(coords[1]);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  }

  return null;
}

function getLinePoints(asset: any): { lat: number; lng: number }[] {
  const coords = asset?.geometry?.coordinates;
  if (asset?.geometry?.type !== "LineString" || !Array.isArray(coords)) return [];

  return coords
    .map((coord: any) => ({
      lat: Number(coord?.[0]),
      lng: Number(coord?.[1]),
    }))
    .filter((point: { lat: number; lng: number }) =>
      Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
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

function isDistributionPointAsset(asset: any): boolean {
  if (!asset || asset.geometry?.type === "LineString") return false;

  const haystack = [
    asset.assetType,
    asset.type,
    asset.jointType,
    asset.dpType,
    asset.distributionPointType,
    asset.closureType,
    asset.dpDetails?.closureType,
    asset.name,
    asset.label,
  ]
    .map(text)
    .join(" ")
    .toUpperCase();

  return (
    haystack.includes("DISTRIBUTION") ||
    haystack.includes("AFN") ||
    haystack.includes("CBT") ||
    haystack.includes("MDU") ||
    /\bSB\s*0*\d+\b/i.test(haystack) ||
    /SB0*\d+/i.test(haystack)
  );
}

function findAssetByAnyRef(
  refs: unknown[],
  assets: SavedMapAsset[],
): SavedMapAsset | null {
  const lookup = refs.map(normaliseRef).filter(Boolean);
  if (!lookup.length) return null;

  return (
    assets.find((asset: any) => {
      const keys = [
        asset?.id,
        asset?.assetId,
        asset?.name,
        asset?.jointName,
        asset?.label,
        asset?.cableId,
      ].map(normaliseRef);

      return keys.some((key) => lookup.some((ref) => refsMatch(key, ref)));
    }) || null
  );
}

function isSupportingCableCandidate(asset: SavedMapAsset | null | undefined): boolean {
  if (!asset) return false;

  const item = asset as any;
  const haystack = [
    item.assetType,
    item.type,
    item.cableType,
    item.name,
    item.label,
    item.cableId,
    item.source,
    item.notes,
    item.importedProperties?.Name,
    item.importedProperties?.name,
    item.importedProperties?.Description,
    item.importedProperties?.description,
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");

  if (asset.geometry?.type !== "LineString") return false;
  if (item.readOnly === true || item.isReferenceAsset === true) return false;

  if (
    haystack.includes("drop") ||
    item.isDropCable === true ||
    item.isHomeDrop === true ||
    item.generatedDrop === true ||
    item.autoGeneratedDrop === true ||
    Boolean(item.homeId || item.connectedHomeId || item.toHomeId || item.fromHomeId)
  ) {
    return false;
  }

  if (
    haystack.includes("openreach") ||
    haystack.includes("pia") ||
    haystack.includes("osp:") ||
    haystack.includes("pol:") ||
    haystack.includes("mp:") ||
    haystack.includes("jc:") ||
    haystack.includes("ch:")
  ) {
    return false;
  }

  return (
    haystack.includes("cable") ||
    haystack.includes("ulw") ||
    haystack.includes("feeder") ||
    haystack.includes("link") ||
    haystack.includes("distribution") ||
    haystack.includes("spine") ||
    getCableFibreTotalFromAsset(asset) > 0
  );
}

function minDistancePointToLineMeters(
  point: { lat: number; lng: number },
  line: { lat: number; lng: number }[],
): number {
  if (!line.length) return Number.POSITIVE_INFINITY;
  return Math.min(...line.map((linePoint) => distanceMeters(point, linePoint)));
}

function findDetectedSupportingCableForDp(args: {
  activeDpAsset: SavedMapAsset | null;
  availableThroughCables: SavedMapAsset[];
  allAssets: SavedMapAsset[];
}): SavedMapAsset | null {
  const { activeDpAsset, availableThroughCables, allAssets } = args;
  const point = getPoint(activeDpAsset);
  if (!point) return null;

  const candidates = [...availableThroughCables, ...allAssets]
    .filter(isSupportingCableCandidate)
    .filter((asset, index, arr) => {
      const key = normaliseRef((asset as any).id || (asset as any).assetId || getAssetTitle(asset));
      return arr.findIndex((candidate: any) => normaliseRef(candidate?.id || candidate?.assetId || getAssetTitle(candidate)) === key) === index;
    })
    .map((asset) => {
      const line = getLinePoints(asset);
      if (line.length < 2) return null;

      const startDistance = distanceMeters(point, line[0]);
      const endDistance = distanceMeters(point, line[line.length - 1]);
      const routeDistance = minDistancePointToLineMeters(point, line);

      return {
        asset,
        score: Math.min(startDistance, endDistance, routeDistance),
      };
    })
    .filter((item): item is { asset: SavedMapAsset; score: number } => Boolean(item))
    .filter((item) => item.score <= 40)
    .sort((a, b) => a.score - b.score);

  return candidates[0]?.asset || null;
}

function formatCableOptionLabel(cable: SavedMapAsset): string {
  const fibreTotal = getCableFibreTotalFromAsset(cable);
  return `${getAssetTitle(cable)} — ${fibreTotal > 0 ? `${fibreTotal}F` : "size unknown"}`;
}

type ParentSbReservationView = {
  parentName: string;
  childName: string;
  requiredFibres: number;
  branchCableName: string;
  parentCableName?: string;
  mappings: { parent: number; local: number }[];
};

type SbToSbFibreRoute = {
  id: string;
  fromSbId: string;
  fromSbName: string;
  toSbId: string;
  toSbName: string;
  parentFibres: number[];
  localFibres: number[];
  supportingCableId?: string;
  supportingCableName?: string;
  note?: string;
};

function parseFibreSelection(value: unknown): number[] {
  const raw = text(value);
  if (!raw) return [];

  const fibres = new Set<number>();

  raw
    .split(/[,\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const range = part.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
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

function formatFibreSelection(values: unknown): string {
  const fibres = uniqueSortedNumbers(Array.isArray(values) ? values : []);
  return fibres.join(", ");
}

function getSbToSbRoutes(details: DistributionPointDetails): SbToSbFibreRoute[] {
  const raw = (details as any)?.afnDetails?.sbToSbRoutes;
  return Array.isArray(raw) ? raw : [];
}

function makeSbRouteId(fromSbId: string, toSbId: string): string {
  return `${normaliseRef(fromSbId) || "FROM"}__${normaliseRef(toSbId) || "TO"}`;
}

function upsertSbToSbRoute(
  details: DistributionPointDetails,
  nextRoute: SbToSbFibreRoute,
): DistributionPointDetails {
  const existingRoutes = getSbToSbRoutes(details).filter(
    (route) => route.id !== nextRoute.id,
  );
  const primaryInputFibres = nextRoute.localFibres.length
    ? nextRoute.localFibres
    : nextRoute.parentFibres;

  return {
    ...details,
    closureType: "AFN",
    connectionsToHomes: primaryInputFibres.length * 8,
    afnDetails: {
      ...(details.afnDetails || {}),
      enabled: true,
      relationshipLed: true,
      relationshipMode: "sb_to_sb",
      parentSbId: nextRoute.fromSbId,
      parentSbName: nextRoute.fromSbName,
      childSbId: nextRoute.toSbId,
      childSbName: nextRoute.toSbName,
      sbToSbRoutes: [...existingRoutes, nextRoute],
      inputFibres: primaryInputFibres,
      parentInputFibres: nextRoute.parentFibres,
      localInputFibres: primaryInputFibres,
      fibreCountUsed: primaryInputFibres.length,
      splitterRatio: "1:8",
      splitterOutputs: 8,
      throughCableId: nextRoute.supportingCableId || details.afnDetails?.throughCableId,
    },
  } as DistributionPointDetails;
}

function buildParentSbReservationView(args: {
  childName: string;
  activeDpAsset: SavedMapAsset | null;
  selectedCable: SavedMapAsset | null;
  allDistributionPoints: SavedMapAsset[];
  allAssets: SavedMapAsset[];
  localFibres: number[];
  jointState: any;
}): ParentSbReservationView | null {
  const {
    childName,
    activeDpAsset,
    selectedCable,
    allDistributionPoints,
    allAssets,
    localFibres,
    jointState,
  } = args;

  if (!selectedCable || !localFibres.length) return null;

  const cableItem = selectedCable as any;
  const cableFibreTotal = getCableFibreTotalFromAsset(selectedCable);

  const explicitParentFibres = uniqueSortedNumbers([
    ...((Array.isArray(cableItem.allocatedInputFibres)
      ? cableItem.allocatedInputFibres
      : []) as any[]),
    ...((Array.isArray(cableItem.parentInputFibres)
      ? cableItem.parentInputFibres
      : []) as any[]),
    ...((Array.isArray(cableItem.upstreamFibres)
      ? cableItem.upstreamFibres
      : []) as any[]),
    ...((Array.isArray(jointState?.parentFibres)
      ? jointState.parentFibres
      : []) as any[]),
    ...((Array.isArray(jointState?.upstreamFibres)
      ? jointState.upstreamFibres
      : []) as any[]),
  ]);

  const looksLikeBranchCable =
    Boolean(cableItem.parentCableId || cableItem.parentCableName) ||
    explicitParentFibres.length > 0 ||
    (cableFibreTotal > 0 && cableFibreTotal <= 24);

  // DP/SB routing is manual-authority. Cables are supporting route evidence only.
  if (!looksLikeBranchCable) return null;

  const parentFibres =
    explicitParentFibres.length >= localFibres.length
      ? explicitParentFibres.slice(0, localFibres.length)
      : [];

  const childRefs = [
    activeDpAsset?.id,
    (activeDpAsset as any)?.assetId,
    (activeDpAsset as any)?.name,
    (activeDpAsset as any)?.jointName,
    (activeDpAsset as any)?.label,
    childName,
  ];

  const endpointParent = findAssetByAnyRef(
    [
      cableItem.fromAssetId,
      cableItem.toAssetId,
      cableItem.sourceAssetId,
      cableItem.targetAssetId,
      cableItem.aAssetId,
      cableItem.bAssetId,
      cableItem.startAssetId,
      cableItem.endAssetId,
      cableItem.fromDpId,
      cableItem.toDpId,
    ].filter((value) => {
      const valueRef = normaliseRef(value);
      return valueRef && !childRefs.some((childRef) => refsMatch(valueRef, childRef));
    }),
    [...allDistributionPoints, ...allAssets].filter(isDistributionPointAsset),
  );

  const line = getLinePoints(selectedCable);
  const childPoint = getPoint(activeDpAsset);
  const parentByGeometry =
    !endpointParent && line.length && childPoint
      ? [...allDistributionPoints, ...allAssets]
          .filter(isDistributionPointAsset)
          .filter((candidate) => {
            const candidateTitle = getAssetTitle(candidate);
            return !refsMatch(candidateTitle, childName) && !refsMatch((candidate as any).id, activeDpAsset?.id);
          })
          .map((candidate) => {
            const point = getPoint(candidate);
            if (!point) return null;
            const distanceToStart = distanceMeters(point, line[0]);
            const distanceToEnd = distanceMeters(point, line[line.length - 1]);
            const childDistanceToStart = distanceMeters(childPoint, line[0]);
            const childDistanceToEnd = distanceMeters(childPoint, line[line.length - 1]);
            const candidateDistance = Math.min(distanceToStart, distanceToEnd);
            const isOppositeEnd =
              childDistanceToStart < childDistanceToEnd
                ? distanceToEnd < distanceToStart
                : distanceToStart < distanceToEnd;

            return {
              asset: candidate,
              score: candidateDistance + (isOppositeEnd ? 0 : 1000),
            };
          })
          .filter(Boolean)
          .sort((a: any, b: any) => a.score - b.score)[0]?.asset || null
      : null;

  const parentAsset = endpointParent || parentByGeometry;
  const parentName = parentAsset ? getAssetTitle(parentAsset) : text(cableItem.parentSbName || cableItem.parentDpName || "Parent SB");

  const mappings =
    parentFibres.length === localFibres.length
      ? parentFibres.map((parent, index) => ({ parent, local: localFibres[index] }))
      : [];

  return {
    parentName,
    childName,
    requiredFibres: localFibres.length,
    branchCableName: getAssetTitle(selectedCable),
    parentCableName: text(cableItem.parentCableName || cableItem.parentCableId || ""),
    mappings,
  };
}

async function uploadAssetFile(assetFolder: string, file: File) {
  const fileRef = ref(
    storage,
    `asset-uploads/${assetFolder}/${Date.now()}_${crypto.randomUUID()}_${safeFileName(file.name)}`,
  );
  await uploadBytes(fileRef, file, { contentType: file.type || undefined });
  return getDownloadURL(fileRef);
}

export default function DistributionPointDetailsModal({
  visible,
  name,
  details,
  connectedHomes = [],
  availableThroughCables = [],
  allDistributionPoints = [],
  allAssets = [],
  currentDpId,
  editingAssetId,
  onChangeName,
  onChange,
  onSave,
  onCancel,
  onMoveHomeToDp,
  onUpdateHomeStatus,
  onToggleHomeDistance,
}: Props) {
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [connectedHomesOpen, setConnectedHomesOpen] = useState(false);
  const [moveTargetsByHomeId, setMoveTargetsByHomeId] = useState<
    Record<string, string>
  >({});

  const previewImage = useMemo(() => {
    if (!selectedImage) return details.image || "";
    return URL.createObjectURL(selectedImage);
  }, [selectedImage, details.image]);


  const update = (key: keyof DistributionPointDetails, value: any) => {
    onChange({ ...details, [key]: value });
  };

  const updateReading = (index: number, value: string) => {
    const readings = [...(details.powerReadings || ["", "", "", ""])] as [
      string,
      string,
      string,
      string,
    ];
    readings[index] = value;
    onChange({ ...details, powerReadings: readings });
  };

  const selectedCableId = details.afnDetails?.throughCableId || "";
  const selectedCable =
    ([...availableThroughCables, ...allAssets].find((cable: any) => {
      if (!selectedCableId) return false;
      const refs = [
        cable?.id,
        cable?.assetId,
        cable?.name,
        cable?.cableId,
        cable?.label,
      ];
      return refs.some((ref) => refsMatch(ref, selectedCableId));
    }) as SavedMapAsset | undefined) || undefined;
  const currentInputFibres = uniqueSortedNumbers(
    details.afnDetails?.inputFibres || [],
  );

  const activeDpId = editingAssetId || currentDpId;
  const activeDpAsset = useMemo(() => {
    const lookupKeys = [activeDpId, name].map(normaliseRef).filter(Boolean);

    return (
      [...allDistributionPoints, ...allAssets].find((asset: any) => {
        const keys = getAssetIdentityKeys(asset).map(normaliseRef);
        return keys.some((key) => lookupKeys.some((lookup) => refsMatch(key, lookup)));
      }) || null
    );
  }, [activeDpId, allAssets, allDistributionPoints, name]);

  const autoDetectedCable = useMemo(
    () =>
      selectedCable ||
      findDetectedSupportingCableForDp({
        activeDpAsset: activeDpAsset as SavedMapAsset | null,
        availableThroughCables,
        allAssets,
      }),
    [activeDpAsset, allAssets, availableThroughCables, selectedCable],
  );

  const effectiveSelectedCable = selectedCable || autoDetectedCable || null;
  const effectiveSelectedCableId =
    selectedCableId ||
    text(
      (effectiveSelectedCable as any)?.id ||
        (effectiveSelectedCable as any)?.assetId ||
        (effectiveSelectedCable as any)?.name ||
        "",
    );

  const sbRouteTargets = useMemo(
    () =>
      [...allDistributionPoints, ...allAssets]
        .filter(isDistributionPointAsset)
        .filter((asset, index, arr) => {
          const id = normaliseRef((asset as any).id || getAssetTitle(asset));
          return arr.findIndex((candidate: any) => normaliseRef(candidate?.id || getAssetTitle(candidate)) === id) === index;
        })
        .sort((a, b) => getAssetTitle(a).localeCompare(getAssetTitle(b))),
    [allAssets, allDistributionPoints],
  );

  const storedSbRoutes = getSbToSbRoutes(details);
  const primarySbRoute = storedSbRoutes[0];
  const [manualFromSbId, setManualFromSbId] = useState<string>(
    primarySbRoute?.fromSbId || "",
  );
  const [manualToSbId, setManualToSbId] = useState<string>(
    primarySbRoute?.toSbId || activeDpId || "",
  );
  const [manualParentFibres, setManualParentFibres] = useState<string>(
    formatFibreSelection(primarySbRoute?.parentFibres || (details as any)?.afnDetails?.parentInputFibres || []),
  );
  const [manualLocalFibres, setManualLocalFibres] = useState<string>(
    formatFibreSelection(primarySbRoute?.localFibres || details.afnDetails?.inputFibres || []),
  );
  useEffect(() => {
    const nextPrimaryRoute = getSbToSbRoutes(details)[0];
    setManualFromSbId(nextPrimaryRoute?.fromSbId || "");
    setManualToSbId(nextPrimaryRoute?.toSbId || activeDpId || "");
    setManualParentFibres(formatFibreSelection(nextPrimaryRoute?.parentFibres || (details as any)?.afnDetails?.parentInputFibres || []));
    setManualLocalFibres(formatFibreSelection(nextPrimaryRoute?.localFibres || details.afnDetails?.inputFibres || []));
    setManualSbNote(nextPrimaryRoute?.note || "");
  }, [activeDpId, details]);

  const [manualSbNote, setManualSbNote] = useState<string>(primarySbRoute?.note || "");

  const selectedManualFromSb = sbRouteTargets.find((dp: any) =>
    refsMatch(dp.id || dp.assetId || getAssetTitle(dp), manualFromSbId),
  );
  const selectedManualToSb =
    sbRouteTargets.find((dp: any) =>
      refsMatch(dp.id || dp.assetId || getAssetTitle(dp), manualToSbId),
    ) || activeDpAsset;

  function applyManualSbRoute() {
    const fromSb = selectedManualFromSb;
    const toSb = selectedManualToSb;

    if (!fromSb || !toSb) {
      alert("Select both the from SB and the to SB before applying the route.");
      return;
    }

    const parentFibres = parseFibreSelection(manualParentFibres);
    const localFibres = parseFibreSelection(manualLocalFibres);

    if (!parentFibres.length && !localFibres.length) {
      alert("Enter the fibres used for this SB to SB route, for example 1-4 or 7, 8, 9.");
      return;
    }

    const normalisedLocalFibres = localFibres.length ? localFibres : parentFibres;
    const nextRoute: SbToSbFibreRoute = {
      id: makeSbRouteId((fromSb as any).id || getAssetTitle(fromSb), (toSb as any).id || getAssetTitle(toSb)),
      fromSbId: text((fromSb as any).id || (fromSb as any).assetId || getAssetTitle(fromSb)),
      fromSbName: getAssetTitle(fromSb),
      toSbId: text((toSb as any).id || (toSb as any).assetId || getAssetTitle(toSb)),
      toSbName: getAssetTitle(toSb),
      parentFibres,
      localFibres: normalisedLocalFibres,
      supportingCableId: effectiveSelectedCableId || undefined,
      supportingCableName: effectiveSelectedCable ? getAssetTitle(effectiveSelectedCable) : undefined,
      note: manualSbNote.trim() || undefined,
    };

    onChange(upsertSbToSbRoute(details, nextRoute));
  }

  const networkState = useMemo(
    () => buildNetworkState(allAssets as any),
    [allAssets],
  );

  const jointMatchedDpState = useMemo(() => {
    const lookupKeys = [
      activeDpId,
      name,
      ...(activeDpAsset ? getAssetIdentityKeys(activeDpAsset as any) : []),
    ].filter(Boolean);

    const direct = activeDpId
      ? (networkState.dpStates || {})[activeDpId]
      : null;
    if (direct) return direct as any;

    return (
      Object.values(networkState.dpStates || {}).find((state: any) =>
        lookupKeys.some((key) => refsMatch(state.assetId || state.assetName, key)),
      ) || null
    ) as any;
  }, [activeDpAsset, activeDpId, name, networkState]);

  const jointMappedInputFibres = uniqueSortedNumbers([
    ...(((jointMatchedDpState as any)?.jointMatchedFibres || []) as any[]),
    ...(((jointMatchedDpState as any)?.jointMatch?.fibres || []) as any[]),
    ...(((jointMatchedDpState as any)?.inputFibres || []) as any[]),
  ]);

  const jointMappedSplitterFibres = uniqueSortedNumbers([
    ...(((jointMatchedDpState as any)?.splitterFibres || []) as any[]),
  ]);

  const activeDpDetails =
    ((activeDpAsset as any)?.dpDetails ||
      (activeDpAsset as any)?.properties?.dpDetails ||
      {}) as any;
  const activeAfnDetails = activeDpDetails.afnDetails || {};
  const storedInputFibres = uniqueSortedNumbers([
    ...currentInputFibres,
    ...((Array.isArray(activeAfnDetails.inputFibres)
      ? activeAfnDetails.inputFibres
      : []) as any[]),
    ...((Array.isArray(activeAfnDetails.splitterFibres)
      ? activeAfnDetails.splitterFibres
      : []) as any[]),
  ]);

  const hasJointMappedFibres = jointMappedInputFibres.length > 0;
  const effectiveInputFibres = hasJointMappedFibres
    ? jointMappedInputFibres
    : storedInputFibres;

  // Capacity for AFN/SB must be based only on the local splitter inputs.
  // Joint-matched shoot-off/pass-through fibres are part of the feed chain,
  // but they are not customer splitter ports at this SB.
  const effectiveSplitterFibres = hasJointMappedFibres
    ? jointMappedSplitterFibres
    : storedInputFibres;

  const closureTypeText = normaliseRef(
    details.closureType ||
      activeDpDetails.closureType ||
      activeDpDetails.networkArchitecture ||
      (activeDpAsset as any)?.closureType ||
      (activeDpAsset as any)?.dpType,
  );
  const isAfn = closureTypeText.includes("AFN");

  const capacity = isAfn
    ? effectiveSplitterFibres.length * 8
    : Number(details.connectionsToHomes || activeDpDetails.connectionsToHomes || 0);
  const used = connectedHomes.length;
  const available = Math.max(0, capacity - used);
  const operationalCapacityPercent = capacity > 0 ? Math.round((used / capacity) * 100) : 0;
  const operationalCapacityWarning =
    capacity > 0 && used > capacity
      ? "Over capacity"
      : capacity > 0 && used === capacity
        ? "Full"
        : operationalCapacityPercent >= 80
          ? "Near capacity"
          : "Capacity OK";
  const availableMoveTargets = allDistributionPoints.filter(
    (dp) => dp.id !== activeDpId,
  );

  const parentSbReservationView = buildParentSbReservationView({
    childName: name,
    activeDpAsset: activeDpAsset as SavedMapAsset | null,
    selectedCable: effectiveSelectedCable || null,
    allDistributionPoints,
    allAssets,
    localFibres: effectiveSplitterFibres.length
      ? effectiveSplitterFibres
      : effectiveInputFibres,
    jointState: jointMatchedDpState,
  });

  const dpRelationshipRouting = useMemo(
    () =>
      buildDpRelationshipRouting({
        currentDpId: activeDpId,
        currentDpName: name,
        currentDpDetails: details,
        selectedCableId: effectiveSelectedCableId,
        localFibres: effectiveSplitterFibres.length ? effectiveSplitterFibres : effectiveInputFibres,
        allDistributionPoints,
        allAssets,
      }),
    [activeDpId, allAssets, allDistributionPoints, details, effectiveInputFibres, effectiveSelectedCableId, effectiveSplitterFibres, name],
  );

  if (!visible) return null;

  const fibreTotal = getCableFibreTotalFromAsset(effectiveSelectedCable);
  const selectedInputFibreCount = effectiveInputFibres.length;
  const passthroughFibreCount =
    effectiveSelectedCable && fibreTotal > 0
      ? Math.max(fibreTotal - selectedInputFibreCount, 0)
      : 0;

  const usedByOtherAfns = new Set<number>();

  allDistributionPoints.forEach((asset) => {
    if (asset.id === activeDpId) return;

    const afn = asset.dpDetails?.afnDetails;
    if (!afn?.throughCableId || !effectiveSelectedCableId || !refsMatch(afn.throughCableId, effectiveSelectedCableId)) return;

    (afn.inputFibres || []).forEach((fibre) =>
      usedByOtherAfns.add(Number(fibre)),
    );
  });

  // Branch / jump-off cables can also reserve fibres from the same spine cable.
  // Treat those reserved fibres exactly like fibres used by another AFN.
  allAssets.forEach((asset) => {
    if (asset.assetType !== "cable") return;
    if (!effectiveSelectedCableId || !refsMatch((asset as any).parentCableId, effectiveSelectedCableId)) return;

    ((asset as any).allocatedInputFibres || []).forEach((fibre: unknown) => {
      const fibreNumber = Number(fibre);
      if (Number.isFinite(fibreNumber)) usedByOtherAfns.add(fibreNumber);
    });
  });

  function updateAfnDetails(
    nextAfnDetails: Partial<
      NonNullable<DistributionPointDetails["afnDetails"]>
    >,
  ) {
    const nextInputFibres = nextAfnDetails.inputFibres || currentInputFibres;

    onChange({
      ...details,
      closureType: "AFN",
      connectionsToHomes: nextInputFibres.length * 8,
      afnDetails: {
        enabled: true,
        throughCableId: effectiveSelectedCableId || undefined,
        inputFibres: nextInputFibres,
        fibreCountUsed: nextInputFibres.length,
        splitterRatio: "1:8",
        splitterOutputs: 8,
        ...details.afnDetails,
        ...nextAfnDetails,
      },
    });
  }

  function toggleFibre(fibre: number) {
    if (hasJointMappedFibres) return;
    const selectedHere = currentInputFibres.includes(fibre);

    let nextFibres: number[];

    if (selectedHere) {
      nextFibres = currentInputFibres.filter((item) => item !== fibre);
    } else {
      if (usedByOtherAfns.has(fibre)) return;
      nextFibres = [...currentInputFibres, fibre].sort((a, b) => a - b);
    }

    updateAfnDetails({
      inputFibres: nextFibres,
      fibreCountUsed: nextFibres.length,
    });
  }

  const handleSave = async () => {
    try {
      setSaving(true);
      let imageUrl = details.image || "";

      if (selectedImage) {
        imageUrl = await uploadAssetFile("distribution-points", selectedImage);
      }

      const nextDetails =
        isAfn && effectiveSelectedCableId && !details.afnDetails?.throughCableId
          ? ({
              ...details,
              image: imageUrl,
              afnDetails: {
                ...(details.afnDetails || {}),
                enabled: true,
                throughCableId: effectiveSelectedCableId,
              },
            } as DistributionPointDetails)
          : { ...details, image: imageUrl };
      onChange(nextDetails);
      onSave(nextDetails);
    } catch (err) {
      console.error("Distribution point image upload failed", err);
      alert("Image upload failed. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="modal-bg" onClick={saving ? undefined : onCancel} />

      <div className="modal">
        <h3>Distribution Point</h3>

        <label>Name</label>
        <input value={name} onChange={(e) => onChangeName(e.target.value)} />

        <label>Build Status</label>
        <select
          value={details.buildStatus || ""}
          onChange={(e) => update("buildStatus", e.target.value)}
        >
          <option value="">Not set</option>
          <option value="Live">Live</option>
          <option value="BWIP">BWIP</option>
          <option value="Unserviceable">Unserviceable</option>
          <option value="Live not ready for service">
            Live not ready for service
          </option>
        </select>

        <label>DP Type</label>
        <select
          value={details.closureType || "CBT"}
          onChange={(e) => {
            const nextClosureType = e.target.value as
              | "CBT"
              | "AFN"
              | "MDU"
              | "MDU_SPLITTER";

            onChange({
              ...details,
              closureType: nextClosureType,
              connectionsToHomes:
                nextClosureType === "AFN"
                  ? (details.afnDetails?.inputFibres?.length || 0) * 8
                  : details.connectionsToHomes || 8,
              afnDetails:
                nextClosureType === "AFN"
                  ? details.afnDetails || {
                      enabled: true,
                      throughCableId: undefined,
                      fibreCountUsed: 0,
                      inputFibres: [],
                      splitterRatio: "1:8",
                      splitterOutputs: 8,
                    }
                  : undefined,
            });
          }}
        >
          <option value="CBT">CBT</option>
          <option value="AFN">AFN Pole Splitter</option>
          <option value="MDU">MDU Direct Feed</option>
          <option value="MDU_SPLITTER">MDU + Splitter</option>
        </select>

        <label>DP Role</label>
        <select
          value={details.dpRole || "serving"}
          onChange={(e) =>
            update(
              "dpRole" as keyof DistributionPointDetails,
              e.target.value as "serving" | "splice_only",
            )
          }
        >
          <option value="serving">Serving DP / customer allocation</option>
          <option value="splice_only">Splice-only / passthrough</option>
        </select>

        {details.dpRole === "splice_only" ? (
          <div className="afn-summary" style={{ borderColor: "#f59e0b" }}>
            <strong>Splice-only mode</strong>
            <br />
            This AFN stays in topology and passthrough propagation, but SB fibre
            allocation will ignore it when Rebuild Chain runs.
          </div>
        ) : null}

        {isAfn ? (
          <div className="afn-panel">
            <strong>AFN loop-through splitter</strong>
            <span>
              DP/SB routing is manual-authority. Choose which SB feeds which SB;
              the cable underneath is only the supporting physical route.
            </span>

            <div className="sb-route-builder">
              <div className="parent-sb-title">Manual SB → SB Fibre Reservation</div>
              <div className="sb-route-grid">
                <label>
                  From SB
                  <select
                    value={manualFromSbId}
                    onChange={(e) => setManualFromSbId(e.target.value)}
                  >
                    <option value="">Select parent/source SB...</option>
                    {sbRouteTargets
                      .filter((dp: any) => !refsMatch(dp.id || getAssetTitle(dp), manualToSbId))
                      .map((dp: any) => (
                        <option key={dp.id || getAssetTitle(dp)} value={dp.id || getAssetTitle(dp)}>
                          {getAssetTitle(dp)}
                        </option>
                      ))}
                  </select>
                </label>

                <label>
                  To SB
                  <select
                    value={manualToSbId}
                    onChange={(e) => setManualToSbId(e.target.value)}
                  >
                    <option value="">Select child/target SB...</option>
                    {sbRouteTargets.map((dp: any) => (
                      <option key={dp.id || getAssetTitle(dp)} value={dp.id || getAssetTitle(dp)}>
                        {getAssetTitle(dp)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="sb-route-grid">
                <label>
                  Parent fibres
                  <input
                    value={manualParentFibres}
                    onChange={(e) => setManualParentFibres(e.target.value)}
                    placeholder="Example: 1-4 or 7, 8, 9"
                  />
                </label>

                <label>
                  Local fibres at target SB
                  <input
                    value={manualLocalFibres}
                    onChange={(e) => setManualLocalFibres(e.target.value)}
                    placeholder="Leave blank to use same fibres"
                  />
                </label>
              </div>

              <label>
                Note
                <input
                  value={manualSbNote}
                  onChange={(e) => setManualSbNote(e.target.value)}
                  placeholder="Example: SB01 feeds SB04 on F1-F4"
                />
              </label>

              <button type="button" className="sb-route-apply" onClick={applyManualSbRoute}>
                Apply SB → SB Route
              </button>

              {storedSbRoutes.length ? (
                <div className="sb-route-list">
                  {storedSbRoutes.map((route) => (
                    <div key={route.id} className="sb-route-item">
                      <strong>{route.fromSbName} → {route.toSbName}</strong>
                      <span>
                        Parent fibres: {formatFibreSelection(route.parentFibres) || "—"}
                        {" · "}
                        Local fibres: {formatFibreSelection(route.localFibres) || "—"}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="parent-sb-note">
                  This directly reserves fibres from one SB to another. Cable detection and joint uploads cannot overwrite this route.
                </div>
              )}
            </div>

            {dpRelationshipRouting ? (
              <div className="parent-sb-reservation">
                <div className="parent-sb-title">DP Relationship Routing</div>
                <div className="parent-sb-path">
                  {dpRelationshipRouting.selectedParent ? (
                    <>
                      <strong>{dpRelationshipRouting.selectedParent.name}</strong>
                      <span>→</span>
                      <strong>{dpRelationshipRouting.current.name}</strong>
                    </>
                  ) : dpRelationshipRouting.fedFrom.length ? (
                    <>
                      <strong>Fed from</strong>
                      <span>→</span>
                      <strong>{dpRelationshipRouting.fedFrom.map((node) => node.name).join(", ")}</strong>
                    </>
                  ) : (
                    <strong>No parent SB detected yet</strong>
                  )}
                </div>
                <div className="parent-sb-fibres">
                  {dpRelationshipRouting.requiredFibres} fibre
                  {dpRelationshipRouting.requiredFibres === 1 ? "" : "s"} needed
                </div>
                {dpRelationshipRouting.mapping.length ? (
                  <div className="parent-sb-map">
                    {dpRelationshipRouting.mapping.map((mapping) => (
                      <span key={`${mapping.parentFibre}-${mapping.localFibre}`}>
                        F{mapping.parentFibre} → F{mapping.localFibre}
                      </span>
                    ))}
                  </div>
                ) : null}
                {dpRelationshipRouting.mainDownstream.length || dpRelationshipRouting.branchDownstream.length ? (
                  <div className="parent-sb-note">
                    {dpRelationshipRouting.mainDownstream.length
                      ? `Main downstream: ${dpRelationshipRouting.mainDownstream.map((node) => node.name).join(", ")}`
                      : ""}
                    {dpRelationshipRouting.mainDownstream.length && dpRelationshipRouting.branchDownstream.length ? " · " : ""}
                    {dpRelationshipRouting.branchDownstream.length
                      ? `Branch DPs: ${dpRelationshipRouting.branchDownstream.map((node) => `${node.name}${node.requiredFibres ? ` (${node.requiredFibres}F)` : ""}`).join(", ")}`
                      : ""}
                  </div>
                ) : null}
                {dpRelationshipRouting.selectedCableName ? (
                  <div className="parent-sb-note">
                    Supporting route cable: {dpRelationshipRouting.selectedCableName}
                  </div>
                ) : null}
              </div>
            ) : null}

            {parentSbReservationView ? (
              <div className="parent-sb-reservation">
                <div className="parent-sb-title">Parent SB Reservation</div>
                <div className="parent-sb-path">
                  <strong>{parentSbReservationView.parentName}</strong>
                  <span>→</span>
                  <strong>{parentSbReservationView.childName}</strong>
                </div>
                <div className="parent-sb-fibres">
                  {parentSbReservationView.requiredFibres} fibre
                  {parentSbReservationView.requiredFibres === 1 ? "" : "s"} needed
                </div>

                {parentSbReservationView.mappings.length ? (
                  <div className="parent-sb-map">
                    {parentSbReservationView.mappings.map((mapping) => (
                      <span key={`${mapping.parent}-${mapping.local}`}>
                        F{mapping.parent} → F{mapping.local}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="parent-sb-note">
                  Branch cable: {parentSbReservationView.branchCableName}
                  {parentSbReservationView.parentCableName
                    ? ` · Parent cable: ${parentSbReservationView.parentCableName}`
                    : ""}
                </div>
              </div>
            ) : null}

            <label>Supporting Cable / Route</label>
            <select
              value={effectiveSelectedCableId}
              onChange={(e) => {
                const nextThroughCableId = e.target.value || undefined;

                onChange({
                  ...details,
                  closureType: "AFN",
                  connectionsToHomes: 0,
                  afnDetails: {
                    enabled: true,
                    throughCableId: nextThroughCableId,
                    fibreCountUsed: 0,
                    inputFibres: [],
                    splitterRatio: "1:8",
                    splitterOutputs: 8,
                  },
                });
              }}
            >
              <option value="">Select supporting cable</option>
              {availableThroughCables.map((cable) => (
                <option key={cable.id} value={cable.id}>
                  {formatCableOptionLabel(cable)}
                </option>
              ))}
            </select>

            {effectiveSelectedCableId ? (
              <div className="afn-readonly-fibres">
                <div className="afn-grid-header">
                  <span>Fibre source</span>
                  <em>{effectiveInputFibres.length} shown · {capacity || 0} outputs</em>
                </div>

                <div className="afn-summary">
                  Joint mapping / CMJ continuity is the source of truth. Fibres
                  are displayed here for reference only and are no longer manually
                  selected from this DP modal.
                </div>

                {effectiveInputFibres.length ? (
                  <div className="afn-readonly-fibre-list">
                    {effectiveInputFibres.map((fibre) => (
                      <span key={fibre}>F{fibre}</span>
                    ))}
                  </div>
                ) : (
                  <div className="afn-summary">
                    No local splitter fibres are stored on this DP yet. Upload or
                    rebuild from joint continuity to populate the routing view.
                  </div>
                )}
              </div>
            ) : (
              <div className="afn-summary">
                Select a supporting cable to view the joint-controlled fibre source.
              </div>
            )}

            <div className="afn-summary">
              Fibres shown: {effectiveInputFibres.join(", ") || "none"}
              <br />
              Splitter: 1:8 / 8 outputs
              <br />
              Source: uploaded joint continuity / CMJ-AG mapping
            </div>
          </div>
        ) : null}
        {details.closureType === "MDU" ||
        details.closureType === "MDU_SPLITTER" ? (
          <div className="afn-panel">
            <strong>MDU fibre allocation</strong>

            <span>
              Reserve fibres for apartment riser feeds and optional splitter
              outputs.
            </span>

            <label>Supporting Cable / Route</label>

            <select
              value={details.mduDetails?.throughCableId || ""}
              onChange={(e) => {
                onChange({
                  ...details,
                  mduDetails: {
                    enabled: true,
                    throughCableId: e.target.value,
                    mduFibres: 6,
                    splitterFibres:
                      details.closureType === "MDU_SPLITTER" ? 2 : 0,
                    totalReservedFibres:
                      details.closureType === "MDU_SPLITTER" ? 8 : 6,
                    inputFibres: [],
                  },
                });
              }}
            >
              <option value="">Select supporting cable</option>

              {availableThroughCables.map((cable) => (
                <option key={cable.id} value={cable.id}>
                  {formatCableOptionLabel(cable)}
                </option>
              ))}
            </select>

            <label>MDU Fibres</label>

            <input
              type="number"
              min={1}
              max={24}
              value={details.mduDetails?.mduFibres || 6}
              onChange={(e) => {
                const mduFibres = Number(e.target.value);

                const splitterFibres = details.mduDetails?.splitterFibres || 0;

                onChange({
                  ...details,
                  mduDetails: {
                    ...(details.mduDetails || {}),
                    enabled: true,
                    mduFibres,
                    splitterFibres,
                    totalReservedFibres: mduFibres + splitterFibres,
                  },
                });
              }}
            />

            {details.closureType === "MDU_SPLITTER" ? (
              <>
                <label>Splitter Fibres</label>

                <input
                  type="number"
                  min={0}
                  max={12}
                  value={details.mduDetails?.splitterFibres || 2}
                  onChange={(e) => {
                    const splitterFibres = Number(e.target.value);

                    const mduFibres = details.mduDetails?.mduFibres || 6;

                    onChange({
                      ...details,
                      mduDetails: {
                        ...(details.mduDetails || {}),
                        enabled: true,
                        splitterFibres,
                        mduFibres,
                        totalReservedFibres: splitterFibres + mduFibres,
                      },
                    });
                  }}
                />
              </>
            ) : null}

            <div className="afn-summary">
              Reserved fibres:{" "}
              <strong>{details.mduDetails?.totalReservedFibres || 0}</strong>
            </div>
          </div>
        ) : null}

        <label>Connections to Homes</label>
        <select
          value={
            isAfn
              ? capacity
              : details.connectionsToHomes || 8
          }
          disabled={isAfn}
          onChange={(e) => update("connectionsToHomes", Number(e.target.value))}
        >
          {isAfn ? (
            <option value={capacity}>{capacity} from selected AFN fibres</option>
          ) : null}
          <option value={8}>8</option>
          <option value={16}>16</option>
          <option value={24}>24</option>
          <option value={32}>32</option>
          <option value={48}>48</option>
          <option value={64}>64</option>
          <option value={80}>80</option>
        </select>

        <div className="afn-summary">
          <strong>Operational fibre view</strong>
          <br />
          Supporting route cable: {effectiveSelectedCable ? getAssetTitle(effectiveSelectedCable) : details.mduDetails?.throughCableId || "not selected"}
          <br />
          Input fibres consumed: {selectedInputFibreCount || details.mduDetails?.totalReservedFibres || 0}
          <br />
          Passthrough fibres: {effectiveSelectedCable ? passthroughFibreCount : "—"}
          <br />
          Capacity state: {operationalCapacityWarning} ({operationalCapacityPercent}%)
        </div>

        <div className="dp-capacity-grid">
          <div>
            <strong>{capacity || 0}</strong>
            <span>Capacity</span>
          </div>
          <div>
            <strong>{used}</strong>
            <span>Used</span>
          </div>
          <div>
            <strong>{available}</strong>
            <span>Available</span>
          </div>
        </div>

        <label>Connected Homes</label>
        <div className="connected-homes-dropdown">
          <button
            type="button"
            className="connected-homes-summary"
            onClick={() => setConnectedHomesOpen((open) => !open)}
          >
            <span>
              {used} connected / {capacity || 0} capacity
            </span>
            <strong>{connectedHomesOpen ? "▲" : "▼"}</strong>
          </button>

          {connectedHomesOpen ? (
            <div className="connected-homes-list">
              {connectedHomes.length === 0 ? (
                <div className="connected-empty">No homes connected yet</div>
              ) : (
                connectedHomes.map((home) => {
                  const selectedTarget = moveTargetsByHomeId[home.homeId] || "";
                  const statusValue = home.status || "Connected";

                  return (
                    <div
                      key={`${home.homeId}-${home.port}`}
                      className="connected-home-card"
                    >
                      <div className="connected-home-card-header">
                        <div>
                          <strong>Port {home.port}</strong>
                          <span>{home.homeName || home.homeId}</span>
                        </div>
                        <em
                          className={
                            String(statusValue).toLowerCase().includes("live")
                              ? "live"
                              : "planned"
                          }
                        >
                          {statusValue}
                        </em>
                      </div>

                      {onUpdateHomeStatus ? (
                        <div className="connected-home-control-row">
                          <label>Status</label>
                          <select
                            value={statusValue}
                            onChange={(e) =>
                              onUpdateHomeStatus(home.homeId, e.target.value)
                            }
                          >
                            <option value="Connected">Connected</option>
                            <option value="Live">Live</option>
                            <option value="BWIP">BWIP</option>
                            <option value="Unserviceable">Unserviceable</option>
                            <option value="Live not ready for service">
                              Live not ready for service
                            </option>
                          </select>
                        </div>
                      ) : null}

                      {onToggleHomeDistance ? (
                        <label className="distance-toggle-row">
                          <input
                            type="checkbox"
                            checked={home.showDistance ?? false}
                            onChange={(e) =>
                              onToggleHomeDistance(
                                home.homeId,
                                e.target.checked,
                              )
                            }
                          />
                          Show drop distance
                        </label>
                      ) : null}

                      {onMoveHomeToDp && availableMoveTargets.length > 0 ? (
                        <div className="move-home-row">
                          <select
                            value={selectedTarget}
                            onChange={(e) =>
                              setMoveTargetsByHomeId((prev) => ({
                                ...prev,
                                [home.homeId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Move to AFN/CBT...</option>
                            {availableMoveTargets.map((dp) => (
                              <option key={dp.id} value={dp.id}>
                                {dp.name || dp.id}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={!selectedTarget}
                            onClick={() => {
                              onMoveHomeToDp(
                                home.homeId,
                                currentDpId || home.dpId,
                                selectedTarget,
                              );
                              setMoveTargetsByHomeId((prev) => ({
                                ...prev,
                                [home.homeId]: "",
                              }));
                            }}
                          >
                            Move
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
          ) : null}
        </div>

        <label>Power Readings</label>
        <div style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2, 3].map((i) => (
            <input
              key={i}
              style={{ width: 60 }}
              value={details.powerReadings?.[i] || ""}
              onChange={(e) => updateReading(i, e.target.value)}
            />
          ))}
        </div>

        <label>Image</label>
        <input
          type="file"
          accept="image/*"
          disabled={saving}
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            setSelectedImage(file);
          }}
        />

        {previewImage ? (
          <div className="dp-preview-card">
            <img
              src={previewImage}
              alt="Distribution point"
              className="dp-preview-img"
            />
            <button
              type="button"
              className="remove-btn"
              disabled={saving}
              onClick={() => {
                setSelectedImage(null);
                update("image", "");
              }}
            >
              Remove Image
            </button>
          </div>
        ) : null}

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button onClick={handleSave} disabled={saving}>
            {saving ? "Uploading..." : "Save"}
          </button>
          <button onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>

      <style>{styles}</style>
    </>
  );
}

const styles = `
.modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 20000;
}
.modal {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: #1f2937;
  padding: 20px;
  border-radius: 10px;
  width: 420px;
  max-width: 92vw;
  max-height: 88vh;
  overflow-y: auto;
  color: white;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 20001;
  box-shadow: 0 20px 50px rgba(0,0,0,0.45);
}
input, select {
  padding: 6px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #111;
  color: white;
}
.dp-capacity-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.dp-capacity-grid div {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 10px;
  text-align: center;
}
.dp-capacity-grid strong {
  display: block;
  font-size: 1.35rem;
}
.dp-capacity-grid span {
  display: block;
  color: #cbd5e1;
  font-size: 0.8rem;
}
.connected-homes-dropdown {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  overflow: hidden;
}
.connected-homes-summary {
  width: 100%;
  background: #111827;
  border: 0;
  color: #f8fafc;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  font-weight: 700;
}
.connected-homes-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.connected-empty {
  color: #94a3b8;
  font-size: 0.9rem;
  padding: 8px;
}
.connected-home-card {
  background: #111827;
  border: 1px solid #263449;
  border-radius: 8px;
  padding: 10px;
}
.connected-home-card-header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.connected-home-card-header strong,
.connected-home-card-header span {
  display: block;
}
.connected-home-card-header span {
  color: #cbd5e1;
  font-size: 0.86rem;
  margin-top: 2px;
}
.connected-home-card-header em {
  font-style: normal;
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 0.75rem;
  white-space: nowrap;
}
.connected-home-card-header em.live {
  background: #14532d;
  color: #bbf7d0;
}
.connected-home-card-header em.planned {
  background: #78350f;
  color: #fde68a;
}
.connected-home-control-row,
.move-home-row {
  display: grid;
  grid-template-columns: 78px 1fr;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}
.move-home-row {
  grid-template-columns: 1fr auto;
}
.move-home-row button {
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 6px;
  padding: 7px 10px;
  cursor: pointer;
}
.move-home-row button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.distance-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  color: #cbd5e1;
  font-size: 0.9rem;
}
.distance-toggle-row input {
  width: auto;
}

.parent-sb-reservation {
  background: #071422;
  border: 1px solid #2563eb;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.sb-route-builder {
  background: #06111f;
  border: 1px solid #38bdf8;
  border-radius: 10px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.sb-route-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.sb-route-builder label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  color: #cbd5e1;
  font-size: 0.82rem;
  font-weight: 800;
}
.sb-route-apply {
  background: #2563eb;
  color: white;
  border: 0;
  border-radius: 8px;
  padding: 9px 10px;
  cursor: pointer;
  font-weight: 900;
}
.sb-route-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sb-route-item {
  background: #020617;
  border: 1px solid #1e40af;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.sb-route-item span {
  color: #bfdbfe;
  font-size: 0.78rem;
}
.parent-sb-title {
  color: #93c5fd;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.72rem;
  font-weight: 900;
}
.parent-sb-path {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #f8fafc;
}
.parent-sb-path span {
  color: #60a5fa;
  font-weight: 900;
}
.parent-sb-fibres {
  color: #22c55e;
  font-size: 1rem;
  font-weight: 900;
}
.parent-sb-map {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.parent-sb-map span {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 999px;
  padding: 4px 8px;
  color: #bfdbfe;
  font-size: 0.8rem;
  font-weight: 800;
}
.parent-sb-note {
  color: #94a3b8;
  font-size: 0.78rem;
  line-height: 1.35;
}

.afn-panel {
  background: #0f172a;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.afn-panel strong {
  color: #f8fafc;
}
.afn-panel span,
.afn-summary {
  color: #cbd5e1;
  font-size: 0.86rem;
}

.afn-readonly-fibres {
  background: #020617;
  border: 1px solid #334155;
  border-radius: 8px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.afn-readonly-fibre-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}
.afn-readonly-fibre-list span {
  background: #0f172a;
  color: #bfdbfe;
  border: 1px solid #2563eb;
  border-radius: 6px;
  padding: 6px 8px;
  text-align: center;
  font-weight: 800;
}

.afn-fibre-buttons {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}
.afn-grid-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #cbd5e1;
  font-size: 0.86rem;
}
.afn-grid-header em {
  font-style: normal;
  color: #93c5fd;
}
.afn-fibre {
  background: #374151;
  color: white;
  border: 1px solid #4b5563;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.afn-fibre.selected {
  background: #16a34a;
  border-color: #22c55e;
}
.afn-fibre.disabled,
.afn-fibre:disabled {
  background: #1f2937;
  color: #6b7280;
  border-color: #374151;
  cursor: not-allowed;
  opacity: 0.85;
}

.dp-preview-card {
  background: #111827;
  border: 1px solid #374151;
  border-radius: 8px;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}
.dp-preview-img {
  width: 100%;
  height: 180px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.remove-btn {
  background: #dc2626;
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  align-self: flex-start;
}
`;
