import React, {
  createContext,
  useContext,
  useMemo,
} from "react";

import type { User } from "firebase/auth";

export type UserRole =
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
};

type UserRoleContextValue = {
  profile: AppUserProfile | null;
  isLoadingProfile: boolean;
  permissions: UserPermissions;
  isSuperUser: boolean;
};

export const ROLE_LABELS: Record<
  UserRole,
  string
> = {
  super_user: "Super User",
  maintenance_user: "Maintenance User",
  build_user: "Build User",
  survey_user: "Survey User",
};

export const ROLE_PERMISSIONS: Record<
  UserRole,
  UserPermissions
> = {
  super_user: {
    survey: true,
    build: true,
    maintenance: true,
    manageUsers: true,
  },

  maintenance_user: {
    survey: true,
    build: true,
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

const ROLE_BY_EMAIL: Record<
  string,
  UserRole
> = {
  "alistairlgrantham@gmail.com":
    "super_user",

  "benedict.almond@brsk.co.uk":
    "super_user",

  "adam.whittaker@brsk.co.uk":
    "super_user",

  "james.oliver@brsk.co.uk":
    "super_user",

  "alistair.grantham@brsk.co.uk":
    "super_user",

  "ben.almond@brsk.co.uk":
    "super_user",
};

const LOCKED_DOWN_PERMISSIONS: UserPermissions =
  {
    survey: true,
    build: false,
    maintenance: false,
    manageUsers: false,
  };

const UserRoleContext =
  createContext<UserRoleContextValue | null>(
    null,
  );

function buildProfileFromUser(
  user: User,
): AppUserProfile {
  const email =
    user.email?.toLowerCase() || "";

  const role =
    ROLE_BY_EMAIL[email] ||
    "survey_user";

  return {
    uid: user.uid,

    name:
      user.displayName ||
      user.email ||
      "User",

    email,

    role,

    permissions:
      ROLE_PERMISSIONS[role],
  };
}

export function UserRoleProvider({
  user,
  children,
}: {
  user: User | null;
  children: React.ReactNode;
}) {
  const profile = user
    ? buildProfileFromUser(user)
    : null;

  const permissions =
    profile?.permissions ??
    LOCKED_DOWN_PERMISSIONS;

  const value = useMemo(
    () => ({
      profile,

      isLoadingProfile: false,

      permissions,

      isSuperUser:
        !!permissions.manageUsers,
    }),

    [profile, permissions],
  );

  return (
    <UserRoleContext.Provider
      value={value}
    >
      {children}
    </UserRoleContext.Provider>
  );
}

export function useUserRole() {
  const ctx = useContext(
    UserRoleContext,
  );

  if (!ctx) {
    throw new Error(
      "useUserRole must be used inside UserRoleProvider",
    );
  }

  return ctx;
}