import React, { useMemo } from "react";
import L from "leaflet";
import { Marker, Popup } from "react-leaflet";
import type { LiveUserLocation } from "../../../services/liveUserLocationService";
import { ROLE_LABELS, type UserRole } from "../../../context/UserRoleContext";

type Props = {
  users: LiveUserLocation[];
  currentUid?: string;
};

function initials(name: string): string {
  const parts = String(name || "User").trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || "U"}${parts[1]?.[0] || ""}`.toUpperCase();
}

function roleLabel(role: string): string {
  return ROLE_LABELS[role as UserRole] || role.replace(/_/g, " ") || "User";
}

function formatLastSeen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createUserIcon(user: LiveUserLocation, isCurrentUser: boolean) {
  const border = isCurrentUser ? "#22c55e" : "#38bdf8";
  const background = isCurrentUser ? "#dcfce7" : "#dbeafe";
  const color = isCurrentUser ? "#14532d" : "#1e3a8a";

  return L.divIcon({
    className: "",
    html: `
      <div style="
        width: 34px;
        height: 34px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: ${background};
        color: ${color};
        border: 3px solid ${border};
        font-weight: 950;
        font-size: 12px;
        box-shadow: 0 10px 22px rgba(15,23,42,0.35), 0 0 0 5px rgba(56,189,248,0.16);
      ">${initials(user.displayName)}</div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -18],
  });
}

export default function LiveUsersLayer({ users, currentUid }: Props) {
  const markers = useMemo(
    () =>
      users
        .filter((user) => Number.isFinite(user.lat) && Number.isFinite(user.lng))
        .map((user) => ({
          user,
          isCurrentUser: Boolean(currentUid && user.uid === currentUid),
          icon: createUserIcon(user, Boolean(currentUid && user.uid === currentUid)),
        })),
    [currentUid, users],
  );

  return (
    <>
      {markers.map(({ user, isCurrentUser, icon }) => (
        <Marker
          key={user.uid}
          position={[user.lat, user.lng]}
          icon={icon}
          zIndexOffset={isCurrentUser ? 1200 : 1100}
        >
          <Popup minWidth={220}>
            <div style={{ color: "#0f172a", display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 14 }}>{user.displayName}</strong>
              {user.deviceLabel ? (
                <div>
                  <strong>Device:</strong> {user.deviceLabel}
                </div>
              ) : null}
              <div>{roleLabel(user.role)}</div>
              {user.activeProjectName ? (
                <div>
                  <strong>Area:</strong> {user.activeProjectName}
                </div>
              ) : null}
              <div>
                <strong>Last seen:</strong> {formatLastSeen(user.updatedAt)}
              </div>
              {typeof user.accuracy === "number" ? (
                <div>
                  <strong>Accuracy:</strong> {Math.round(user.accuracy)}m
                </div>
              ) : null}
              {isCurrentUser ? (
                <div style={{ color: "#15803d", fontWeight: 900 }}>
                  Your shared location
                </div>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  );
}
