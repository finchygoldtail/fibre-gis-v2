import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { signOut } from "firebase/auth";
import { collection, getDocs } from "firebase/firestore";
import { auth, db } from "../firebase";
import { useThemeMode } from "../context/ThemeContext";
import { ROLE_LABELS, useUserRole } from "../context/UserRoleContext";
import UserManagementPanel from "./admin/UserManagementPanel";
import { DEFAULT_BUSINESS_ID, normaliseBusinessId } from "../utils/clientAccessControl";

type Props = {
  variant?: "topbar" | "sidebar";
};

export default function UserMenu({ variant = "topbar" }: Props) {
  const {
    profile,
    isLoadingProfile,
    activeBusinessId,
    setActiveBusinessId,
    permissions,
  } = useUserRole();
  const [open, setOpen] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [businessOptions, setBusinessOptions] = useState<string[]>([]);
  const [customBusinessId, setCustomBusinessId] = useState("");
  const { themeMode, setThemeMode } = useThemeMode();

  const displayName = profile?.name || profile?.email || "User";
  const roleLabel = profile ? ROLE_LABELS[profile.role] : "Loading role";
  const canManageUsers = profile?.role === "admin";
  const canSwitchBusiness =
    profile?.role === "admin" || permissions.manageUsers === true;
  const businessChoices = useMemo(
    () =>
      Array.from(
        new Set([
          DEFAULT_BUSINESS_ID,
          profile?.businessId || "",
          activeBusinessId,
          ...businessOptions,
        ].map(normaliseBusinessId).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [activeBusinessId, businessOptions, profile?.businessId],
  );

  useEffect(() => {
    if (!canSwitchBusiness) return;

    let cancelled = false;

    const loadBusinessOptions = async () => {
      const ids = new Set<string>([DEFAULT_BUSINESS_ID, activeBusinessId]);

      try {
        const usersSnapshot = await getDocs(collection(db, "users"));
        usersSnapshot.docs.forEach((item) => {
          const businessId = normaliseBusinessId(item.data().businessId);
          if (businessId) ids.add(businessId);
        });
      } catch (error) {
        console.warn("Could not load user business ids", error);
      }

      try {
        const businessesSnapshot = await getDocs(collection(db, "businesses"));
        businessesSnapshot.docs.forEach((item) => {
          ids.add(normaliseBusinessId(item.id));
        });
      } catch (error) {
        console.warn("Could not load businesses", error);
      }

      if (!cancelled) {
        setBusinessOptions(Array.from(ids));
      }
    };

    void loadBusinessOptions();

    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, canSwitchBusiness]);

  const userManagementPanel =
    typeof document !== "undefined"
      ? createPortal(
          <UserManagementPanel
            visible={showUserManagement}
            onClose={() => setShowUserManagement(false)}
          />,
          document.body,
        )
      : null;

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

        {canSwitchBusiness && (
          <BusinessSwitcher
            activeBusinessId={activeBusinessId}
            businessChoices={businessChoices}
            customBusinessId={customBusinessId}
            setCustomBusinessId={setCustomBusinessId}
            onSwitch={setActiveBusinessId}
            compact={false}
          />
        )}

        <ThemeSwitcher themeMode={themeMode} onChange={setThemeMode} />

        {canManageUsers && (
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

        {userManagementPanel}
      </div>
    );
  }

  return (
    <>
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          title={`${displayName} · ${roleLabel}`}
          style={topbarAccountButtonStyle}
        >
          <span style={topbarAvatarStyle}>{getInitials(displayName)}</span>
          <span style={topbarAccountTextStyle}>Account</span>
          <span aria-hidden="true">▾</span>
        </button>

        {open && (
          <div
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 8px)",
              width: 260,
              maxWidth: "calc(100vw - 24px)",
              boxSizing: "border-box",
              background: "var(--app-elevated)",
              color: "var(--app-text)",
              border: "1px solid var(--app-border)",
              borderRadius: 12,
              padding: 12,
              zIndex: 9999,
              boxShadow: "var(--app-shadow)",
            }}
          >
            <div style={{ fontWeight: 900 }}>{displayName}</div>
            <div style={{ color: "var(--app-muted)", fontSize: 12, marginTop: 4 }}>
              {profile?.email}
            </div>

            <div style={roleBoxStyle}>
              <div style={{ fontSize: 12, color: "var(--app-muted)" }}>Role</div>
              <div style={{ fontWeight: 800 }}>
                {isLoadingProfile ? "Loading..." : roleLabel}
              </div>
            </div>

            {canSwitchBusiness && (
              <BusinessSwitcher
                activeBusinessId={activeBusinessId}
                businessChoices={businessChoices}
                customBusinessId={customBusinessId}
                setCustomBusinessId={setCustomBusinessId}
                onSwitch={setActiveBusinessId}
                compact
              />
            )}

            <ThemeSwitcher themeMode={themeMode} onChange={setThemeMode} />

            {canManageUsers && (
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

      {userManagementPanel}
    </>
  );
}

function ThemeSwitcher({
  themeMode,
  onChange,
}: {
  themeMode: "light" | "dark";
  onChange: (mode: "light" | "dark") => void;
}) {
  return (
    <div style={businessSwitcherStyle}>
      <label style={businessSwitcherLabelStyle}>Appearance</label>
      <select
        value={themeMode}
        onChange={(event) => onChange(event.target.value as "light" | "dark")}
        style={businessSelectStyle}
      >
        <option value="light">Light mode</option>
        <option value="dark">Dark mode</option>
      </select>
    </div>
  );
}

function BusinessSwitcher({
  activeBusinessId,
  businessChoices,
  customBusinessId,
  setCustomBusinessId,
  onSwitch,
  compact,
}: {
  activeBusinessId: string;
  businessChoices: string[];
  customBusinessId: string;
  setCustomBusinessId: (value: string) => void;
  onSwitch: (businessId: string) => void;
  compact: boolean;
}) {
  const applyCustomBusiness = () => {
    const clean = normaliseBusinessId(customBusinessId);
    if (!clean) return;
    onSwitch(clean);
    setCustomBusinessId("");
  };

  return (
    <div style={businessSwitcherStyle}>
      <label style={businessSwitcherLabelStyle}>Active company</label>
      <select
        value={activeBusinessId}
        onChange={(event) => onSwitch(event.target.value)}
        style={businessSelectStyle}
      >
        {businessChoices.map((businessId) => (
          <option key={businessId} value={businessId}>
            {businessId}
          </option>
        ))}
      </select>

      <div style={businessCustomRowStyle(compact)}>
        <input
          value={customBusinessId}
          onChange={(event) => setCustomBusinessId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              applyCustomBusiness();
            }
          }}
          placeholder="harrellicomms"
          style={businessCustomInputStyle}
        />
        <button
          type="button"
          onClick={applyCustomBusiness}
          style={businessApplyButtonStyle}
        >
          Switch
        </button>
      </div>
    </div>
  );
}

function getInitials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "U";
  const second = parts.length > 1 ? parts[1]?.[0] : "";
  return `${first}${second}`.toUpperCase();
}

const topbarAccountButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "var(--app-panel)",
  color: "var(--app-heading)",
  border: "1px solid var(--app-border)",
  borderRadius: 999,
  padding: "6px 10px 6px 6px",
  cursor: "pointer",
  fontWeight: 900,
  whiteSpace: "nowrap",
  boxShadow: "0 2px 8px rgba(0,0,0,0.22)",
};

const topbarAvatarStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 999,
  background: "#22c55e",
  color: "#052e16",
  fontSize: 12,
  fontWeight: 900,
};

const topbarAccountTextStyle: React.CSSProperties = {
  fontSize: 13,
};

const sidebarShellStyle: React.CSSProperties = {
  marginTop: 12,
  marginBottom: 12,
  background: "var(--app-surface-muted)",
  border: "1px solid var(--app-border)",
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
  color: "var(--app-heading)",
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
  color: "var(--app-muted)",
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
  background: "var(--app-surface)",
  border: "1px solid var(--app-border)",
};

const businessSwitcherStyle: React.CSSProperties = {
  marginTop: 10,
  padding: 10,
  borderRadius: 10,
  background: "var(--app-surface-muted)",
  border: "1px solid var(--app-border)",
};

const businessSwitcherLabelStyle: React.CSSProperties = {
  display: "block",
  color: "var(--app-primary)",
  fontSize: 11,
  fontWeight: 900,
  marginBottom: 6,
};

const businessSelectStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text)",
  borderRadius: 9,
  padding: "8px 9px",
  fontWeight: 800,
};

const businessCustomRowStyle = (compact: boolean): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: compact ? "minmax(0, 1fr) 72px" : "minmax(0, 1fr) 80px",
  gap: 6,
  marginTop: 8,
});

const businessCustomInputStyle: React.CSSProperties = {
  minWidth: 0,
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text)",
  borderRadius: 9,
  padding: "8px 9px",
  fontWeight: 800,
};

const businessApplyButtonStyle: React.CSSProperties = {
  border: "1px solid #2563eb",
  background: "#1d4ed8",
  color: "white",
  borderRadius: 9,
  padding: "8px 9px",
  cursor: "pointer",
  fontWeight: 900,
};

const sidebarButtonStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  marginTop: 10,
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text)",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 900,
  textAlign: "left",
};

const menuButtonStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  display: "block",
  marginTop: 10,
  border: "1px solid var(--app-border)",
  background: "var(--app-surface)",
  color: "var(--app-text)",
  borderRadius: 10,
  padding: "10px 12px",
  cursor: "pointer",
  fontWeight: 800,
  textAlign: "left",
};
