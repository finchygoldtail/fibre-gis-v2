import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

export type LiveUserLocation = {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  role: string;
  businessId: string;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  lat: number;
  lng: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  updatedAt: string;
  expiresAt: string;
  sharing: boolean;
};

export type LiveUserLocationWrite = Omit<LiveUserLocation, "id">;

const LIVE_LOCATION_COLLECTION = "liveUserLocations";

function cleanPathPart(value: string | null | undefined, fallback: string): string {
  return (
    String(value || fallback)
      .trim()
      .replace(/\//g, "-") || fallback
  );
}

function liveLocationsCollection(businessId: string) {
  return collection(
    db,
    "businesses",
    cleanPathPart(businessId, "fibre-gis-v2"),
    LIVE_LOCATION_COLLECTION,
  );
}

function liveLocationDoc(businessId: string, uid: string) {
  return doc(
    db,
    "businesses",
    cleanPathPart(businessId, "fibre-gis-v2"),
    LIVE_LOCATION_COLLECTION,
    cleanPathPart(uid, "unknown-user"),
  );
}

export async function upsertLiveUserLocation(
  location: LiveUserLocationWrite,
): Promise<void> {
  await setDoc(
    liveLocationDoc(location.businessId, location.uid),
    {
      ...location,
      serverUpdatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function clearLiveUserLocation(
  businessId: string,
  uid: string,
): Promise<void> {
  await deleteDoc(liveLocationDoc(businessId, uid));
}

export function subscribeToLiveUserLocations(
  businessId: string,
  onChange: (locations: LiveUserLocation[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  return onSnapshot(
    query(liveLocationsCollection(businessId)),
    (snapshot) => {
      const now = Date.now();
      const locations = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as any) }))
        .filter((item): item is LiveUserLocation => {
          const lat = Number(item.lat);
          const lng = Number(item.lng);
          const expiresAt = new Date(String(item.expiresAt || "")).getTime();
          return (
            item.sharing === true &&
            Number.isFinite(lat) &&
            Number.isFinite(lng) &&
            Number.isFinite(expiresAt) &&
            expiresAt > now
          );
        })
        .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));

      onChange(locations);
    },
    (error) => {
      console.warn("Live user location subscription failed", error);
      onError?.(error);
    },
  );
}
