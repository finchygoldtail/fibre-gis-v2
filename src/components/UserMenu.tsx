import React, { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { ROLE_LABELS, useUserRole } from "../context/UserRoleContext";
import UserManagementPanel from "./admin/UserManagementPanel";

type Props = {
  variant?: "topbar" | "sidebar";
};

export default function UserMenu({ variant = "topbar" }: Props) {
  const { profile, isLoadingProfile, isSuperUser, isAdmin } = useUserRole();
  const [open, setOpen] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);

  const displayName = profile?.name || profile?.email || "User";
  const roleLabel = profile ? ROLE_LABELS[profile.role] : "Loading role";

  if (variant === "sidebar") {
    return (
      <div style={sidebarShellStyle}>
        <div style={sidebarHeaderStyle}>
          <div style={avatarStyle}>{getInitials(displayName)}</div>
          <div style={{ minWidth: 0 }}>
            <div style={sidebarNameStyle}>{displayName}</div>
            <div style={sidebarEmailStyle}>{profile?.email || "Signed in"}</div>
          </div>
        </div>

        <div style={roleBoxStyle}>
          <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800 }}>
            Role
          </div>
          <div style={{ fontWeight: 900, marginTop: 3 }}>
            {isLoadingProfile ? "Loading..." : roleLabel}
          </div>
        </div>

        {(isSuperUser || isAdmin) && (
          <button
            type="button"
            onClick={() => setShowUserManagement((value) => !value)}
            style={sidebarButtonStyle}
          >
            {showUserManagement ? "Hide Manage Users" : "Manage Users"}
          </button>
        )}

        <button
          type="button"
          onClick={() => void signOut(auth)}
          style={{
            ...sidebarButtonStyle,
            background: "#7f1d1d",
            borderColor: "#991b1b",
          }}
        >
          Sign out
        </button>

        <UserManagementPanel
          visible={showUserManagement}
          onClose={() => setShowUserManagement(false)}
        />
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          style={{
            background: "#111827",
            color: "white",
            border: "1px solid #374151",
            borderRadius: 10,
            padding: "8px 12px",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          {displayName} ▾
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              width: 260,
              background: "#111827",
              color: "white",
              border: "1px solid #374151",
              borderRadius: 12,
              padding: 12,
              zIndex: 9999,
              boxShadow: "0 16px 36px rgba(0,0,0,0.4)",
            }}
          >
            <div style={{ fontWeight: 900 }}>{displayName}</div>
            <div style={{ color: "#9ca3af", fontSize: 12, marginTop: 4 }}>
              {profile?.email}
            </div>

            <div style={roleBoxStyle}>
              <div style={{ fontSize: 12, color: "#9ca3af" }}>Role</div>
              <div style={{ fontWeight: 800 }}>
                {isLoadingProfile ? "Loading..." : roleLabel}
              </div>
            </div>

            {(isSuperUser || isAdmin) && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setShowUserManagement(true);
                }}
                style={menuButtonStyle}
              >
                Manage Users
              </button>
            )}

            <button
              type="button"
              onClick={() => void signOut(auth)}
              style={{
                ...menuButtonStyle,
                background: "#7f1d1d",
                borderColor: "#991b1b",
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>

      <UserManagementPanel
        visible={showUserManagement}
        onClose={() => setShowUserManagement(false)}
      />
    </>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const second = parts.length > 1 ? parts[1]?.[0] : "";
  return `${first}${second}`.toUpperCase();
}

const sidebarShellStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 12,
  background: "#0f172a",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 12,
};

const sidebarHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr)",
  gap: 10,
  alignItems: "center",
};

const avatarStyle: React.CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 12,
  display: "grid",
  placeItems: "center",
  background: "#22c55e",
  color: "white",
  fontWeight: 900,
  boxShadow: "0 8px 20px rgba(34,197,94,0.25)",
};

const sidebarNameStyle: React.CSSProperties = {
  fontWeight: 900,
  color: "white",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sidebarEmailStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  marginTop: 2,
};

const roleBoxStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "#1f2937",
  border: "1px solid #374151",
};

const sidebarButtonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  border: "1px solid #374151",
  background: "#1f2937",
  color: "white",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 900,
  textAlign: "left",
};

const menuButtonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 10,
  border: "1px solid #374151",
  background: "#1f2937",
  color: "white",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 800,
  textAlign: "left",
};
