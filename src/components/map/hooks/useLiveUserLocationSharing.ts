import { useEffect, useMemo, useRef, useState } from "react";
import type { AppUserProfile } from "../../../context/UserRoleContext";
import {
  clearLiveUserLocation,
  subscribeToLiveUserLocations,
  upsertLiveUserLocation,
  type LiveUserLocation,
} from "../../../services/liveUserLocationService";

const WRITE_INTERVAL_MS = 30_000;
const STALE_AFTER_MS = 10 * 60_000;
const MIN_MOVE_METERS = 20;
const SESSION_STORAGE_KEY = "alistra-live-location-session-id";

type LatLng = { lat: number; lng: number };

type LastWrite = LatLng & {
  at: number;
};

function createSessionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 12);
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLiveLocationSessionId(): string {
  if (typeof window === "undefined") return createSessionId();

  try {
    const existing = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = createSessionId();
    window.localStorage.setItem(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return createSessionId();
  }
}

function getDeviceLabel(): string {
  if (typeof navigator === "undefined") return "Device";
  const ua = navigator.userAgent || "";
  if (/iPhone|Android.+Mobile|Mobile/i.test(ua)) return "Phone";
  if (/iPad|Tablet|Android/i.test(ua)) return "Tablet";
  return "Laptop";
}

function distanceMeters(a: LatLng, b: LatLng): number {
  const radius = 6371000;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function useLiveUserLocationSharing(args: {
  profile: AppUserProfile | null;
  activeProjectId?: string | null;
  activeProjectName?: string | null;
  subscribeEnabled?: boolean;
}) {
  const {
    profile,
    activeProjectId = null,
    activeProjectName = null,
    subscribeEnabled = false,
  } = args;
  const [sharingEnabled, setSharingEnabled] = useState(false);
  const [shareError, setShareError] = useState("");
  const [liveUsers, setLiveUsers] = useState<LiveUserLocation[]>([]);
  const lastWriteRef = useRef<LastWrite | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const sessionIdRef = useRef(getLiveLocationSessionId());

  const businessId = profile?.businessId || "fibre-gis-v2";
  const uid = profile?.uid || "";

  useEffect(() => {
    if (!subscribeEnabled && !sharingEnabled) {
      setLiveUsers([]);
      return;
    }
    if (!businessId) return;
    return subscribeToLiveUserLocations(
      businessId,
      setLiveUsers,
      () => setLiveUsers([]),
    );
  }, [businessId, sharingEnabled, subscribeEnabled]);

  useEffect(() => {
    if (!sharingEnabled || !profile) return;

    if (!navigator.geolocation) {
      setShareError("GPS is not available in this browser.");
      setSharingEnabled(false);
      return;
    }

    setShareError("");
    const locationOptions: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 5000,
    };

    const writePosition = (position: GeolocationPosition) => {
      const now = Date.now();
      const next = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      const last = lastWriteRef.current;

      if (
        last &&
        now - last.at < WRITE_INTERVAL_MS &&
        distanceMeters(last, next) < MIN_MOVE_METERS
      ) {
        return;
      }

      lastWriteRef.current = { ...next, at: now };
      const updatedAt = new Date(now).toISOString();
      const expiresAt = new Date(now + STALE_AFTER_MS).toISOString();

      setShareError("");
      void upsertLiveUserLocation({
        uid: profile.uid,
        sessionId: sessionIdRef.current,
        deviceLabel: getDeviceLabel(),
        displayName: profile.name || profile.email || "Alistra User",
        email: profile.email,
        role: profile.role,
        businessId,
        activeProjectId,
        activeProjectName,
        lat: next.lat,
        lng: next.lng,
        accuracy: Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null,
        heading: Number.isFinite(position.coords.heading || NaN)
          ? position.coords.heading
          : null,
        speed: Number.isFinite(position.coords.speed || NaN)
          ? position.coords.speed
          : null,
        updatedAt,
        expiresAt,
        sharing: true,
      }).catch((error) => {
        console.info("Failed to share live user location", error);
        setShareError("Could not share location. Check connection or Firebase permissions.");
      });
    };

    const handleError = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        setShareError("Location permission is blocked. Allow location access for this site.");
        setSharingEnabled(false);
        return;
      }

      setShareError(
        error.code === error.TIMEOUT
          ? "Still trying to get GPS. Move near a window or check location services."
          : "Could not get GPS yet. Check device location services.",
      );
    };

    navigator.geolocation.getCurrentPosition(
      writePosition,
      handleError,
      locationOptions,
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      writePosition,
      handleError,
      locationOptions,
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [activeProjectId, activeProjectName, businessId, profile, sharingEnabled]);

  useEffect(() => {
    if (sharingEnabled || !uid) return;
    lastWriteRef.current = null;
    void clearLiveUserLocation(businessId, `${uid}-${sessionIdRef.current}`).catch((error) => {
      console.info("Failed to clear live user location", error);
    });
  }, [businessId, sharingEnabled, uid]);

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (uid) {
        void clearLiveUserLocation(businessId, `${uid}-${sessionIdRef.current}`);
      }
    };
  }, [businessId, uid]);

  const recentLiveUsers = useMemo(() => {
    const now = Date.now();
    return liveUsers.filter((user) => {
      const expiresAt = new Date(user.expiresAt).getTime();
      return Number.isFinite(expiresAt) && expiresAt > now;
    });
  }, [liveUsers]);

  return {
    sharingEnabled,
    setSharingEnabled,
    shareError,
    liveUsers: recentLiveUsers,
  };
}
