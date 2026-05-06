import type { SavedMapAsset } from "../components/JointMapManager";

function safeJsonParse<T = any>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function normalizeMapAsset(
  asset: SavedMapAsset
): SavedMapAsset {
  if (!asset || typeof asset !== "object") return asset;

  // 🔥 Restore flattened geometry (CRITICAL FIX)
  const geometry =
    (asset as any).geometry ??
    ((asset as any).geometryType &&
    (asset as any).geometryCoordinatesJson
      ? {
          type: (asset as any).geometryType,
          coordinates: safeJsonParse(
            (asset as any).geometryCoordinatesJson,
            null
          ),
        }
      : undefined);

  return {
    ...asset,
    geometry,
  };
}

export function normalizeMapAssets(
  assets: SavedMapAsset[] = []
): SavedMapAsset[] {
  return assets
    .filter(Boolean)
    .map(normalizeMapAsset)
    .filter((a) => {
      if (!(a as any).geometry) return true;

      return Boolean(
        (a as any).geometry?.type &&
        (a as any).geometry?.coordinates !== null &&
        (a as any).geometry?.coordinates !== undefined
      );
    });
}