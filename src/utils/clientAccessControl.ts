import type { AppUserProfile } from "../context/UserRoleContext";
import { normaliseAllowedAreas } from "./areaPermissions";

export type InfrastructureSector =
  | "telecoms"
  | "gas"
  | "water"
  | "power"
  | "maps";

export const DEFAULT_BUSINESS_ID = "fibre-gis-v2";
export const DEFAULT_SECTOR: InfrastructureSector = "telecoms";
export const UNRESTRICTED_CLIENT_ACCESS = "*";

export function normaliseBusinessId(value: unknown): string {
  const clean = String(value || "").trim().toLowerCase();
  return clean || DEFAULT_BUSINESS_ID;
}

export function normaliseSector(value: unknown): InfrastructureSector {
  if (
    value === "gas" ||
    value === "water" ||
    value === "power" ||
    value === "maps"
  ) {
    return value;
  }

  return DEFAULT_SECTOR;
}

export function normaliseAllowedSectors(
  value: unknown,
  fallback: string[] = [],
): string[] {
  const allowed = normaliseAllowedAreas(value, fallback)
    .map((item) =>
      item === UNRESTRICTED_CLIENT_ACCESS
        ? item
        : normaliseSector(item),
    );

  return Array.from(new Set(allowed));
}

export function hasUnrestrictedClientAccess(
  profile:
    | Pick<AppUserProfile, "role" | "allowedSectors">
    | null
    | undefined,
): boolean {
  return (
    profile?.role === "admin" ||
    profile?.allowedSectors?.some(
      (sector) => sector === UNRESTRICTED_CLIENT_ACCESS,
    ) === true
  );
}

export function canAccessBusiness(
  profile: Pick<AppUserProfile, "role" | "businessId"> | null | undefined,
  businessId: string | null | undefined,
): boolean {
  if (profile?.role === "admin") return true;

  return (
    normaliseBusinessId(profile?.businessId) === normaliseBusinessId(businessId)
  );
}

export function canAccessSector(
  profile:
    | Pick<AppUserProfile, "role" | "allowedSectors">
    | null
    | undefined,
  sector: string | null | undefined,
): boolean {
  if (hasUnrestrictedClientAccess(profile)) {
    return true;
  }

  const requestedSector = normaliseSector(sector);
  const allowed = new Set(normaliseAllowedSectors(profile?.allowedSectors, []));

  return allowed.has(requestedSector);
}

export function canAccessClientInfrastructure(
  profile:
    | Pick<
        AppUserProfile,
        "role" | "businessId" | "allowedAreas" | "allowedSectors"
      >
    | null
    | undefined,
  target: {
    businessId?: string | null;
    sector?: string | null;
    areaNames?: Array<string | null | undefined>;
  },
): boolean {
  if (!canAccessBusiness(profile, target.businessId)) return false;
  if (!canAccessSector(profile, target.sector)) return false;

  if (!target.areaNames || target.areaNames.length === 0) {
    return true;
  }

  const allowedAreas = new Set(
    normaliseAllowedAreas(profile?.allowedAreas, []).map((area) =>
      area.toLowerCase().trim(),
    ),
  );

  if (profile?.role === "admin" || allowedAreas.has(UNRESTRICTED_CLIENT_ACCESS)) {
    return true;
  }

  return target.areaNames.some((areaName) => {
    const clean = String(areaName || "").toLowerCase().trim();
    return clean ? allowedAreas.has(clean) : false;
  });
}
