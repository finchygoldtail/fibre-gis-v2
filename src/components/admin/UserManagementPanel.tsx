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
import { db } from "../../firebase";
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
  "super_user",
  "maintenance_user",
  "build_user",
  "survey_user",
];

export default function UserManagementPanel({ visible, onClose }: Props) {
  const { isSuperUser } = useUserRole();

  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newUid, setNewUid] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("survey_user");

  const loadUsers = async () => {
    setIsLoading(true);

    try {
      const usersRef = collection(db, "businesses", BUSINESS_ID, "users");
      const snapshot = await getDocs(query(usersRef, orderBy("email", "asc")));

      setUsers(
        snapshot.docs.map((item) => {
          const data = item.data();
          const role = normaliseRole(data.role);

          return {
            uid: item.id,
            name: data.name || data.email || item.id,
            email: data.email || "",
            role,
            permissions: {
              ...ROLE_PERMISSIONS[role],
              ...(data.permissions || {}),
            },
          };
        }),
      );
    } catch (err) {
      console.error("Failed to load users", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!visible || !isSuperUser) return;
    void loadUsers();
  }, [visible, isSuperUser]);

  if (!visible) return null;

  const saveUserRole = async (
    uid: string,
    patch: {
      name?: string;
      email?: string;
      role: UserRole;
    },
  ) => {
    const permissions = ROLE_PERMISSIONS[patch.role];

    await setDoc(
      doc(db, "businesses", BUSINESS_ID, "users", uid),
      {
        uid,
        name: patch.name || "",
        email: patch.email || "",
        role: patch.role,
        permissions,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    await loadUsers();
  };

  const handleCreateOrUpdateUser = async () => {
    if (!newUid.trim()) {
      alert("Add the user's Firebase UID.");
      return;
    }

    await saveUserRole(newUid.trim(), {
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
    });

    setNewUid("");
    setNewName("");
    setNewEmail("");
    setNewRole("survey_user");
  };

  if (!isSuperUser) {
    return (
      <section style={panelStyle}>
        <div style={headerStyle}>
          <div>
            <h3 style={titleStyle}>No access</h3>
            <div style={mutedStyle}>Only Super Users can manage users.</div>
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
        <h4 style={sectionTitleStyle}>Add / Update User</h4>

        <label style={labelStyle}>Firebase UID</label>
        <input
          value={newUid}
          onChange={(event) => setNewUid(event.target.value)}
          placeholder="Paste UID"
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
          style={primaryButtonStyle}
        >
          Save User Permissions
        </button>
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
                    })
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
