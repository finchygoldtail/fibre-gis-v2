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
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase";

export type LiveUserLocation = {
  id: string;
  uid: string;
  sessionId?: string;
  deviceLabel?: string;
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
const POLL_INTERVAL_MS = 10_000;

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

function liveLocationDoc(businessId: string, locationId: string) {
  return doc(
    db,
    "businesses",
    cleanPathPart(businessId, "fibre-gis-v2"),
    LIVE_LOCATION_COLLECTION,
    cleanPathPart(locationId, "unknown-user"),
  );
}

export async function upsertLiveUserLocation(
  location: LiveUserLocationWrite,
): Promise<void> {
  try {
    await setDoc(
      liveLocationDoc(
        location.businessId,
        location.sessionId ? `${location.uid}-${location.sessionId}` : location.uid,
      ),
      {
        ...location,
        serverUpdatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn("Direct live location write failed; trying callable fallback", error);
    const upsertCallable = httpsCallable<LiveUserLocationWrite, { success: boolean }>(
      functions,
      "upsertLiveUserLocation",
    );
    await upsertCallable(location);
  }
}

export async function clearLiveUserLocation(
  businessId: string,
  locationId: string,
): Promise<void> {
  try {
    await deleteDoc(liveLocationDoc(businessId, locationId));
  } catch (error) {
    console.warn("Direct live location clear failed; trying callable fallback", error);
    const clearCallable = httpsCallable<
      { businessId: string; locationId: string },
      { success: boolean }
    >(functions, "clearLiveUserLocation");
    await clearCallable({ businessId, locationId });
  }
}

async function fetchLiveUserLocationsViaCallable(
  businessId: string,
): Promise<LiveUserLocation[]> {
  const getCallable = httpsCallable<
    { businessId: string },
    { locations: LiveUserLocation[] }
  >(functions, "getLiveUserLocations");
  const result = await getCallable({ businessId });
  return Array.isArray(result.data.locations) ? result.data.locations : [];
}

function filterLiveLocations(locations: LiveUserLocation[]): LiveUserLocation[] {
  const now = Date.now();
  return locations
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
}

export function subscribeToLiveUserLocations(
  businessId: string,
  onChange: (locations: LiveUserLocation[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  let stopped = false;
  let firestoreWorking = false;

  const pollCallable = async () => {
    try {
      const locations = await fetchLiveUserLocationsViaCallable(businessId);
      if (!stopped) onChange(filterLiveLocations(locations));
    } catch (error) {
      console.warn("Live user location callable poll failed", error);
      if (!firestoreWorking) onError?.(error);
    }
  };

  void pollCallable();
  const pollTimer = window.setInterval(pollCallable, POLL_INTERVAL_MS);

  const unsubscribeSnapshot = onSnapshot(
    query(liveLocationsCollection(businessId)),
    (snapshot) => {
      firestoreWorking = true;
      const locations = snapshot.docs
        .map((item) => ({ id: item.id, ...(item.data() as any) }))
        .filter((item): item is LiveUserLocation => Boolean(item));

      onChange(filterLiveLocations(locations));
    },
    (error) => {
      console.warn("Live user location subscription failed", error);
      firestoreWorking = false;
      void pollCallable();
    },
  );

  return () => {
    stopped = true;
    window.clearInterval(pollTimer);
    unsubscribeSnapshot();
  };
}
