export type AssetType =
  | "ag-joint"
  | "joint"
  | "street-cab"
  | "pole"
  | "distribution-point"
  | "chamber"
  | "home"
  | "area"
  | "pia-route"
  | "cable";
export type CableType = "Feeder Cable" | "ULW Cable" | "Link Cable" | "AFN Spine Cable" | "PIA Overlay";

export type FibreCount =
  | "12F"
  | "24F"
  | "36F"
  | "48F"
  | "96F"
  | "144F"
  | "288F";

export type InstallMethod = "OH" | "Underground";

export type AreaLevel = "L0" | "L1" | "L2" | "L3";

export type AssetStatus =
  | "Live"
  | "BWIP"
  | "Unserviceable"
  | "Live not ready for service";

export type PoleDetails = {
  poleType?: "new" | "or";
  size?: string;
  year?: string;
  specialMarkings?: string;
  testDate?: string;
  locationType?: "Kerbside" | "House Boundary";
  photos?: string[];
  documents?: string[];
};

export type DistributionPointDetails = {
  powerReadings: string[];

  closureType:
    | "CBT"
    | "AFN"
    | "MDU"
    | "MDU_SPLITTER";

  connectionsToHomes: number;

  buildStatus?: string;

  // =====================================================
  // AFN DETAILS
  // =====================================================

  afnDetails?: {
    enabled: boolean;
    throughCableId?: string;
    fibreCountUsed?: number;
    inputFibres: number[];
    splitterRatio: "1:8";
    splitterOutputs: number;
  };

  // =====================================================
  // MDU DETAILS
  // =====================================================

  mduDetails?: {
    enabled: boolean;

    throughCableId?: string;

    // Fibres feeding apartment riser directly
    mduFibres: number;

    // Fibres feeding local splitter outputs
    splitterFibres: number;

    // Total reserved on parent cable
    totalReservedFibres: number;

    // Reserved fibres from parent cable
    inputFibres: number[];
  };
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
  usedFibres?: number;

  // Branch / jump-off cable fibre reservation from a parent spine cable.
  parentCableId?: string;
  allocatedInputFibres?: number[];

  poleDetails?: PoleDetails;
  dpDetails?: DistributionPointDetails;
  chamberDetails?: ChamberDetails;
  streetCabDetails?: any;

  areaLevel?: AreaLevel;
  homeType?: "SDU" | "MDU" | "Flats";
  status?: AssetStatus | "";

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
