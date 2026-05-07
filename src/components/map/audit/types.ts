import type { AssetType } from "../types";

export type AssetChangeAction =
  | "created"
  | "updated"
  | "moved"
  | "deleted"
  | "repaired"
  | "tested"
  | "photo-added"
  | "otdr-added"
  | "commented";

export type AssetChangeAttachmentType = "photo" | "otdr" | "document" | "damage-photo";

export type AssetChangeAttachment = {
  id: string;
  type: AssetChangeAttachmentType;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  dataUrl?: string;
  uploadedAt: string;
};

export type AssetChangeLog = {
  id: string;
  projectId?: string | null;
  assetId: string;
  assetName?: string;
  assetType?: AssetType | string;
  action: AssetChangeAction;
  reason: string;
  comment?: string;
  changedAt: string;
  changedByUid: string;
  changedByEmail: string;
  changedByName?: string;
  before?: unknown;
  after?: unknown;
  attachments?: AssetChangeAttachment[];
};
