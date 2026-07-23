import type {
  AssetType,
  DistributionPointDetails,
  PoleDetails,
  SavedMapAsset,
} from "../types";
import type { ChamberDetails } from "../modals/ChamberDetailsModal";

export type AssetDetailPatch = {
  poleDetails?: PoleDetails;
  dpDetails?: DistributionPointDetails;
  chamberDetails?: ChamberDetails;
  status?: string;
  buildStatus?: string;
  properties?: Record<string, any>;
};

export function normaliseDpOperationalStatus(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Planned";

  const lower = raw.toLowerCase();
  if (lower === "live") return "Live";
  if (lower === "bwip") return "BWIP";
  if (lower === "unserviceable") return "Unserviceable";
  if (lower === "live not ready for service" || lower === "lnrfs") {
    return "Live not ready for service";
  }
  if (lower === "planned") return "Planned";
  return raw;
}

export function getDpOperationalStatus(
  asset: any,
  fallback: string = "Planned",
): string {
  return normaliseDpOperationalStatus(
    asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      fallback,
  );
}

export function syncDpOperationalStatusOnAsset<T extends Record<string, any>>(
  asset: T,
  statusValue?: unknown,
): T {
  const nextStatus = normaliseDpOperationalStatus(
    statusValue ||
      asset?.dpDetails?.buildStatus ||
      asset?.properties?.dpDetails?.buildStatus ||
      asset?.buildStatus ||
      asset?.status ||
      "Planned",
  );

  const nextDpDetails = {
    ...(asset?.dpDetails || asset?.properties?.dpDetails || {}),
    buildStatus: nextStatus,
  };

  return {
    ...(asset as any),
    status: nextStatus,
    buildStatus: nextStatus,
    dpDetails: nextDpDetails,
    properties: {
      ...((asset as any).properties || {}),
      status: nextStatus,
      buildStatus: nextStatus,
      dpDetails: {
        ...(((asset as any).properties || {}).dpDetails || {}),
        ...nextDpDetails,
        buildStatus: nextStatus,
      },
    },
  } as T;
}

export function getPointJointType(assetType: AssetType, fallbackJointType: string): string {
  if (assetType === "street-cab") return "Street Cab";
  if (assetType === "data-centre") return "Data Centre";
  if (assetType === "pole") return "Pole";
  if (assetType === "distribution-point") return "Distribution Point";
  if (assetType === "chamber") return "Chamber";
  if (assetType === "home") return "Home";
  return fallbackJointType;
}

export function getAssetDetailPatch(args: {
  assetType: AssetType;
  existingAsset?: SavedMapAsset | null;
  poleDetails?: PoleDetails;
  dpDetails?: DistributionPointDetails;
  chamberDetails?: ChamberDetails;
}): AssetDetailPatch {
  const { assetType, existingAsset, poleDetails, dpDetails, chamberDetails } = args;

  if (assetType === "pole") {
    return { poleDetails };
  }

  if (assetType === "chamber") {
    return { chamberDetails };
  }

  if (assetType !== "distribution-point") {
    return {};
  }

  const buildStatus = getDpOperationalStatus({ ...(existingAsset as any), dpDetails });
  const nextDpDetails = {
    ...(dpDetails || {}),
    buildStatus,
  } as DistributionPointDetails;

  return {
    status: buildStatus,
    buildStatus,
    dpDetails: nextDpDetails,
    properties: {
      ...((existingAsset as any)?.properties || {}),
      status: buildStatus,
      buildStatus,
      dpDetails: {
        ...(((existingAsset as any)?.properties || {}).dpDetails || {}),
        ...nextDpDetails,
        buildStatus,
      },
    },
  };
}
