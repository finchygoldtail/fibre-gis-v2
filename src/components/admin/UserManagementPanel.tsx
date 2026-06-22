import React, { useEffect, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../firebase";
import {
  ROLE_LABELS,
  ROLE_PERMISSIONS,
  type AppUserProfile,
  type UserRole,
  useUserRole,
} from "../../context/UserRoleContext";

type Props = {
  visible: boolean;
  onClose: () => void;
};

const BUSINESS_ID = "fibre-gis-v2";

const roleOptions: UserRole[] = [
  "admin",
  "super_user",
  "maintenance_user",
  "build_user",
  "survey_user",
];

export default function UserManagementPanel({ visible, onClose }: Props) {
  const { isSuperUser, isAdmin } = useUserRole();

  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("survey_user");

  const loadUsers = async () => {
    setIsLoading(true);

    try {
      const profileDocs = new Map<string, AppUserProfile>();

      const readUserCollection = async (pathName: "business" | "root") => {
        const usersRef =
          pathName === "business"
            ? collection(db, "businesses", BUSINESS_ID, "users")
            : collection(db, "users");

        const snapshot = await getDocs(query(usersRef, orderBy("email", "asc")));

        snapshot.docs.forEach((item) => {
          const data = item.data();
          const role = normaliseRole(data.role);

          profileDocs.set(item.id, {
            uid: item.id,
            name: data.name || data.email || item.id,
            email: data.email || "",
            role,
            permissions: {
              ...ROLE_PERMISSIONS[role],
              ...(data.permissions || {}),
            },
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
          (a.email || a.name || a.uid).localeCompare(b.email || b.name || b.uid),
        ),
      );
    } catch (err) {
      console.error("Failed to load users", err);
      setSaveError("Could not load users. Check Firestore rules in the console.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !(isSuperUser || isAdmin)) return;
    void loadUsers();
  }, [visible, isSuperUser, isAdmin]);

  if (!visible) return null;

  const saveUserRole = async (
    uid: string,
    patch: {
      name?: string;
      email?: string;
      role: UserRole;
    },
  ) => {
    const cleanUid = uid.trim();
    const cleanEmail = (patch.email || "").trim().toLowerCase();
    const permissions = ROLE_PERMISSIONS[patch.role];
    const payload = {
      uid: cleanUid,
      name: (patch.name || "").trim(),
      email: cleanEmail,
      role: patch.role,
      permissions,
      updatedAt: serverTimestamp(),
    };

    setIsSaving(true);
    setSaveMessage("");
    setSaveError("");

    try {
      const writes = await Promise.allSettled([
        setDoc(doc(db, "businesses", BUSINESS_ID, "users", cleanUid), payload, {
          merge: true,
        }),
        setDoc(doc(db, "users", cleanUid), payload, { merge: true }),
      ]);

      const successfulWrites = writes.filter((item) => item.status === "fulfilled");

      if (successfulWrites.length === 0) {
        const firstError = writes.find(
          (item): item is PromiseRejectedResult => item.status === "rejected",
        );
        throw firstError?.reason || new Error("No Firestore writes succeeded");
      }

      if (writes.some((item) => item.status === "rejected")) {
        console.warn("One user-profile path could not be written", writes);
      }

      setSaveMessage(`Saved permissions for ${cleanEmail || cleanUid}.`);
      await loadUsers();
    } catch (err) {
      console.error("Failed to save user permissions", err);
      setSaveError(
        "Save failed. Open the browser console for the Firebase error, and check your Firestore rules allow Super Users to write user profiles.",
      );
      throw err;
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateOrUpdateUser = async () => {
    const uid = newUid.trim();
    const cleanName = newName.trim();
    const cleanEmail = newEmail.trim().toLowerCase();
    const cleanPassword = newPassword.trim();

    setSaveMessage("");
    setSaveError("");

    try {
      if (uid) {
        await saveUserRole(uid, {
          name: cleanName,
          email: cleanEmail,
          role: newRole,
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
          },
          { success: boolean; uid: string }
        >(functions, "createLoginUser");

        const result = await createLoginUser({
          businessId: BUSINESS_ID,
          name: cleanName,
          email: cleanEmail,
          password: cleanPassword,
          role: newRole,
        });

        const createdUid = result.data.uid;

        // The callable Cloud Function already creates/updates both:
        // businesses/{businessId}/users/{uid}
        // users/{uid}
        // Do not immediately write the same profile again from the browser,
        // because Firestore rules may block client-side admin writes after a reset.
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


  if (!(isSuperUser || isAdmin)) {
    return (
      <section style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <h3 style={titleStyle}>No access</h3>
            <div style={mutedStyle}>Only Administrators or Super Users can manage users.</div>
          </div>
          <button type="button" onClick={onClose} style={smallButtonStyle}>
            Close
          </button>
        </div>
      </section>
    );
  }

  return (
    <section style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>Manage Users</h3>
          <div style={mutedStyle}>Add users and assign operational access.</div>
        </div>

        <button type="button" onClick={onClose} style={smallButtonStyle}>
          Close
        </button>
      </div>

      <div style={cardStyle}>
        <h4 style={sectionTitleStyle}>Create Login / Update User</h4>

        <label style={labelStyle}>Firebase UID optional - only use this to update an existing Auth user</label>
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
          disabled={isSaving}
          style={{
            ...primaryButtonStyle,
            opacity: isSaving ? 0.65 : 1,
            cursor: isSaving ? "not-allowed" : "pointer",
          }}
        >
          {isSaving ? "Saving..." : newUid.trim() ? "Save User Permissions" : "Create Login User"}
        </button>

        {saveMessage && <div style={successStyle}>{saveMessage}</div>}
        {saveError && <div style={errorStyle}>{saveError}</div>}
      </div>

      <div style={cardStyle}>
        <h4 style={sectionTitleStyle}>Existing Users</h4>

        {isLoading ? (
          <div style={mutedStyle}>Loading users...</div>
        ) : users.length === 0 ? (
          <div style={mutedStyle}>No users configured yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {users.map((user) => (
              <div key={user.uid} style={userRowStyle}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>{user.name}</div>
                  <div style={userMetaStyle}>{user.email || "No email"}</div>
                  <div style={userMetaStyle}>{user.uid}</div>
                </div>

                <select
                  value={user.role}
                  onChange={(event) =>
                    void saveUserRole(user.uid, {
                      name: user.name,
                      email: user.email,
                      role: event.target.value as UserRole,
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
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function normaliseRole(value: unknown): UserRole {
  if (
    value === "admin" ||
    value === "super_user" ||
    value === "maintenance_user" ||
    value === "build_user" ||
    value === "survey_user"
  ) {
    return value;
  }

  return "survey_user";
}

const panelStyle: React.CSSProperties = {
  marginTop: 12,
  background: "#111827",
  color: "white",
  border: "1px solid #334155",
  borderRadius: 12,
  padding: 12,
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  alignItems: "flex-start",
  marginBottom: 12,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 16,
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
  marginTop: 10,
};

const sectionTitleStyle: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: 14,
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

const userRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr",
  gap: 8,
  padding: 10,
  border: "1px solid #374151",
  borderRadius: 10,
  background: "#0f172a",
};

const userMetaStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};
