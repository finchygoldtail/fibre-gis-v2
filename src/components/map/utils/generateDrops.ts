import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db, auth } from "../../../firebase";

const MAX_OH_DROP_DISTANCE_METERS = 65;
const DEFAULT_DP_CAPACITY = 32;

type LatLng = { lat: number; lng: number };

function getLatLng(asset: any): LatLng | null {
  if (typeof asset?.lat === "number" && typeof asset?.lng === "number") {
    return { lat: asset.lat, lng: asset.lng };
  }

  if (
    asset?.geometry?.type === "Point" &&
    Array.isArray(asset.geometry.coordinates) &&
    asset.geometry.coordinates.length >= 2
  ) {
    return {
      lat: Number(asset.geometry.coordinates[0]),
      lng: Number(asset.geometry.coordinates[1]),
    };
  }

  return null;
}

function getDistanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (v: number) => (v * Math.PI) / 180;
  const R = 6371000;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);

  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function getDpCapacity(dp: any): number {
  const raw =
    dp?.dpDetails?.connectionsToHomes ??
    dp?.connectionsToHomes ??
    dp?.capacity ??
    DEFAULT_DP_CAPACITY;

  const capacity = Number(raw);
  return Number.isFinite(capacity) && capacity > 0
    ? Math.floor(capacity)
    : DEFAULT_DP_CAPACITY;
}

function isDropCable(asset: any): boolean {
  return (
    asset?.assetType === "cable" &&
    String(asset?.cableType || "").toLowerCase() === "drop"
  );
}

function homeAlreadyConnectedToAnyDp(home: any, existingAssets: any[]): boolean {
  return existingAssets.some(
    (asset) =>
      isDropCable(asset) &&
      (asset.toAssetId === home.id || asset.fromAssetId === home.id)
  );
}

function countExistingDropsFromDp(dp: any, existingAssets: any[]): number {
  return existingAssets.filter(
    (asset) =>
      isDropCable(asset) &&
      (asset.fromAssetId === dp.id || asset.toAssetId === dp.id)
  ).length;
}

export function createDropCableRecordsFromDP(
  dp: any,
  homes: any[],
  existingAssets: any[] = []
) {
  if (dp?.assetType !== "distribution-point") {
    return [];
  }

  const dpPoint = getLatLng(dp);
  if (!dpPoint) return [];

  const capacity = getDpCapacity(dp);
  const used = countExistingDropsFromDp(dp, existingAssets);
  const available = Math.max(0, capacity - used);

  if (available <= 0) return [];

  const candidates = homes
    .filter((home) => home?.assetType === "home")
    .filter((home) => !homeAlreadyConnectedToAnyDp(home, existingAssets))
    .map((home) => {
      const homePoint = getLatLng(home);
      if (!homePoint) return null;
      const distance = getDistanceMeters(dpPoint, homePoint);
      return { home, homePoint, distance };
    })
    .filter(Boolean) as Array<{ home: any; homePoint: LatLng; distance: number }>;

  return candidates
    .filter((candidate) => candidate.distance <= MAX_OH_DROP_DISTANCE_METERS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, available)
    .map((candidate, index) => ({
      id: crypto.randomUUID(),
      name: `${dp.name || "DP"} Drop ${used + index + 1}`,
      assetType: "cable",
      jointType: "Cable",
      notes: `Auto drop from ${dp.name || dp.id} to ${candidate.home.name || candidate.home.id}`,
      cableType: "Drop",
      fibreCount: "1F",
      installMethod: "OH",
      fromAssetId: dp.id,
      toAssetId: candidate.home.id,
      lengthMeters: candidate.distance,
      geometry: {
        type: "LineString",
        coordinates: [
          [dpPoint.lat, dpPoint.lng],
          [candidate.homePoint.lat, candidate.homePoint.lng],
        ],
      },
    }));
}


