import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  orderBy,
  query,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import { loadMapAssetsFromFirestore } from "../../services/mapAssetStorage";
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AppUserProfile,
  type UserRole,
  useUserRole,
} from "../../context/UserRoleContext";
import {
  hasUnrestrictedAreaAccess,
  normaliseAllowedAreas,
  normaliseAllowedAreasForRole,
  normaliseUserRole,
} from "../../utils/areaPermissions";
import {
  DEFAULT_BUSINESS_ID,
  DEFAULT_SECTOR,
  normaliseAllowedSectors,
  normaliseBusinessId,
  normaliseSector,
} from "../../utils/clientAccessControl";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type AreaOption = {
  key: string;
  label: string;
};

const BUSINESS_ID = DEFAULT_BUSINESS_ID;

const roleOptions: UserRole[] = [
  "admin",
  "super_user",
  "maintenance_user",
  "build_user",
  "survey_user",
  "client_admin",
  "client_viewer",
];

export default function UserManagementPanel({ visible, onClose }: Props) {
  const { profile } = useUserRole();
  const canManageUsers = profile?.permissions.manageUsers === true;

  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [areaOptions, setAreaOptions] = useState<AreaOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("survey_user");
  const [openAreaUserUid, setOpenAreaUserUid] = useState<string | null>(null);
  const [areaSearch, setAreaSearch] = useState("");
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 720 : false,
  );

  const loadUsers = async () => {
    setIsLoading(true);

    try {
      const profileDocs = new Map<string, AppUserProfile>();

      const readUserCollection = async (pathName: "business" | "root") => {
        const usersRef =
          pathName === "business"
            ? collection(db, "businesses", BUSINESS_ID, "users")
            : collection(db, "users");

        const snapshot = await getDocs(
          query(usersRef, orderBy("email", "asc")),
        );

        snapshot.docs.forEach((item) => {
          const data = item.data();
          const role = normaliseUserRole(data.role);
          const allowedAreas = normaliseAllowedAreasForRole(role, data.allowedAreas, []);

          profileDocs.set(item.id, {
            uid: item.id,
            name: data.name || data.email || item.id,
            email: data.email || "",
            role,
            permissions: {
              ...ROLE_PERMISSIONS[role],
              ...(data.permissions || {}),
            },
            businessId: normaliseBusinessId(data.businessId),
            sector: normaliseSector(data.sector),
            allowedSectors: normaliseAllowedSectors(data.allowedSectors, [
              DEFAULT_SECTOR,
            ]),
            allowedAreas,
          });
        });
      };

      try {
        await readUserCollection("business");
      } catch (err) {
        console.warn("Could not load business user profiles", err);
      }

      setUsers(
        Array.from(profileDocs.values()).sort((a, b) =>
          (a.email || a.name || a.uid).localeCompare(
            b.email || b.name || b.uid,
          ),
        ),
      );
    } catch (err) {
      console.error("Failed to load users", err);
      setSaveError(
        "Could not load users. Check Firestore rules in the console.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const loadAreaOptions = async () => {
    setIsLoadingAreas(true);

    try {
      const assets = await loadMapAssetsFromFirestore();
      const optionsByKey = new Map<string, AreaOption>();

      assets.forEach((asset: any) => {
        if (!isProjectAreaAsset(asset)) return;

        const label = getAreaLabel(asset);
        if (!label) return;

        optionsByKey.set(label.toLowerCase(), {
          key: label,
          label,
        });
      });

      setAreaOptions(
        Array.from(optionsByKey.values()).sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { numeric: true }),
        ),
      );
    } catch (err) {
      console.error("Failed to load project areas for user permissions", err);
      setSaveError(
        "Could not load area list. Check map asset read permissions.",
      );
    } finally {
      setIsLoadingAreas(false);
    }
  };

  useEffect(() => {
    if (!visible || !canManageUsers) return;
    void loadUsers();
    void loadAreaOptions();
  }, [visible, canManageUsers]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => setIsNarrowViewport(window.innerWidth <= 720);
    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  const filteredAreaOptions = useMemo(() => {
    const term = areaSearch.trim().toLowerCase();
    if (!term) return areaOptions;

    return areaOptions.filter((area) =>
      area.label.toLowerCase().includes(term),
    );
  }, [areaOptions, areaSearch]);

  if (!visible) return null;

  const saveUserRole = async (
    uid: string,
    patch: {
      name?: string;
      email?: string;
      role: UserRole;
      businessId?: string;
      sector?: string;
      allowedSectors?: string[];
      allowedAreas?: string[];
    },
  ) => {
    if (!canManageUsers) {
      setSaveError("Only Administrators can change user roles.");
      alert("Only Administrators can change user roles.");
      return;
    }

    const cleanUid = uid.trim();
    const cleanEmail = (patch.email || "").trim().toLowerCase();
    const permissions = ROLE_PERMISSIONS[patch.role];
    const allowedAreas = normaliseAllowedAreasForRole(patch.role, patch.allowedAreas, []);
    const payload = {
      uid: cleanUid,
      name: (patch.name || "").trim(),
      email: cleanEmail,
      role: patch.role,
      permissions,
      businessId: normaliseBusinessId(patch.businessId),
      sector: normaliseSector(patch.sector),
      allowedSectors:
        patch.role === "admin"
          ? ["*"]
          : normaliseAllowedSectors(patch.allowedSectors, [DEFAULT_SECTOR]),
      allowedAreas,
    };

    setIsSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const updateLoginUserProfile = httpsCallable<
        typeof payload,
        { success: boolean; uid: string }
      >(functions, "updateLoginUserProfile");

      await updateLoginUserProfile(payload);

      setSaveMessage(`Saved permissions for ${cleanEmail || cleanUid}.`);
      await loadUsers();
    } catch (err) {
      console.error("Failed to save user permissions", err);
      setSaveError(
        "Save failed. Open the browser console for the Firebase error, and check your Firestore rules allow Administrators to write user profiles.",
      );
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const saveAreaAccess = async (
    user: AppUserProfile,
    nextAllowedAreas: string[],
  ) => {
    await saveUserRole(user.uid, {
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId,
      sector: user.sector,
      allowedSectors: user.allowedSectors,
      allowedAreas: user.role === "admin" ? ["*"] : nextAllowedAreas,
    }).catch(() => undefined);
  };

  const handleToggleArea = (user: AppUserProfile, areaKey: string) => {
    const current = normaliseAllowedAreas(user.allowedAreas, []);
    const withoutUnrestricted = current.filter((item) => item !== "*");
    const exists = withoutUnrestricted.some(
      (item) => item.toLowerCase() === areaKey.toLowerCase(),
    );
    const next = exists
      ? withoutUnrestricted.filter(
          (item) => item.toLowerCase() !== areaKey.toLowerCase(),
        )
      : [...withoutUnrestricted, areaKey];

    void saveAreaAccess(user, next);
  };

  const handleSetAllAreas = (user: AppUserProfile) => {
    void saveAreaAccess(
      user,
      areaOptions.map((area) => area.key),
    );
  };

  const handleClearAreas = (user: AppUserProfile) => {
    void saveAreaAccess(user, []);
  };

  const handleCreateOrUpdateUser = async () => {
    const uid = newUid.trim();
    const cleanName = newName.trim();
    const cleanEmail = newEmail.trim().toLowerCase();
    const cleanPassword = newPassword.trim();

    setSaveMessage("");
    setSaveError("");

    if (!canManageUsers) {
      setSaveError("Only Administrators can create or update login users.");
      alert("Only Administrators can create or update login users.");
      return;
    }

    try {
      if (uid) {
        await saveUserRole(uid, {
          name: cleanName,
          email: cleanEmail,
          role: newRole,
          businessId: BUSINESS_ID,
          sector: DEFAULT_SECTOR,
          allowedSectors: newRole === "admin" ? ["*"] : [DEFAULT_SECTOR],
          allowedAreas: newRole === "admin" ? ["*"] : [],
        });
      } else {
        if (!cleanName || !cleanEmail || !cleanPassword) {
          alert("Add name, email and a temporary password.");
          return;
        }

        if (cleanPassword.length < 6) {
          alert("Temporary password must be at least 6 characters.");
          return;
        }

        setIsSaving(true);

        const createLoginUser = httpsCallable<
          {
            businessId: string;
            name: string;
            email: string;
            password: string;
            role: UserRole;
            sector: string;
            allowedSectors: string[];
          },
          { success: boolean; uid: string }
        >(functions, "createLoginUser");

        const result = await createLoginUser({
          businessId: BUSINESS_ID,
          name: cleanName,
          email: cleanEmail,
          password: cleanPassword,
          role: newRole,
          sector: DEFAULT_SECTOR,
          allowedSectors: newRole === "admin" ? ["*"] : [DEFAULT_SECTOR],
        });

        if (result.data.uid && newRole === "admin") {
          await saveUserRole(result.data.uid, {
            name: cleanName,
            email: cleanEmail,
            role: newRole,
            businessId: BUSINESS_ID,
            sector: DEFAULT_SECTOR,
            allowedSectors: ["*"],
            allowedAreas: ["*"],
          });
        }

        setSaveMessage(`Created login for ${cleanEmail}.`);
        await loadUsers();
      }

      setNewUid("");
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("survey_user");
    } catch (err) {
      console.error("Failed to create/update login user", err);
      setSaveError(
        "User create/update failed. Check the browser console and Cloud Function logs.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!canManageUsers) {
    return (
      <section style={getPanelStyle(isNarrowViewport)}>
        <div style={headerStyle}>
          <div>
            <h3 style={titleStyle}>No access</h3>
            <div style={mutedStyle}>Only Administrators can manage users.</div>
          </div>
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            Close
          </button>
        </div>
      </section>
    );
  }

  return (
    <div style={backdropStyle}>
      <section style={getPanelStyle(isNarrowViewport)}>
        <div style={headerStyle}>
          <div>
            <h3 style={titleStyle}>Manage Users</h3>
            <div style={mutedStyle}>
              Add users and assign operational access.
            </div>
          </div>

          <button type="button" onClick={onClose} style={smallButtonStyle}>
            Close
          </button>
        </div>

        <div style={getScrollBodyStyle(isNarrowViewport)}>
          <div style={getCardStyle(isNarrowViewport)}>
            <h4 style={sectionTitleStyle}>Create Login / Update User</h4>

            <label style={labelStyle}>
              Firebase UID optional - only use this to update an existing Auth
              user
            </label>
            <input
              value={newUid}
              onChange={(event) => setNewUid(event.target.value)}
              placeholder="Leave blank to create a new login"
              style={inputStyle}
            />

            <label style={labelStyle}>Name</label>
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Engineer name"
              style={inputStyle}
            />

            <label style={labelStyle}>Email</label>
            <input
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="engineer@example.com"
              style={inputStyle}
            />

            <label style={labelStyle}>Temporary Password</label>
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="Minimum 6 characters"
              type="password"
              style={inputStyle}
            />

            <label style={labelStyle}>Role</label>
            <select
              disabled={!canManageUsers || isSaving}
              value={newRole}
              onChange={(event) => setNewRole(event.target.value as UserRole)}
              style={inputStyle}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => void handleCreateOrUpdateUser()}
              disabled={isSaving || !canManageUsers}
              style={{
                ...primaryButtonStyle,
                opacity: isSaving || !canManageUsers ? 0.65 : 1,
                cursor: isSaving || !canManageUsers ? "not-allowed" : "pointer",
              }}
            >
              {isSaving
                ? "Saving..."
                : newUid.trim()
                  ? "Save User Permissions"
                  : "Create Login User"}
            </button>

            {saveMessage && <div style={successStyle}>{saveMessage}</div>}
            {saveError && <div style={errorStyle}>{saveError}</div>}
          </div>

          <div style={getCardStyle(isNarrowViewport)}>
            <h4 style={sectionTitleStyle}>Existing Users</h4>

            {isLoading ? (
              <div style={mutedStyle}>Loading users...</div>
            ) : users.length === 0 ? (
              <div style={mutedStyle}>No users configured yet.</div>
            ) : (
              <div style={existingUsersListStyle}>
                {users.map((user) => {
                  const areaAccessOpen = openAreaUserUid === user.uid;
                  const unrestricted = hasUnrestrictedAreaAccess(user);
                  const selectedAreaKeys = new Set(
                    normaliseAllowedAreas(user.allowedAreas, []).map((item) =>
                      item.toLowerCase(),
                    ),
                  );

                  return (
                    <div key={user.uid} style={getUserRowStyle(isNarrowViewport)}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 900 }}>{user.name}</div>
                        <div style={userMetaStyle}>
                          {user.email || "No email"}
                        </div>
                        <div style={userMetaStyle}>
                          {user.businessId} / {user.sector}
                        </div>
                        <div style={userMetaStyle}>{user.uid}</div>
                      </div>

                      <select
                        disabled={!canManageUsers || isSaving}
                        value={user.role}
                        onChange={(event) =>
                          void saveUserRole(user.uid, {
                            name: user.name,
                            email: user.email,
                            role: event.target.value as UserRole,
                            businessId: user.businessId,
                            sector: user.sector,
                            allowedSectors:
                              event.target.value === "admin"
                                ? ["*"]
                                : user.allowedSectors,
                            allowedAreas:
                              event.target.value === "admin"
                                ? ["*"]
                                : user.allowedAreas,
                          }).catch(() => undefined)
                        }
                        style={inputStyle}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </select>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenAreaUserUid(areaAccessOpen ? null : user.uid)
                        }
                        style={areaToggleButtonStyle}
                      >
                        {areaAccessOpen
                          ? "▲ Hide Area Access"
                          : "▼ Area Access"}
                        <span style={areaCountPillStyle}>
                          {unrestricted
                            ? "All"
                            : `${user.allowedAreas.length} selected`}
                        </span>
                      </button>

                      {areaAccessOpen && (
                        <div style={areaPanelStyle}>
                          {user.role === "admin" ? (
                            <div style={mutedStyle}>
                              Administrators always have access to all areas.
                            </div>
                          ) : (
                            <>
                              <input
                                value={areaSearch}
                                onChange={(event) =>
                                  setAreaSearch(event.target.value)
                                }
                                placeholder="Search areas..."
                                style={inputStyle}
                              />

                              <div style={areaActionRowStyle}>
                                <button
                                  type="button"
                                  disabled={
                                    isSaving || areaOptions.length === 0
                                  }
                                  onClick={() => handleSetAllAreas(user)}
                                  style={miniButtonStyle}
                                >
                                  Select All
                                </button>
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() => handleClearAreas(user)}
                                  style={miniButtonStyle}
                                >
                                  Clear All
                                </button>
                              </div>

                              {isLoadingAreas ? (
                                <div style={mutedStyle}>Loading areas...</div>
                              ) : filteredAreaOptions.length === 0 ? (
                                <div style={mutedStyle}>No areas found.</div>
                              ) : (
                                <div style={areaCheckboxListStyle}>
                                  {filteredAreaOptions.map((area) => (
                                    <label
                                      key={area.key}
                                      style={areaCheckboxRowStyle}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedAreaKeys.has(
                                          area.key.toLowerCase(),
                                        )}
                                        disabled={isSaving}
                                        onChange={() =>
                                          handleToggleArea(user, area.key)
                                        }
                                      />
                                      <span>{area.label}</span>
                                    </label>
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function isProjectAreaAsset(asset: any): boolean {
  const assetType = String(asset?.assetType ?? "").toLowerCase();
  const jointType = String(asset?.jointType ?? "").toLowerCase();
  const geometryType = String(
    asset?.geometryType ?? asset?.geometry?.type ?? "",
  ).toLowerCase();

  return (
    geometryType === "polygon" &&
    (assetType === "area" ||
      assetType === "polygon" ||
      assetType === "project-area" ||
      jointType.includes("polygon area"))
  );
}

function getAreaLabel(asset: any): string {
  return String(
    asset?.areaName ||
      asset?.projectAreaName ||
      asset?.name ||
      asset?.label ||
      asset?.id ||
      "",
  ).trim();
}

const backdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 20000,
  background: "rgba(2, 6, 23, 0.55)",
};

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: 76,
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(1120px, calc(100vw - 32px))",
  background: "#111827",
  color: "white",
  border: "1px solid #334155",
  borderRadius: 16,
  padding: 16,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  zIndex: 20001,
  boxShadow: "0 24px 80px rgba(0,0,0,0.65)",
  boxSizing: "border-box",
};

function getPanelStyle(isNarrowViewport: boolean): React.CSSProperties {
  if (!isNarrowViewport) return panelStyle;

  return {
    ...panelStyle,
    top: "calc(env(safe-area-inset-top, 0px) + 18px)",
    bottom: "calc(env(safe-area-inset-bottom, 0px) + 18px)",
    width: "calc(100vw - 20px)",
    padding: 12,
    borderRadius: 14,
  };
}

const scrollBodyStyle: React.CSSProperties = {
  overflow: "hidden",
  minHeight: 0,
  flex: 1,
  display: "grid",
  gridTemplateColumns: "360px minmax(0, 1fr)",
  gap: 14,
};

function getScrollBodyStyle(isNarrowViewport: boolean): React.CSSProperties {
  if (!isNarrowViewport) return scrollBodyStyle;

  return {
    ...scrollBodyStyle,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
    overflowX: "hidden",
    paddingRight: 2,
    paddingBottom: 16,
    WebkitOverflowScrolling: "touch",
  };
}

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
  flexShrink: 0,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
};

const mutedStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  marginTop: 3,
};

const cardStyle: React.CSSProperties = {
  background: "#1f2937",
  border: "1px solid #374151",
  borderRadius: 12,
  padding: 12,
  overflowY: "auto",
  overflowX: "hidden",
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

function getCardStyle(isNarrowViewport: boolean): React.CSSProperties {
  if (!isNarrowViewport) return cardStyle;

  return {
    ...cardStyle,
    overflow: "visible",
    flex: "0 0 auto",
  };
}

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
  flexShrink: 0,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  color: "#cbd5e1",
  fontSize: 11,
  fontWeight: 900,
  marginTop: 9,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #4b5563",
  background: "#0f172a",
  color: "white",
  borderRadius: 9,
  padding: "9px 10px",
  marginTop: 3,
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%",
  marginTop: 12,
  border: "none",
  background: "#2563eb",
  color: "white",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 900,
  cursor: "pointer",
};

const successStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#bbf7d0",
  background: "#14532d",
  border: "1px solid #16a34a",
  borderRadius: 9,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const errorStyle: React.CSSProperties = {
  marginTop: 10,
  color: "#fecaca",
  background: "#7f1d1d",
  border: "1px solid #dc2626",
  borderRadius: 9,
  padding: "8px 10px",
  fontSize: 12,
  fontWeight: 800,
};

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid #4b5563",
  background: "#374151",
  color: "white",
  borderRadius: 9,
  padding: "7px 10px",
  fontWeight: 900,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const existingUsersListStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
  overflowY: "auto",
  paddingRight: 8,
  minHeight: 0,
  flex: 1,
};

const userRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1fr) minmax(170px, 210px)",
  gap: 10,
  padding: 12,
  border: "1px solid #374151",
  borderRadius: 10,
  background: "#0f172a",
  alignItems: "start",
};

function getUserRowStyle(isNarrowViewport: boolean): React.CSSProperties {
  if (!isNarrowViewport) return userRowStyle;

  return {
    ...userRowStyle,
    gridTemplateColumns: "minmax(0, 1fr)",
  };
}

const userMetaStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: "100%",
};

const areaToggleButtonStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  border: "1px solid #334155",
  background: "#111827",
  color: "white",
  borderRadius: 9,
  padding: "9px 10px",
  fontWeight: 900,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const areaCountPillStyle: React.CSSProperties = {
  color: "#bfdbfe",
  background: "#1e3a8a",
  border: "1px solid #2563eb",
  borderRadius: 999,
  padding: "2px 7px",
  fontSize: 10,
  whiteSpace: "nowrap",
};

const areaPanelStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  border: "1px solid #334155",
  background: "#111827",
  borderRadius: 10,
  padding: 10,
};

const areaActionRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 8,
  marginTop: 8,
  marginBottom: 8,
};

const miniButtonStyle: React.CSSProperties = {
  border: "1px solid #4b5563",
  background: "#1f2937",
  color: "white",
  borderRadius: 8,
  padding: "7px 8px",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const areaCheckboxListStyle: React.CSSProperties = {
  maxHeight: 340,
  overflowY: "auto",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 6,
  paddingRight: 4,
};

const areaCheckboxRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  border: "1px solid #1f2937",
  background: "#0f172a",
  borderRadius: 8,
  padding: "7px 8px",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};
