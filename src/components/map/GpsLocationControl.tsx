import React, { useEffect, useMemo, useRef, useState } from "react";
import { Circle, CircleMarker, Popup, useMap } from "react-leaflet";
import type { LatLngLiteral } from "leaflet";

const buttonBase: React.CSSProperties = {
  position: "absolute",
  right: 14,
  bottom: 24,
  zIndex: 1200,
  border: "1px solid rgba(255,255,255,0.25)",
  borderRadius: 999,
  padding: "0.65rem 0.85rem",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const statusBox: React.CSSProperties = {
  position: "absolute",
  right: 14,
  bottom: 78,
  zIndex: 1200,
  maxWidth: 260,
  background: "rgba(17,24,39,0.92)",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 10,
  padding: "0.6rem 0.75rem",
  color: "white",
  fontSize: "0.82rem",
  boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
};

type Props = {
  zoom?: number;
};

export default function GpsLocationControl({ zoom = 19 }: Props) {
  const map = useMap();
  const watchIdRef = useRef<number | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [position, setPosition] = useState<LatLngLiteral | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isSupported = useMemo(() => "geolocation" in navigator, []);

  useEffect(() => {
    if (!enabled) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!isSupported) {
      setError("GPS/location is not supported by this browser.");
      setEnabled(false);
      return;
    }

    setError(null);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (result) => {
        const nextPosition = {
          lat: result.coords.latitude,
          lng: result.coords.longitude,
        };

        setPosition(nextPosition);
        setAccuracy(result.coords.accuracy ?? null);
        setError(null);

        // Follow mode: only recenter while enabled.
        map.flyTo(nextPosition, Math.max(map.getZoom(), zoom), {
          animate: true,
          duration: 0.6,
        });
      },
      (geoError) => {
        setError(geoError.message || "Unable to get your location.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 12000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, isSupported, map, zoom]);

  const toggleGps = () => {
    setEnabled((current) => !current);
    if (enabled) {
      setError(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={toggleGps}
        style={{
          ...buttonBase,
          background: enabled ? "#16a34a" : "#111827",
        }}
        title={enabled ? "GPS follow on — click to stop following" : "GPS follow off — click to follow your location"}
      >
        <span>{enabled ? "📍" : "◎"}</span>
        <span>{enabled ? "GPS On" : "GPS"}</span>
      </button>

      {(enabled || error) && (
        <div style={statusBox}>
          {error ? (
            <div style={{ color: "#fecaca" }}>{error}</div>
          ) : position ? (
            <>
              <div style={{ fontWeight: 700 }}>Following your location</div>
              <div style={{ color: "#cbd5e1", marginTop: 2 }}>
                {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
              </div>
              {accuracy !== null ? (
                <div style={{ color: "#cbd5e1", marginTop: 2 }}>
                  Accuracy: ±{Math.round(accuracy)} m
                </div>
              ) : null}
            </>
          ) : (
            <div style={{ color: "#cbd5e1" }}>Finding your GPS location…</div>
          )}
        </div>
      )}

      {position ? (
        <>
          <CircleMarker
            center={position}
            radius={8}
            pathOptions={{
              color: "#2563eb",
              weight: 3,
              fillColor: "#60a5fa",
              fillOpacity: 0.95,
            }}
          >
            <Popup>
              <b>Your location</b>
              <br />
              {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
              {accuracy !== null ? (
                <>
                  <br />
                  Accuracy: ±{Math.round(accuracy)} m
                </>
              ) : null}
            </Popup>
          </CircleMarker>

          {accuracy !== null ? (
            <Circle
              center={position}
              radius={accuracy}
              pathOptions={{
                color: "#2563eb",
                weight: 1,
                fillColor: "#60a5fa",
                fillOpacity: 0.12,
              }}
            />
          ) : null}
        </>
      ) : null}
    </>
  );
}
