export type SpatialApiGeometry =
  | {
      type: "Point";
      coordinates: [number, number];
    }
  | {
      type: "LineString";
      coordinates: [number, number][];
    }
  | {
      type: "Polygon";
      coordinates: [number, number][][];
    }
  | {
      type: "MultiPoint" | "MultiLineString" | "MultiPolygon" | "GeometryCollection";
      coordinates?: unknown;
      geometries?: SpatialApiGeometry[];
    };

export type SpatialApiFeature = {
  type: "Feature";
  id: string;
  geometry: SpatialApiGeometry;
  properties: {
    businessId: string;
    projectId: string | null;
    areaId: string | null;
    assetType: string;
    assetSubtype: string | null;
    name: string | null;
    status: string | null;
    source: string | null;
    sourceRevision: string | null;
    metadata: Record<string, unknown>;
  };
};

export type SpatialApiFeatureCollection = {
  type: "FeatureCollection";
  features: SpatialApiFeature[];
  meta: {
    count: number;
    zoom: number | null;
    truncated: boolean;
    limit: number;
  };
};

export type SpatialAssetBoundsRequest = {
  businessId: string;
  projectId?: string;
  areaId?: string;
  source?: string;
  assetTypes?: string[];
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
  zoom?: number;
  limit?: number;
};
