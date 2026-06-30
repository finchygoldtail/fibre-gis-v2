import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../firebase";
import {
  canAccessArea,
  hasUnrestrictedAreaAccess,
  normaliseAllowedAreasForRole,
  normaliseUserRole,
} from "../utils/areaPermissions";

export type UserRole =
  | "admin"
  | "super_user"
  | "maintenance_user"
  | "build_user"
  | "survey_user";

export type UserPermissions = {
  survey: boolean;
  build: boolean;
  maintenance: boolean;
  manageUsers: boolean;
};

export type AppUserProfile = {
  uid: string;
  name: string;
  email: string;
  role: UserRole;
  permissions: UserPermissions;
  /**
   * Area access is stored as project area names/codes, for example BD-BAS-AG1.
   * ["*"] means unrestricted access.
   */
  allowedAreas: string[];
};

type UserRoleContextValue = {
  profile: AppUserProfile | null;
  isLoadingProfile: boolean;
  permissions: UserPermissions;
  isAdmin: boolean;
  isSuperUser: boolean;
  isMaintenanceUser: boolean;
  isBuildUser: boolean;
  isSurveyUser: boolean;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  super_user: "Super User",
  maintenance_user: "Maintenance User",
  build_user: "Build User",
  survey_user: "Survey User",
};

export const ROLE_PERMISSIONS: Record<UserRole, UserPermissions> = {
  admin: {
    survey: true,
    build: true,
    maintenance: true,
    manageUsers: true,
  },

  super_user: {
    survey: true,
    build: true,
    maintenance: true,
    manageUsers: false,
  },

  maintenance_user: {
    survey: false,
    build: false,
    maintenance: true,
    manageUsers: false,
  },

  build_user: {
    survey: true,
    build: true,
    maintenance: false,
    manageUsers: false,
  },

  survey_user: {
    survey: true,
    build: false,
    maintenance: false,
    manageUsers: false,
  },
};

const ROLE_BY_EMAIL: Record<string, UserRole> = {
  "alistairlgrantham@gmail.com": "super_user",
  "benedict.almond@brsk.co.uk": "super_user",
  "adam.whittaker@brsk.co.uk": "super_user",
  "james.oliver@brsk.co.uk": "super_user",
  "alistair.grantham@brsk.co.uk": "super_user",
  "ben.almond@brsk.co.uk": "super_user",
};

const LOCKED_DOWN_PERMISSIONS: UserPermissions = {
  survey: false,
  build: false,
  maintenance: false,
  manageUsers: false,
};

const UserRoleContext = createContext<UserRoleContextValue | null>(null);


export { canAccessArea, hasUnrestrictedAreaAccess };

function normalisePermissions(
  role: UserRole,
  value: unknown,
): UserPermissions {
  const fallback = ROLE_PERMISSIONS[role];

  if (!value || typeof value !== "object") {
    return fallback;
  }

  const record = value as Partial<Record<keyof UserPermissions, unknown>>;

  return {
    survey:
      typeof record.survey === "boolean"
        ? record.survey
        : fallback.survey,
    build:
      typeof record.build === "boolean"
        ? record.build
        : fallback.build,
    maintenance:
      typeof record.maintenance === "boolean"
        ? record.maintenance
        : fallback.maintenance,
    manageUsers:
      typeof record.manageUsers === "boolean"
        ? record.manageUsers
        : fallback.manageUsers,
  };
}

function buildFallbackProfileFromUser(user: User): AppUserProfile {
  const email = user.email?.toLowerCase() || "";
  const knownRole = ROLE_BY_EMAIL[email];

  if (knownRole) {
    return {
      uid: user.uid,
      name: user.displayName || user.email || "User",
      email,
      role: knownRole,
      permissions: ROLE_PERMISSIONS[knownRole],
      allowedAreas: ["*"],
    };
  }

  return {
    uid: user.uid,
    name: user.displayName || user.email || "User",
    email,
    role: "survey_user",
    permissions: LOCKED_DOWN_PERMISSIONS,
    allowedAreas: [],
  };
}

async function loadFirestoreProfile(user: User): Promise<AppUserProfile> {
  const fallbackProfile = buildFallbackProfileFromUser(user);

  const profileRefs = [
    doc(db, "businesses", "fibre-gis-v2", "users", user.uid),
    doc(db, "users", user.uid),
  ];

  for (const profileRef of profileRefs) {
    const snapshot = await getDoc(profileRef);

    if (!snapshot.exists()) continue;

    const data = snapshot.data();
    const role = normaliseUserRole(data.role);
    const permissions = normalisePermissions(role, data.permissions);

    return {
      uid: user.uid,
      name:
        typeof data.name === "string" && data.name.trim()
          ? data.name
          : fallbackProfile.name,
      email:
        typeof data.email === "string" && data.email.trim()
          ? data.email.toLowerCase()
          : fallbackProfile.email,
      role,
      permissions,
      allowedAreas: normaliseAllowedAreasForRole(role, data.allowedAreas, []),
    };
  }

  return fallbackProfile;
}

export function UserRoleProvider({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setProfile(null);
      setIsLoadingProfile(false);
      return;
    }

    setIsLoadingProfile(true);

    loadFirestoreProfile(user)
      .then((loadedProfile) => {
        if (!cancelled) {
          setProfile(loadedProfile);
        }
      })
      .catch((error) => {
        console.error("Failed to load user role profile", error);

        if (!cancelled) {
          setProfile(buildFallbackProfileFromUser(user));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProfile(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  const permissions = profile?.permissions ?? LOCKED_DOWN_PERMISSIONS;

  const value = useMemo(
    () => ({
      profile,
      isLoadingProfile,
      permissions,
      isAdmin: profile?.role === "admin",
      isSuperUser: profile?.role === "super_user",
      isMaintenanceUser: profile?.role === "maintenance_user",
      isBuildUser: profile?.role === "build_user",
      isSurveyUser: profile?.role === "survey_user",
    }),
    [profile, isLoadingProfile, permissions],
  );

  return (
    <UserRoleContext.Provider value={value}>
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const ctx = useContext(UserRoleContext);

  if (!ctx) {
    throw new Error("useUserRole must be used inside UserRoleProvider");
  }

  return ctx;
}
