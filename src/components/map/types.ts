import type { PiaQaDetails } from "./pia/piaQaTypes";
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
export type CableType =
  | "Feeder Cable"
  | "ULW Cable"
  | "Link Cable"
  | "AFN Spine Cable"
  | "PIA Overlay";

export type DistributionArchitecture = "CBT" | "AFN" | "MDU" | "MDU_SPLITTER";

export type DistributionPointRole = "serving" | "splice_only";

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
  poleType?: "new" | "or" | "suggested";
  size?: string;
  year?: string;
  specialMarkings?: string;
  testDate?: string;
  locationType?: "Kerbside" | "House Boundary";
  photos?: string[];
  documents?: string[];
  piaQa?: PiaQaDetails;
};

export type DistributionPointDetails = {
  powerReadings: string[];

  closureType: DistributionArchitecture;

  /**
   * Debug/QA metadata
   * Network-level serving architecture for this DP/chain.
   * This allows the planner to keep CBT, AFN and MDU logic consistent
   * instead of mixing closure types randomly per DP.
   */
  networkArchitecture?: DistributionArchitecture;

  /**
   * Last calculated automatic fibre plan. This is metadata only; it does
   * not replace cable/drop save logic.
   */
  autoFibrePlan?: {
    connectedHomes: number;
    requiredInputFibres: number;
    branchReservedFibres?: number;
    downstreamReservedFibres?: number;
    reservedFibres: number;
    capacity: number;

    // Debug/QA visibility for auto fibre allocation.
    throughCableId?: string;
    throughCableName?: string;
    inputFibres?: number[];
    freeFibresAfterAllocation?: number;
    utilisationPercent?: number;
    duplicateFibres?: number[];
    allocationWarnings?: string[];
    allocationExplanation?: {
      label: string;
      value: string | number;
      help: string;
    }[];
    allocationTrace?: {
      assetId?: string;
      assetName: string;
      cableId?: string;
      cableName: string;
      localFibres: number;
      branchFibres: number;
      totalFibres: number;
      note: string;
    }[];

    updatedAt: string;
  };

  connectionsToHomes: number;

  buildStatus?: string;

  /**
   * Operational role for the DP/AFN.
   * serving = can receive SB/customer fibre allocations.
   * splice_only = remains in topology/passthrough, but is ignored by SB allocation.
   */
  dpRole?: DistributionPointRole;

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
  piaQa?: PiaQaDetails;
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

  source?: "manual" | "osm" | "openreach" | string;
  referenceSubtype?: "or" | "np" | "suggested" | string;
  readOnly?: boolean;
  isReferenceAsset?: boolean;
  piaKind?: "duct" | "trench" | "span" | string;
  importedProperties?: Record<string, any>;
  osmId?: string;

  mappingRows?: any[][];
  importedFiles?: { name: string; importedAt: string; rowCount: number }[];

  // Homes imported from OSM may also have flat lat/lng fields in existing data.
  lat?: number;
  lng?: number;

  geometry:
    | { type: "Point"; coordinates: [number, number] }
    | { type: "MultiPoint"; coordinates: [number, number][] }
    | { type: "LineString"; coordinates: [number, number][] }
    | { type: "MultiLineString"; coordinates: [number, number][][] }
    | { type: "Polygon"; coordinates: [number, number][][] }
    | { type: "MultiPolygon"; coordinates: [number, number][][][] };
};
