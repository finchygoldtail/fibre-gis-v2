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
import { spatialApiConfig } from "./spatialApi/spatialApiConfig";
import {
  deleteSpatialRecord,
  listSpatialRecords,
  saveSpatialRecord,
} from "./spatialApi/spatialRecordService";

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
const LIVE_LOCATION_RECORD = "live-user-location";

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
  if (spatialApiConfig.postgisOnly) {
    await saveSpatialRecord(
      LIVE_LOCATION_RECORD,
      cleanPathPart(location.uid, "unknown-user"),
      location as unknown as Record<string, unknown>,
      {
        parentType: "business",
        parentId: cleanPathPart(location.businessId, "fibre-gis-v2"),
      },
    );
    return;
  }

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
  if (spatialApiConfig.postgisOnly) {
    await deleteSpatialRecord(LIVE_LOCATION_RECORD, cleanPathPart(uid, "unknown-user")).catch(
      (error) => {
        console.warn("Could not clear PostGIS live location", error);
      },
    );
    return;
  }

  await deleteDoc(liveLocationDoc(businessId, uid));
}

export function subscribeToLiveUserLocations(
  businessId: string,
  onChange: (locations: LiveUserLocation[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  if (spatialApiConfig.postgisOnly) {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      try {
        const records = await listSpatialRecords<LiveUserLocationWrite>(LIVE_LOCATION_RECORD, {
          parentType: "business",
          parentId: cleanPathPart(businessId, "fibre-gis-v2"),
          limit: 500,
        });
        if (cancelled) return;
        onChange(filterLiveLocations(records.map((record) => ({
          id: record.recordId,
          ...record.data,
        }))));
      } catch (error) {
        console.warn("PostGIS live user location polling failed", error);
        onError?.(error);
      } finally {
        if (!cancelled) timer = setTimeout(load, 10000);
      }
    };

    load();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }

  return onSnapshot(
    query(liveLocationsCollection(businessId)),
    (snapshot) => {
      onChange(filterLiveLocations(snapshot.docs.map((item) => ({ id: item.id, ...(item.data() as any) }))));
    },
    (error) => {
      console.warn("Live user location subscription failed", error);
      onError?.(error);
    },
  );
}

function filterLiveLocations(items: any[]): LiveUserLocation[] {
  const now = Date.now();
  return items
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
