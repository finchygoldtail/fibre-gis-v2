import { auth } from "../../../firebase";
import type { SavedMapAsset } from "../types";

export function markAssetForLiveSync(
  asset: SavedMapAsset,
  isNew: boolean = false,
): SavedMapAsset {
  const user = auth.currentUser;
  const now = new Date().toISOString();

  const currentMetadata = ((asset as any).metadata || {}) as Record<string, unknown>;
  const userEmail = user?.email || "unknown";
  const userUid = user?.uid || "unknown";

  return {
    ...(asset as any),
    ...(isNew
      ? {
          createdAt: (asset as any).createdAt || now,
          createdByUid: (asset as any).createdByUid || userUid,
          createdByEmail: (asset as any).createdByEmail || userEmail,
        }
      : {}),
    updatedAt: now,
    updatedByUid: userUid,
    updatedByEmail: userEmail,
    lastEditedAt: now,
    lastEditedByUid: userUid,
    lastEditedByEmail: userEmail,
    metadata: {
      ...currentMetadata,
      ...(isNew
        ? {
            createdAt: currentMetadata.createdAt || now,
            createdBy: currentMetadata.createdBy || userEmail,
            createdByUid: currentMetadata.createdByUid || userUid,
          }
        : {}),
      lastEditedAt: now,
      lastEditedBy: userEmail,
      lastEditedByUid: userUid,
    },
    syncRevision: now,
  } as SavedMapAsset;
}
