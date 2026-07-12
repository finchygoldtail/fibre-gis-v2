import { spatialApiConfig } from "./spatialApiConfig";
import { spatialApiGet, spatialApiJson } from "./spatialApiClient";

const BUSINESS_ID = "fibre-gis-v2";

export type SpatialRecord<TData = Record<string, unknown>> = {
  id: string;
  businessId: string;
  recordType: string;
  recordId: string;
  parentType?: string | null;
  parentId?: string | null;
  data: TData;
  createdAt?: string;
  updatedAt?: string;
};

type SpatialRecordList<TData> = {
  businessId: string;
  recordType: string;
  count: number;
  records: SpatialRecord<TData>[];
};

type ListRecordOptions = {
  parentType?: string;
  parentId?: string;
  limit?: number;
};

export async function listSpatialRecords<TData = Record<string, unknown>>(
  recordType: string,
  options: ListRecordOptions = {},
): Promise<SpatialRecord<TData>[]> {
  ensureRecordsReadEnabled();
  const params = new URLSearchParams({
    businessId: BUSINESS_ID,
    recordType,
    limit: String(options.limit ?? 5000),
  });
  if (options.parentType) params.set("parentType", options.parentType);
  if (options.parentId) params.set("parentId", options.parentId);

  const result = await spatialApiGet<SpatialRecordList<TData>>("/api/records", params);
  return result.records;
}

export async function getSpatialRecord<TData = Record<string, unknown>>(
  recordType: string,
  recordId: string,
): Promise<SpatialRecord<TData> | null> {
  ensureRecordsReadEnabled();
  const params = new URLSearchParams({ businessId: BUSINESS_ID });
  try {
    return await spatialApiGet<SpatialRecord<TData>>(
      `/api/records/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`,
      params,
    );
  } catch (error) {
    if (String(error).includes("404")) return null;
    throw error;
  }
}

export async function saveSpatialRecord<TData extends Record<string, unknown>>(
  recordType: string,
  recordId: string,
  data: TData,
  options: { parentType?: string; parentId?: string } = {},
): Promise<SpatialRecord<TData>> {
  ensureRecordsEnabled();
  return spatialApiJson<SpatialRecord<TData>>(
    `/api/records/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`,
    {
      method: "PUT",
      body: {
        businessId: BUSINESS_ID,
        parentType: options.parentType,
        parentId: options.parentId,
        data,
      },
    },
  );
}

export async function deleteSpatialRecord(recordType: string, recordId: string): Promise<void> {
  ensureRecordsEnabled();
  const params = new URLSearchParams({ businessId: BUSINESS_ID });
  await spatialApiJson(`/api/records/${encodeURIComponent(recordType)}/${encodeURIComponent(recordId)}`, {
    method: "DELETE",
    params,
  });
}

function ensureRecordsEnabled() {
  if (!spatialApiConfig.enabled || !spatialApiConfig.writesEnabled) {
    throw new Error("PostGIS record storage is disabled.");
  }
}

function ensureRecordsReadEnabled() {
  if (!spatialApiConfig.enabled) {
    throw new Error("PostGIS record storage is disabled.");
  }
}
