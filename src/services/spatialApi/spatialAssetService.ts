import { spatialApiGet, type SpatialApiRequestOptions } from "./spatialApiClient";
import type { SpatialApiFeatureCollection, SpatialAssetBoundsRequest } from "./spatialApiTypes";

export async function fetchSpatialAssetsByBounds(
  request: SpatialAssetBoundsRequest,
  options?: SpatialApiRequestOptions,
): Promise<SpatialApiFeatureCollection> {
  const params = new URLSearchParams({
    businessId: request.businessId,
    minLng: String(request.minLng),
    minLat: String(request.minLat),
    maxLng: String(request.maxLng),
    maxLat: String(request.maxLat),
  });

  if (request.projectId) params.set("projectId", request.projectId);
  if (request.areaId) params.set("areaId", request.areaId);
  if (request.source) params.set("source", request.source);
  if (request.assetTypes?.length) params.set("assetTypes", request.assetTypes.join(","));
  if (typeof request.zoom === "number") params.set("zoom", String(request.zoom));
  if (typeof request.limit === "number") params.set("limit", String(request.limit));

  return spatialApiGet<SpatialApiFeatureCollection>("/api/assets", params, options);
}
