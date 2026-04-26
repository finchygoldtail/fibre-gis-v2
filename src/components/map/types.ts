export type AssetType =
  | "ag-joint"
  | "joint"
  | "street-cab"
  | "pole"
  | "distribution-point"
  | "chamber"
  | "home"
  | "area"
  | "cable";
export type CableType = "Feeder Cable" | "ULW Cable" | "Link Cable";

export type FibreCount =
  | "12F"
  | "24F"
  | "36F"
  | "48F"
  | "96F"
  | "144F"
  | "288F";

export type InstallMethod = "OH" | "Underground";

export type PoleDetails = {
  size?: string;
  year?: string;
  specialMarkings?: string;
  testDate?: string;
  locationType?: "Kerbside" | "House Boundary";
  photos?: string[];
  documents?: string[];
};

export type DistributionPointDetails = {
  buildStatus?: string;
  image?: string;
  powerReadings?: [string, string, string, string];
  closureType?: "CBT" | "AFN";
  connectionsToHomes?: 8 | 16 | 24 | 32;
};

export type ChamberDetails = {
  chamberType?: string;
  size?: string;
  depth?: string;
  lidType?: string;
  condition?: string;
  connectedDucts?: string;
  photos?: string[];
  documents?: string[];
};

export type SavedMapAsset = {
  id: string;
  name: string;
  assetType?: AssetType;
  jointType: string;
  notes?: string;

  cableType?: CableType;
  fibreCount?: FibreCount;
  installMethod?: InstallMethod;

  poleDetails?: PoleDetails;
  dpDetails?: DistributionPointDetails;
  chamberDetails?: ChamberDetails;
  streetCabDetails?: any;

  source?: "manual" | "osm" | string;
  osmId?: string;

  mappingRows?: any[][];
  importedFiles?: { name: string; importedAt: string; rowCount: number }[];

  // Homes imported from OSM may also have flat lat/lng fields in existing data.
  lat?: number;
  lng?: number;

  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "Polygon"; coordinates: [number, number][][] };
};
