import type { AppUserProfile, UserRole } from "../context/UserRoleContext";

export const UNRESTRICTED_AREA_ACCESS = "*";

export function normaliseUserRole(value: unknown): UserRole {
  if (
    value === "admin" ||
    value === "super_user" ||
    value === "maintenance_user" ||
    value === "build_user" ||
    value === "survey_user" ||
    value === "client_admin" ||
    value === "client_viewer"
  ) {
    return value;
  }

  return "survey_user";
}

export function normaliseAllowedAreas(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;

  const cleaned = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return Array.from(new Set(cleaned));
}

export function normaliseAllowedAreasForRole(
  role: UserRole,
  value: unknown,
  fallback: string[] = [],
): string[] {
  if (role === "admin") return [UNRESTRICTED_AREA_ACCESS];
  return normaliseAllowedAreas(value, fallback).filter((area) => area !== UNRESTRICTED_AREA_ACCESS);
}

export function hasUnrestrictedAreaAccess(
  profile: Pick<AppUserProfile, "role" | "allowedAreas"> | null | undefined,
): boolean {
  return (
    profile?.role === "admin" ||
    profile?.allowedAreas?.some((area) => String(area).trim() === UNRESTRICTED_AREA_ACCESS) === true
  );
}

export function canAccessArea(
  profile: Pick<AppUserProfile, "role" | "allowedAreas"> | null | undefined,
  areaNames: Array<string | null | undefined>,
): boolean {
  if (hasUnrestrictedAreaAccess(profile)) return true;

  const allowed = new Set(
    normaliseAllowedAreas(profile?.allowedAreas, []).map((item) => item.toLowerCase().trim()),
  );

  if (allowed.size === 0) return false;

  return areaNames.some((name) => {
    const clean = String(name || "").toLowerCase().trim();
    return clean ? allowed.has(clean) : false;
  });
}
