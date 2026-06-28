import type {
  DocumentGenerationRequest,
  EngineeringAreaId,
  EngineeringAssetSnapshot,
  EngineeringChangeInput,
  EngineeringHistoryEvent,
  EngineeringQueueItem,
  EngineeringUserId,
} from './engineeringTypes';
import {
  createEngineeringQueueFromInput,
} from './engineeringQueueAutomation';
import type {
  EngineeringQueueCreationResult,
} from './engineeringQueueAutomation';

const QUEUE_STORAGE_KEY = 'alistra-engineering-queue:v1';
const HISTORY_STORAGE_KEY = 'alistra-engineering-history:v1';
const DOCUMENT_STORAGE_KEY = 'alistra-engineering-document-requests:v1';

function canUseBrowserStorage(): boolean {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readJsonArray<T>(key: string): T[] {
  if (!canUseBrowserStorage()) return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeJsonArray<T>(key: string, value: T[]): void {
  if (!canUseBrowserStorage()) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Engineering queue persistence must never block map saving.
  }
}

function appendUniqueById<T extends { id: string }>(existing: T[], next: T[]): T[] {
  const byId = new Map<string, T>();
  [...existing, ...next].forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values());
}

export function readLocalEngineeringQueue(areaId?: EngineeringAreaId): EngineeringQueueItem[] {
  const items = readJsonArray<EngineeringQueueItem>(QUEUE_STORAGE_KEY);
  if (!areaId) return items;
  return items.filter((item) => item.areaId === areaId);
}

export function writeLocalEngineeringQueue(items: EngineeringQueueItem[]): void {
  writeJsonArray(QUEUE_STORAGE_KEY, items);
}

export function readLocalEngineeringHistory(areaId?: EngineeringAreaId): EngineeringHistoryEvent[] {
  const items = readJsonArray<EngineeringHistoryEvent>(HISTORY_STORAGE_KEY);
  if (!areaId) return items;
  return items.filter((item) => item.areaId === areaId);
}

export function readLocalEngineeringDocumentRequests(areaId?: EngineeringAreaId): DocumentGenerationRequest[] {
  const items = readJsonArray<DocumentGenerationRequest>(DOCUMENT_STORAGE_KEY);
  if (!areaId) return items;
  return items.filter((item) => item.areaId === areaId);
}

export interface RecordLocalEngineeringChangeInput {
  before?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null;
  after?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null;
  areaId: EngineeringAreaId;
  areaName?: string;
  currentRevision?: string;
  createdBy?: EngineeringUserId;
  source?: string;
  reason?: string;
}

export function recordLocalEngineeringChange({
  before,
  after,
  areaId,
  areaName,
  currentRevision = 'live-map',
  createdBy = 'Current User',
  source = 'live-map-save',
  reason,
}: RecordLocalEngineeringChangeInput): EngineeringQueueCreationResult {
  const allQueueItems = readLocalEngineeringQueue();
  const input: EngineeringChangeInput = {
    before,
    after,
    areaId,
    userId: createdBy,
    source,
    reason,
  };

  const result = createEngineeringQueueFromInput(input, {
    areaId,
    areaName,
    currentRevision,
    createdBy,
    source,
    existingQueue: allQueueItems,
  });

  writeLocalEngineeringQueue(result.queue);

  if (result.historyEvents.length) {
    const existingHistory = readJsonArray<EngineeringHistoryEvent>(HISTORY_STORAGE_KEY);
    writeJsonArray(HISTORY_STORAGE_KEY, appendUniqueById(existingHistory, result.historyEvents));
  }

  if (result.documentRequests.length) {
    const existingRequests = readJsonArray<DocumentGenerationRequest>(DOCUMENT_STORAGE_KEY);
    writeJsonArray(DOCUMENT_STORAGE_KEY, appendUniqueById(existingRequests, result.documentRequests));
  }

  return result;
}

export function clearLocalEngineeringQueue(areaId?: EngineeringAreaId): void {
  if (!areaId) {
    writeLocalEngineeringQueue([]);
    return;
  }

  writeLocalEngineeringQueue(
    readLocalEngineeringQueue().filter((item) => item.areaId !== areaId),
  );
}