export function createDropCableRecordsFromDPs(
  dps: any[],
  homes: any[],
  existingAssets: any[] = []
) {
  const validDps = dps
    .filter((dp) => dp?.assetType === "distribution-point")
    .map((dp) => {
      const point = getLatLng(dp);
      if (!point) return null;

      const capacity = getDpCapacity(dp);
      const used = countExistingDropsFromDp(dp, existingAssets);
      const available = Math.max(0, capacity - used);

      return { dp, point, available, used };
    })
    .filter(Boolean) as Array<{
      dp: any;
      point: LatLng;
      available: number;
      used: number;
    }>;

  if (validDps.length === 0) return [];

  const availableByDpId = new Map<string, number>();
  const usedByDpId = new Map<string, number>();

  validDps.forEach(({ dp, available, used }) => {
    availableByDpId.set(String(dp.id), available);
    usedByDpId.set(String(dp.id), used);
  });

  const candidates: Array<{
    dp: any;
    home: any;
    dpPoint: LatLng;
    homePoint: LatLng;
    distance: number;
  }> = [];

  homes
    .filter((home) => home?.assetType === "home")
    .filter((home) => !homeAlreadyConnectedToAnyDp(home, existingAssets))
    .forEach((home) => {
      const homePoint = getLatLng(home);
      if (!homePoint) return;

      validDps.forEach(({ dp, point: dpPoint, available }) => {
        if (available <= 0) return;

        const distance = getDistanceMeters(dpPoint, homePoint);
        if (distance > MAX_OH_DROP_DISTANCE_METERS) return;

        candidates.push({ dp, home, dpPoint, homePoint, distance });
      });
    });

  candidates.sort((a, b) => a.distance - b.distance);

  const assignedHomeIds = new Set<string>();
  const drops: any[] = [];

  for (const candidate of candidates) {
    const dpId = String(candidate.dp.id);
    const homeId = String(candidate.home.id);
    const available = availableByDpId.get(dpId) ?? 0;

    if (available <= 0) continue;
    if (assignedHomeIds.has(homeId)) continue;

    const currentUsed = usedByDpId.get(dpId) ?? 0;
    const nextPort = currentUsed + 1;

    assignedHomeIds.add(homeId);
    availableByDpId.set(dpId, available - 1);
    usedByDpId.set(dpId, currentUsed + 1);

    drops.push({
      id: crypto.randomUUID(),
      name: `${candidate.dp.name || "DP"} Drop ${nextPort}`,
      assetType: "cable",
      jointType: "Cable",
      notes: `Auto drop from ${candidate.dp.name || candidate.dp.id} to ${candidate.home.name || candidate.home.id}`,
      cableType: "Drop",
      fibreCount: "1F",
      installMethod: "OH",
      fromAssetId: candidate.dp.id,
      toAssetId: candidate.home.id,
      lengthMeters: candidate.distance,
      geometry: {
        type: "LineString",
        coordinates: [
          [candidate.dpPoint.lat, candidate.dpPoint.lng],
          [candidate.homePoint.lat, candidate.homePoint.lng],
        ],
      },
    });
  }

  return drops;
}

export async function generateDropsFromDP(dp: any, homes: any[], existingAssets: any[] = []) {
  const dropRecords = createDropCableRecordsFromDP(dp, homes, existingAssets);

  for (const drop of dropRecords) {
    await addDoc(collection(db, "projects/main-network/cables"), {
      ...drop,
      // IMPORTANT: Firestore cannot store nested arrays. Keep this stringified.
      geometry: {
        ...drop.geometry,
        coordinates: JSON.stringify(drop.geometry.coordinates),
      },
      createdBy: auth.currentUser?.uid,
      createdByEmail: auth.currentUser?.email,
      createdAt: serverTimestamp(),
    });
  }

  return {
    created: dropRecords.length,
    skipped: homes.length - dropRecords.length,
    drops: dropRecords,
  };
}
