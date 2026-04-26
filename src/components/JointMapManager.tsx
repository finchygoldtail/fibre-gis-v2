import React, { useEffect, useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  Polygon,
  Tooltip,
  useMapEvents,
  useMap,
} from "react-leaflet";
import type { LatLngLiteral } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import { formatDistance, getPathDistanceMeters } from "../utils/mapMeasure";
import { getNextAssetName } from "../utils/mapAssetNames";
import MapContextMenu, { type MapContextAction } from "./map/MapContextMenu";
import AssetMarkersLayer from "./map/AssetMarkersLayer";
import CableLinesLayer from "./map/CableLinesLayer";
import CableDetailsModal from "./map/CableDetailsModal";
import LayersPanel from "./map/LayersPanel";
import MapSidebar from "./map/MapSidebar";
import PoleDetailsModal from "./map/modals/PoleDetailsModal";
import DistributionPointDetailsModal from "./map/modals/DistributionPointDetailsModal";
import ChamberDetailsModal, {
  type ChamberDetails,
} from "./map/modals/ChamberDetailsModal";
import { snapPointToAssets } from "./map/utils/snapToAssets";
import { routePointsToRoads } from "./map/utils/routeToRoads";
import { loadOsmBuildingsAsHomes, type OsmBounds } from "./map/utils/loadOsmBuildings";
import StreetCabDesigner from "./streetcab/StreetCabDesigner";

import type {
  AssetType,
  CableType,
  DistributionPointDetails,
  FibreCount,
  InstallMethod,
  PoleDetails,
  SavedMapAsset,
} from "./map/types";

export type SavedJoint = SavedMapAsset;
export type { SavedMapAsset };

/* Fix default leaflet icons */
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

type Props = {
  currentJointName: string;
  currentJointType: string;
  currentMappingRows: any[][];
  savedJoints: SavedMapAsset[];
  setSavedJoints: React.Dispatch<React.SetStateAction<SavedMapAsset[]>>;
  onClose: () => void;
  onOpenJoint: (joint: SavedMapAsset) => void;
};

type MapMode = "pick" | "measure" | "draw-cable" | "draw-area";

type BasemapType = "street" | "satellite" | "hybrid" | "dark";
type PolygonLevel = "L0" | "L1" | "L2" | "L3";

function normalizePolygonLevel(asset: SavedMapAsset): PolygonLevel {
  const raw = String((asset as any).polygonLevel || asset.jointType || "L0").toUpperCase();
  if (raw.includes("L1")) return "L1";
  if (raw.includes("L2")) return "L2";
  if (raw.includes("L3")) return "L3";
  return "L0";
}

type LayerVisibility = {
  agJoints: boolean;
  streetCabs: boolean;
  poles: boolean;
  distributionPoints: boolean;
  chambers: boolean;
  cables: boolean;
  areas: boolean;
  measurements: boolean;
  homes: boolean;
  l0: boolean;
  l1: boolean;
  l2: boolean;
  l3: boolean;
  newPoles: boolean;
  orPoles: boolean;
  fw2: boolean;
  fw4: boolean;
  fw6: boolean;
  fw10: boolean;
  homesSdu: boolean;
  homesMdu: boolean;
  homesFlats: boolean;
  feeders: boolean;
  links: boolean;
  ulw48: boolean;
  ulw36: boolean;
  ulw24: boolean;
  ulw12: boolean;
  live: boolean;
  bwip: boolean;
  unserviceable: boolean;
  liveNotReady: boolean;
};

function MapClickHandler({
  mode,
  assets,
  snapEnabled,
  onPick,
  onMeasurePoint,
  onCablePoint,
  onAreaPoint,
  onRightClick,
}: {
  mode: MapMode;
  assets: SavedMapAsset[];
  snapEnabled: boolean;
  onPick: (pos: LatLngLiteral) => void;
  onMeasurePoint: (pos: LatLngLiteral) => void;
  onCablePoint: (pos: LatLngLiteral) => void;
  onAreaPoint: (pos: LatLngLiteral) => void;
  onRightClick: (
    pos: LatLngLiteral,
    screen: { x: number; y: number }
  ) => void;
}) {
  useMapEvents({
    click(e) {
      let point = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      };

      if (mode === "measure") {
        onMeasurePoint(point);
        return;
      }

      if (mode === "draw-cable") {
        onCablePoint(point);
        return;
      }

      if (mode === "draw-area") {
        onAreaPoint(point);
        return;
      }

      point = snapPointToAssets(point, assets, snapEnabled, 8);
      onPick(point);
    },
    contextmenu(e) {
      onRightClick(
        { lat: e.latlng.lat, lng: e.latlng.lng },
        { x: e.originalEvent.clientX, y: e.originalEvent.clientY }
      );
    },
  });

  return null;
}

function MapBoundsTracker({ onBoundsChange }: { onBoundsChange: (bounds: OsmBounds) => void }) {
  const map = useMap();

  const updateBounds = () => {
    const bounds = map.getBounds();
    onBoundsChange({
      south: bounds.getSouth(),
      west: bounds.getWest(),
      north: bounds.getNorth(),
      east: bounds.getEast(),
    });
  };

  useEffect(() => {
    updateBounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useMapEvents({
    moveend: updateBounds,
    zoomend: updateBounds,
  });

  return null;
}


function MapBaseLayers({
  basemap,
  roadOverlayVisible,
}: {
  basemap: BasemapType;
  roadOverlayVisible: boolean;
}) {
  return (
    <>
      {basemap === "street" ? (
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      ) : null}

      {basemap === "satellite" || basemap === "hybrid" ? (
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      ) : null}

      {basemap === "dark" ? (
        <TileLayer
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        />
      ) : null}

      {basemap === "hybrid" ? (
        <>
          <TileLayer
            attribution="Labels &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"
            opacity={0.9}
          />
          <TileLayer
            attribution="Roads &copy; Esri"
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
            opacity={0.85}
          />
        </>
      ) : null}

      {roadOverlayVisible && basemap !== "hybrid" ? (
        <TileLayer
          attribution="Roads &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}"
          opacity={basemap === "satellite" ? 0.9 : 0.65}
        />
      ) : null}
    </>
  );
}

function inferAssetTypeFromName(name: string): AssetType {
  const upper = String(name || "").toUpperCase();
  if (upper.includes("-SC") || upper.includes("STREET CAB") || upper.includes("CAB")) {
    return "street-cab";
  }
  return "ag-joint";
}

export default function JointMapManager({
  currentJointName,
  currentJointType,
  currentMappingRows,
  savedJoints,
  setSavedJoints,
  onClose,
  onOpenJoint,
}: Props) {
  const [pickedLocation, setPickedLocation] = useState<LatLngLiteral | null>(null);

  const [assetType, setAssetType] = useState<AssetType>(
    inferAssetTypeFromName(currentJointName)
  );

  const [jointName, setJointName] = useState(currentJointName || "");
  const [jointType, setJointType] = useState(currentJointType || "CMJ (12 trays)");
  const [notes, setNotes] = useState("");

  const [cableType, setCableType] = useState<CableType>("Feeder Cable");
  const [fibreCount, setFibreCount] = useState<FibreCount>("12F");
  const [installMethod, setInstallMethod] = useState<InstallMethod>("Underground");

  const [poleDetails, setPoleDetails] = useState<PoleDetails>({});
  const [dpDetails, setDpDetails] = useState<DistributionPointDetails>({
    powerReadings: ["", "", "", ""],
    closureType: "CBT",
    connectionsToHomes: 8,
  });
  const [chamberDetails, setChamberDetails] = useState<ChamberDetails>({});

  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);

  const [mapMode, setMapMode] = useState<MapMode>("pick");
  const [basemap, setBasemap] = useState<BasemapType>("street");
  const [roadOverlayVisible, setRoadOverlayVisible] = useState(false);
  const [measurePoints, setMeasurePoints] = useState<LatLngLiteral[]>([]);
  const [draftCablePoints, setDraftCablePoints] = useState<LatLngLiteral[]>([]);
  const [draftAreaPoints, setDraftAreaPoints] = useState<LatLngLiteral[]>([]);
  const [polygonLevel, setPolygonLevel] = useState<PolygonLevel>("L0");

  const [visibleLayers, setVisibleLayers] = useState<LayerVisibility>({
    agJoints: true,
    streetCabs: true,
    poles: true,
    distributionPoints: true,
    chambers: true,
    cables: true,
    areas: true,
    measurements: true,
    homes: false,
    l0: true,
    l1: true,
    l2: true,
    l3: true,
    newPoles: true,
    orPoles: true,
    fw2: true,
    fw4: true,
    fw6: true,
    fw10: true,
    homesSdu: false,
    homesMdu: false,
    homesFlats: false,
    feeders: true,
    links: true,
    ulw48: true,
    ulw36: true,
    ulw24: true,
    ulw12: true,
    live: true,
    bwip: true,
    unserviceable: true,
    liveNotReady: true,
  });
  const [layersOpen, setLayersOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isRoutingCable, setIsRoutingCable] = useState(false);
  const [isLoadingOsmHomes, setIsLoadingOsmHomes] = useState(false);
  const [mapBounds, setMapBounds] = useState<OsmBounds | null>(null);

  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    latlng: LatLngLiteral | null;
  }>({
    visible: false,
    x: 0,
    y: 0,
    latlng: null,
  });

  const [showCableModal, setShowCableModal] = useState(false);
  const [showPoleModal, setShowPoleModal] = useState(false);
  const [showDpModal, setShowDpModal] = useState(false);
  const [showChamberModal, setShowChamberModal] = useState(false);

  const [openStreetCabAsset, setOpenStreetCabAsset] = useState<SavedMapAsset | null>(null);

  useEffect(() => {
    setJointName(currentJointName || "");
    setJointType(currentJointType || "CMJ (12 trays)");
    setAssetType(inferAssetTypeFromName(currentJointName));
  }, [currentJointName, currentJointType]);

  const mapCenter = useMemo<[number, number]>(() => {
    if (pickedLocation) return [pickedLocation.lat, pickedLocation.lng];
    if (draftCablePoints.length > 0) {
      const last = draftCablePoints[draftCablePoints.length - 1];
      return [last.lat, last.lng];
    }
    if (draftAreaPoints.length > 0) {
      const last = draftAreaPoints[draftAreaPoints.length - 1];
      return [last.lat, last.lng];
    }
    if (measurePoints.length > 0) {
      const last = measurePoints[measurePoints.length - 1];
      return [last.lat, last.lng];
    }

    const firstPointAsset = (savedJoints ?? []).find((a) => a.geometry?.type === "Point");
    if (firstPointAsset?.geometry?.type === "Point") {
      return firstPointAsset.geometry.coordinates;
    }

    return [54.5, -3.0];
  }, [pickedLocation, draftCablePoints, draftAreaPoints, measurePoints, savedJoints]);

  const measuredDistance = useMemo(() => {
    return getPathDistanceMeters(measurePoints);
  }, [measurePoints]);

  const draftCableDistance = useMemo(() => {
    return getPathDistanceMeters(draftCablePoints);
  }, [draftCablePoints]);

  const resetEditor = () => {
    setEditingAssetId(null);
    setPickedLocation(null);
    setNotes("");
    setMapMode("pick");
    setDraftCablePoints([]);
    setDraftAreaPoints([]);
    setPolygonLevel("L0");
    setCableType("Feeder Cable");
    setFibreCount("12F");
    setInstallMethod("Underground");
    setPoleDetails({});
    setDpDetails({
      powerReadings: ["", "", "", ""],
      closureType: "CBT",
      connectionsToHomes: 8,
    });
    setChamberDetails({});
    setShowCableModal(false);
    setShowPoleModal(false);
    setShowDpModal(false);
    setShowChamberModal(false);
  };

  const openCableModalForNew = () => {
    setEditingAssetId(null);
    setAssetType("cable");
    setJointType("Cable");
    setJointName(getNextAssetName(savedJoints, "cable"));
    setNotes("");
    setCableType("Feeder Cable");
    setFibreCount("12F");
    setInstallMethod("Underground");
    setDraftCablePoints([]);
    setShowCableModal(true);
  };

  const startCableDrawing = () => {
    if (!jointName.trim()) {
      alert("Enter a cable name.");
      return;
    }
    setAssetType("cable");
    setJointType("Cable");
    setMapMode("draw-cable");
    setShowCableModal(false);
  };

  const handleEditAsset = (asset: SavedMapAsset) => {
    setEditingAssetId(asset.id);
    setAssetType(asset.assetType || "ag-joint");
    setJointName(asset.name || "");
    setJointType(asset.jointType || "");
    setNotes(asset.notes || "");
    setCableType(asset.cableType || "Feeder Cable");
    setFibreCount(asset.fibreCount || "12F");
    setInstallMethod(asset.installMethod || "Underground");
    setPoleDetails(asset.poleDetails || {});
    setDpDetails(
      asset.dpDetails || {
        powerReadings: ["", "", "", ""],
        closureType: "CBT",
        connectionsToHomes: 8,
      }
    );
    setChamberDetails(asset.chamberDetails || {});
    if (asset.assetType === "area") {
      setPolygonLevel(normalizePolygonLevel(asset));
    }

    if (asset.geometry?.type === "Point") {
      const [lat, lng] = asset.geometry.coordinates;
      setPickedLocation({ lat, lng });
      setDraftCablePoints([]);
      setMapMode("pick");

      if (asset.assetType === "pole") {
        setShowPoleModal(true);
      } else if (asset.assetType === "distribution-point") {
        setShowDpModal(true);
      } else if (asset.assetType === "chamber") {
        setShowChamberModal(true);
      } else {
        setShowCableModal(false);
      }
    } else if (asset.geometry?.type === "Polygon") {
      setPickedLocation(null);
      setDraftCablePoints([]);
      setDraftAreaPoints(
        (asset.geometry.coordinates[0] || []).map(([lat, lng]) => ({ lat, lng }))
      );
      setMapMode("draw-area");
      setShowCableModal(false);
    } else if (asset.geometry?.type === "LineString") {
      setPickedLocation(null);
      setDraftAreaPoints([]);
      setDraftCablePoints(
        asset.geometry.coordinates.map(([lat, lng]) => ({ lat, lng }))
      );
      setShowCableModal(true);
    }
  };

  const handleSaveEdits = async () => {
    if (!editingAssetId) return;

    let routedCableCoordinates: [number, number][] | null = null;

    if (assetType === "cable" && draftCablePoints.length >= 2) {
      setIsRoutingCable(true);
      try {
        routedCableCoordinates = await routePointsToRoads(draftCablePoints);
      } finally {
        setIsRoutingCable(false);
      }
    }

    setSavedJoints((prev) =>
      prev.map((asset) => {
        if (asset.id !== editingAssetId) return asset;

        if (assetType === "area") {
          if (draftAreaPoints.length < 3) return asset;

          return {
            ...asset,
            name: jointName.trim() || asset.name,
            jointType: `Polygon Area ${polygonLevel}`,
            notes: notes.trim(),
            assetType: "area",
            ...( { polygonLevel } as any ),
            geometry: {
              type: "Polygon",
              coordinates: [draftAreaPoints.map((p) => [p.lat, p.lng])],
            },
          };
        }

        if (asset.geometry?.type === "Point") {
          if (!pickedLocation) return asset;

          return {
            ...asset,
            name: jointName.trim() || asset.name,
            jointType:
              assetType === "street-cab"
                ? "Street Cab"
                : assetType === "pole"
                ? "Pole"
                : assetType === "distribution-point"
                ? "Distribution Point"
                : assetType === "chamber"
                ? "Chamber"
                : assetType === "home"
                ? "Home"
                : jointType,
            notes: notes.trim(),
            assetType,
            poleDetails: assetType === "pole" ? poleDetails : undefined,
            dpDetails:
              assetType === "distribution-point" ? dpDetails : undefined,
            chamberDetails:
              assetType === "chamber" ? chamberDetails : undefined,
            geometry: {
              type: "Point",
              coordinates: [pickedLocation.lat, pickedLocation.lng],
            },
          };
        }

        return {
          ...asset,
          name: jointName.trim() || asset.name,
          jointType: "Cable",
          notes: notes.trim(),
          assetType: "cable",
          cableType,
          fibreCount,
          installMethod,
          routeMode: routedCableCoordinates ? "road" : undefined,
          geometry: {
            type: "LineString",
            coordinates:
              routedCableCoordinates ||
              draftCablePoints.map((p) => [p.lat, p.lng]),
          },
        };
      })
    );

    resetEditor();
  };

  const handleSaveJoint = () => {
    if (!pickedLocation) {
      alert("Click a location on the map first.");
      return;
    }

    if (!jointName.trim()) {
      if (assetType === "street-cab") {
        alert("Enter a street cab name.");
      } else if (assetType === "pole") {
        alert("Enter a pole name.");
      } else if (assetType === "distribution-point") {
        alert("Enter a distribution point name.");
      } else if (assetType === "chamber") {
        alert("Enter a chamber name.");
      } else if (assetType === "home") {
        alert("Enter a home name.");
      } else {
        alert("Enter a joint name.");
      }
      return;
    }


    if (assetType === "cable") {
      alert("Use Add Cable and Start Drawing for cables.");
      return;
    }

    if (assetType === "area") {
      alert("Use Draw Area, then Finish Area for polygons.");
      return;
    }

    const record: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: jointName.trim(),
      assetType,
      jointType:
        assetType === "street-cab"
          ? "Street Cab"
          : assetType === "pole"
          ? "Pole"
          : assetType === "distribution-point"
          ? "Distribution Point"
          : assetType === "chamber"
          ? "Chamber"
          : assetType === "home"
          ? "Home"
          : jointType,
      notes: notes.trim(),
      mappingRows: [],
      poleDetails: assetType === "pole" ? poleDetails : undefined,
      dpDetails: assetType === "distribution-point" ? dpDetails : undefined,
      chamberDetails: assetType === "chamber" ? chamberDetails : undefined,
      geometry: {
        type: "Point",
        coordinates: [pickedLocation.lat, pickedLocation.lng],
      },
    };

    setSavedJoints((prev) => [...prev, record]);
    resetEditor();
  };

  const handleFinishArea = () => {
    if (draftAreaPoints.length < 3) {
      alert("Add at least three polygon points.");
      return;
    }

    const areaName =
      jointName.trim() ||
      `Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`;

    const areaRecord: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: areaName,
      assetType: "area",
      jointType: `Polygon Area ${polygonLevel}`,
      notes: notes.trim(),
      mappingRows: [],
      ...( { polygonLevel } as any ),
      geometry: {
        type: "Polygon",
        coordinates: [draftAreaPoints.map((p) => [p.lat, p.lng])],
      },
    };

    setSavedJoints((prev) => [...prev, areaRecord]);
    resetEditor();
  };

  const handleUndoAreaPoint = () => {
    setDraftAreaPoints((prev) => prev.slice(0, -1));
  };

  const handleClearArea = () => {
    setDraftAreaPoints([]);
  };

  const handleMoveAreaPoint = (index: number, point: LatLngLiteral) => {
    setDraftAreaPoints((prev) =>
      prev.map((existingPoint, existingIndex) =>
        existingIndex === index ? point : existingPoint
      )
    );
  };

  const handleFinishCable = async () => {
    if (draftCablePoints.length < 2) {
      alert("Add at least two cable points.");
      return;
    }

    const cableName =
      jointName.trim() || getNextAssetName(savedJoints, "cable");

    setIsRoutingCable(true);

    try {
      const routedCoordinates = await routePointsToRoads(draftCablePoints);

      const cableRecord: SavedMapAsset = {
        id: crypto.randomUUID(),
        name: cableName,
        assetType: "cable",
        jointType: "Cable",
        notes: notes.trim(),
        cableType,
        fibreCount,
        installMethod,
        routeMode: "road",
        geometry: {
          type: "LineString",
          coordinates: routedCoordinates,
        },
      };

      setSavedJoints((prev) => [...prev, cableRecord]);
      resetEditor();
    } finally {
      setIsRoutingCable(false);
    }
  };

  const handleUndoCablePoint = () => {
    setDraftCablePoints((prev) => prev.slice(0, -1));
  };

  const handleClearCable = () => {
    setDraftCablePoints([]);
  };

  const handleDeleteAsset = (id: string) => {
    setSavedJoints((prev) => prev.filter((j) => j.id !== id));
    if (editingAssetId === id) {
      resetEditor();
    }
  };

  const handleClearMeasurement = () => {
    setMeasurePoints([]);
  };

  const handleUndoMeasurementPoint = () => {
    setMeasurePoints((prev) => prev.slice(0, -1));
  };

  const handleMapRightClick = (
    pos: LatLngLiteral,
    screen: { x: number; y: number }
  ) => {
    setContextMenu({
      visible: true,
      x: screen.x,
      y: screen.y,
      latlng: pos,
    });
  };

  const handleCloseContextMenu = () => {
    setContextMenu({
      visible: false,
      x: 0,
      y: 0,
      latlng: null,
    });
  };

  const handleContextAddAsset = (type: MapContextAction) => {
  setEditingAssetId(null);

  if (type === "cable") {
    openCableModalForNew();
    handleCloseContextMenu();
    return;
  }

  if (type === "area") {
    setAssetType("area");
    setJointType("Polygon Area L0");
    setPolygonLevel("L0");
    setJointName(`Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`);
    setNotes("");
    setPickedLocation(null);
    setDraftCablePoints([]);
    setDraftAreaPoints(contextMenu.latlng ? [contextMenu.latlng] : []);
    setMapMode("draw-area");
    handleCloseContextMenu();
    return;
  }

  if (!contextMenu.latlng) return;

  // NEW: Add Joint directly from right-click menu
  if (type === "joint") {
    const record: SavedMapAsset = {
      id: crypto.randomUUID(),
      name: getNextAssetName(savedJoints, "ag-joint"),
      assetType: "ag-joint",
      jointType: "LMJ (40 trays)",
      notes: "",
      mappingRows: [],
      geometry: {
        type: "Point",
        coordinates: [contextMenu.latlng.lat, contextMenu.latlng.lng],
      },
    };

    setSavedJoints((prev) => [...prev, record]);
    handleCloseContextMenu();
    onOpenJoint(record);
    return;
  }

  setPickedLocation(contextMenu.latlng);
  setAssetType(type as AssetType);
  setJointName(getNextAssetName(savedJoints, type as any));
  setNotes("");

  if (type === "pole") {
    setJointType("Pole");
    setPoleDetails({ poleType: "new" });
    setShowPoleModal(true);
  }

  if (type === "distribution-point") {
    setJointType("Distribution Point");
    setDpDetails({
      powerReadings: ["", "", "", ""],
      closureType: "CBT",
      connectionsToHomes: 8,
    });
    setShowDpModal(true);
  }

  if (type === "chamber") {
    setJointType("Chamber");
    setChamberDetails({ chamberType: "fw2" });
    setShowChamberModal(true);
  }

  if (type === "street-cab") {
    setJointType("Street Cab");
  }

  setMapMode("pick");
  handleCloseContextMenu();
};


  const handleCablePoint = (point: LatLngLiteral) => {
    const snapped = snapPointToAssets(point, (savedJoints ?? []).filter((asset) => asset.assetType !== "area"), snapEnabled, 8);
    setDraftCablePoints((prev) => [...prev, snapped]);
  };

  const handleAreaPoint = (point: LatLngLiteral) => {
    setDraftAreaPoints((prev) => [...prev, point]);
  };

  const handleLoadOsmHomes = async () => {
    if (!mapBounds) {
      alert("Move or zoom the map once, then try again.");
      return;
    }

    const latSpan = Math.abs(mapBounds.north - mapBounds.south);
    const lngSpan = Math.abs(mapBounds.east - mapBounds.west);

    if (latSpan > 0.08 || lngSpan > 0.12) {
      alert("Zoom in closer before loading OSM homes. This avoids importing too many buildings at once.");
      return;
    }

    setIsLoadingOsmHomes(true);

    try {
      const homes = await loadOsmBuildingsAsHomes(mapBounds, savedJoints);

      if (homes.length === 0) {
        alert("No new OSM homes found in the current map view.");
        return;
      }

      setSavedJoints((prev) => [...prev, ...homes]);
      alert(`Loaded ${homes.length} OSM homes into the map.`);
    } catch (err: any) {
      alert(`Failed to load OSM homes: ${err.message || String(err)}`);
    } finally {
      setIsLoadingOsmHomes(false);
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(savedJoints, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved-assets.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGeoJson = () => {
    const geojson = {
      type: "FeatureCollection",
      features: (savedJoints ?? [])
        .map((asset) => {
        if (asset.geometry?.type === "Point") {
          const [lat, lng] = asset.geometry.coordinates;
          return {
            type: "Feature",
            properties: {
              id: asset.id,
              name: asset.name,
              assetType: asset.assetType || "ag-joint",
              jointType: asset.jointType,
              notes: asset.notes || "",
              cableType: asset.cableType || "",
              fibreCount: asset.fibreCount || "",
              installMethod: asset.installMethod || "",
              poleDetails: asset.poleDetails || null,
              dpDetails: asset.dpDetails || null,
              chamberDetails: asset.chamberDetails || null,
              streetCabDetails: asset.streetCabDetails || null,
            },
            geometry: {
              type: "Point",
              coordinates: [lng, lat],
            },
          };
        }

        if (asset.geometry?.type === "LineString") {
          return {
            type: "Feature",
            properties: {
              id: asset.id,
              name: asset.name,
              assetType: asset.assetType || "cable",
              jointType: asset.jointType,
              notes: asset.notes || "",
              cableType: asset.cableType || "",
              fibreCount: asset.fibreCount || "",
              installMethod: asset.installMethod || "",
            },
            geometry: {
              type: "LineString",
              coordinates: asset.geometry.coordinates.map(([lat, lng]) => [lng, lat]),
            },
          };
        }

        if (asset.geometry?.type === "Polygon") {
          return {
            type: "Feature",
            properties: {
              id: asset.id,
              name: asset.name,
              assetType: asset.assetType || "area",
              jointType: asset.jointType,
              notes: asset.notes || "",
            },
            geometry: {
              type: "Polygon",
              coordinates: asset.geometry.coordinates.map((ring) =>
                ring.map(([lat, lng]) => [lng, lat])
              ),
            },
          };
        }

        return null;
      })
      .filter(Boolean),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
      type: "application/geo+json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saved-assets.geojson";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!Array.isArray(parsed)) throw new Error("Invalid file");

      setSavedJoints(parsed as SavedMapAsset[]);
      alert("Imported successfully");
    } catch (err: any) {
      alert("Import failed: " + err.message);
    }

    e.target.value = "";
  };

  if (openStreetCabAsset) {
    return (
      <StreetCabDesigner
        asset={openStreetCabAsset}
        onClose={() => setOpenStreetCabAsset(null)}
        onSave={(updatedAsset) => {
          setSavedJoints((prev) =>
            prev.map((item) => (item.id === updatedAsset.id ? updatedAsset : item))
          );
          setOpenStreetCabAsset(updatedAsset);
        }}
      />
    );
  }

  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        display: "flex",
        position: "relative",
        background: "#1f2937",
        color: "white",
      }}
    >
      <MapSidebar open={sidebarOpen} onToggle={() => setSidebarOpen((open) => !open)}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Joint Map Manager</h2>
          <button onClick={onClose} style={btnSecondary}>
            Back
          </button>
        </div>

        <div style={card}>
          <div style={label}>Asset Type</div>
          <select
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as AssetType)}
            style={input}
            disabled={
              !!editingAssetId ||
              showCableModal ||
              showPoleModal ||
              showDpModal ||
              showChamberModal
            }
          >
            <option value="ag-joint">AG Joint</option>
            <option value="street-cab">Street Cab</option>
            <option value="pole">Pole</option>
            <option value="distribution-point">Distribution Point</option>
            <option value="chamber">Chamber</option>
            <option value="home">Home</option>
            <option value="area">Polygon Area</option>
            <option value="cable">Cable</option>
          </select>

          <div style={{ ...label, marginTop: 10 }}>Name</div>
          <input
            value={jointName}
            onChange={(e) => setJointName(e.target.value)}
            style={input}
            placeholder="Asset name"
          />

          {assetType === "ag-joint" ? (
            <>
              <div style={{ ...label, marginTop: 10 }}>Joint Type</div>
              <select
                value={jointType}
                onChange={(e) => setJointType(e.target.value)}
                style={input}
              >
                <option>CMJ (12 trays)</option>
                <option>MMJ (20 trays)</option>
                <option>LMJ (40 trays)</option>
              </select>
            </>
          ) : null}



          {assetType === "area" ? (
            <>
              <div style={{ ...label, marginTop: 10 }}>Polygon Layer</div>
              <select
                value={polygonLevel}
                onChange={(e) => setPolygonLevel(e.target.value as PolygonLevel)}
                style={input}
              >
                <option value="L0">L0</option>
                <option value="L1">L1</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
              </select>
            </>
          ) : null}

          <div style={{ ...label, marginTop: 10 }}>Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...input, height: 80 }}
          />

          {editingAssetId &&
          assetType !== "cable" &&
          !showPoleModal &&
          !showDpModal &&
          !showChamberModal ? (
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button onClick={handleSaveEdits} style={btnPrimary}>
                Save Changes
              </button>
              <button onClick={resetEditor} style={btnSecondary}>
                Cancel Edit
              </button>
            </div>
          ) : null}
        </div>

        <div style={card}>
          <div style={label}>Map Tool</div>

          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              onClick={() => setMapMode("pick")}
              style={mapMode === "pick" ? btnPrimary : btnSecondary}
            >
              Pick
            </button>

            <button
              onClick={() => setMapMode("measure")}
              style={mapMode === "measure" ? btnPrimary : btnSecondary}
            >
              Measure
            </button>

            <button
              onClick={openCableModalForNew}
              style={mapMode === "draw-cable" ? btnPrimary : btnSecondary}
            >
              Cable
            </button>

            <button
              onClick={() => {
                setAssetType("area");
                setJointType("Polygon Area");
                setJointName(`Area ${(savedJoints ?? []).filter((asset) => asset.assetType === "area").length + 1}`);
                setPickedLocation(null);
                setDraftCablePoints([]);
                setMapMode("draw-area");
              }}
              style={mapMode === "draw-area" ? btnPrimary : btnSecondary}
            >
              Area
            </button>
          </div>

          <label style={{ ...layerRow, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={snapEnabled}
              onChange={() => setSnapEnabled((v) => !v)}
            />
            <span>Snap to nearby assets</span>
          </label>

          {mapMode === "pick" && !editingAssetId && (
            <>
              <div style={{ ...label, marginTop: 12 }}>Picked Location</div>
              <div style={{ color: "#9ca3af" }}>
                {pickedLocation
                  ? `${pickedLocation.lat.toFixed(5)}, ${pickedLocation.lng.toFixed(5)}`
                  : "Left click to pick. Right click to add Pole, Distribution Point, Chamber, or Cable."}
              </div>

              <div style={{ marginTop: 8, fontSize: "0.85rem", color: "#cbd5e1" }}>
                Create the asset first, then click it to upload/view splice data.
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={handleSaveJoint} style={btnPrimary}>
                  Create Asset Here
                </button>
                <button
                  onClick={() => setPickedLocation(null)}
                  style={btnSecondary}
                >
                  Clear Pick
                </button>
              </div>
            </>
          )}

          {mapMode === "measure" && (
            <>
              <div style={{ ...label, marginTop: 12 }}>Measurement</div>
              <div style={{ color: "#9ca3af" }}>
                Click points on the map to measure distance.
              </div>

              <div style={{ marginTop: 8, fontSize: "0.9rem", color: "#e5e7eb" }}>
                Points: {measurePoints.length}
              </div>

              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#93c5fd" }}>
                Total: {formatDistance(measuredDistance)}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  onClick={handleUndoMeasurementPoint}
                  style={btnSecondary}
                  disabled={measurePoints.length === 0}
                >
                  Undo Last Point
                </button>

                <button
                  onClick={handleClearMeasurement}
                  style={btnSecondary}
                  disabled={measurePoints.length === 0}
                >
                  Clear Measurement
                </button>
              </div>
            </>
          )}

          {mapMode === "draw-area" && (
            <>
              <div style={{ ...label, marginTop: 12 }}>
                {editingAssetId ? "Edit Polygon Area" : "Polygon Area Drawing"}
              </div>
              <div style={{ color: "#9ca3af" }}>
                Click around the boundary. Drag any blue area point marker to adjust it. Use Finish Area when you have at least three points.
              </div>

              <div style={{ marginTop: 8, fontSize: "0.9rem", color: "#e5e7eb" }}>
                Points: {draftAreaPoints.length}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={handleUndoAreaPoint}
                  style={btnSecondary}
                  disabled={draftAreaPoints.length === 0}
                >
                  Undo Last Point
                </button>

                <button
                  onClick={handleClearArea}
                  style={btnSecondary}
                  disabled={draftAreaPoints.length === 0}
                >
                  Clear Area
                </button>

                {!editingAssetId ? (
                  <button
                    onClick={handleFinishArea}
                    style={btnPrimary}
                    disabled={draftAreaPoints.length < 3}
                  >
                    Finish Area
                  </button>
                ) : (
                  <button
                    onClick={handleSaveEdits}
                    style={btnPrimary}
                    disabled={draftAreaPoints.length < 3}
                  >
                    Save Changes
                  </button>
                )}
              </div>
            </>
          )}

          {mapMode === "draw-cable" && (
            <>
              <div style={{ ...label, marginTop: 12 }}>
                {editingAssetId ? "Edit Cable Route" : "Cable Drawing"}
              </div>
              <div style={{ color: "#9ca3af" }}>
                Click points on the map to create or update the cable route.
              </div>

              <div style={{ marginTop: 8, fontSize: "0.9rem", color: "#e5e7eb" }}>
                Points: {draftCablePoints.length}
              </div>

              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#fbbf24" }}>
                Length: {formatDistance(draftCableDistance)}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  onClick={handleUndoCablePoint}
                  style={btnSecondary}
                  disabled={draftCablePoints.length === 0}
                >
                  Undo Last Point
                </button>

                <button
                  onClick={handleClearCable}
                  style={btnSecondary}
                  disabled={draftCablePoints.length === 0}
                >
                  Clear Cable
                </button>

                {!editingAssetId ? (
                  <button
                    onClick={handleFinishCable}
                    style={btnPrimary}
                    disabled={draftCablePoints.length < 2 || isRoutingCable}
                  >
                    {isRoutingCable ? "Routing Cable..." : "Finish Cable"}
                  </button>
                ) : (
                  <button
                    onClick={handleSaveEdits}
                    style={btnPrimary}
                    disabled={draftCablePoints.length < 2 || isRoutingCable}
                  >
                    {isRoutingCable ? "Routing Cable..." : "Save Changes"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div style={card}>
          <div style={label}>Import / Export Saved Map</div>

          <input type="file" accept=".json" onChange={handleImportJson} />

          <button onClick={handleExportJson} style={btnSecondary}>
            Export JSON
          </button>

          <button onClick={handleExportGeoJson} style={btnSecondary}>
            Export GeoJSON
          </button>

          <button
            onClick={handleLoadOsmHomes}
            style={btnPrimary}
            disabled={isLoadingOsmHomes}
          >
            {isLoadingOsmHomes ? "Loading OSM Homes..." : "Load OSM Homes in View"}
          </button>

          <div style={{ fontSize: "0.82rem", color: "#cbd5e1" }}>
            Zoom into the estate/road first, then load buildings. Imported buildings become shared Home assets.
          </div>
        </div>
      </MapSidebar>

      <div style={{ position: "relative", height: "100%", flex: 1, minWidth: 0 }}>
        <MapContainer center={mapCenter} zoom={6} style={{ height: "100%" }}>
          <MapBaseLayers basemap={basemap} roadOverlayVisible={roadOverlayVisible} />
          <MapBoundsTracker onBoundsChange={setMapBounds} />

          <MapClickHandler
            mode={mapMode}
            assets={(savedJoints ?? []).filter((asset) => asset.assetType !== "area")}
            snapEnabled={snapEnabled}
            onPick={setPickedLocation}
            onMeasurePoint={(point) =>
              setMeasurePoints((prev) => [...prev, point])
            }
            onCablePoint={handleCablePoint}
            onAreaPoint={handleAreaPoint}
            onRightClick={handleMapRightClick}
          />

          <AssetMarkersLayer
  assets={(savedJoints ?? []).filter((asset) => asset.assetType !== "area")}
  visibleLayers={visibleLayers}
  onOpenAsset={(asset) => {
    if (asset.assetType === "street-cab") {
      setOpenStreetCabAsset(asset);
      return;
    }
    onOpenJoint(asset);
  }}
  onDeleteAsset={handleDeleteAsset}
  onEditAsset={handleEditAsset}

  onMoveAsset={(id, lat, lng) => {
    setSavedJoints((prev) =>
      prev.map((asset) => {
        if (asset.id !== id) return asset;
        if (asset.geometry?.type !== "Point") return asset;

        return {
          ...asset,
          geometry: {
            type: "Point",
            coordinates: [lat, lng],
          },
        };
      })
    );
  }}
/>
          

          {visibleLayers.areas &&
            (savedJoints ?? [])
              .filter((asset) => {
                if (asset.assetType !== "area" || asset.geometry?.type !== "Polygon") return false;

                const level = normalizePolygonLevel(asset);
                if (level === "L0" && !visibleLayers.l0) return false;
                if (level === "L1" && !visibleLayers.l1) return false;
                if (level === "L2" && !visibleLayers.l2) return false;
                if (level === "L3" && !visibleLayers.l3) return false;

                return true;
              })
              .map((asset) => {
                const level = normalizePolygonLevel(asset);
                const areaPoints = (asset.geometry as { type: "Polygon"; coordinates: [number, number][][] }).coordinates[0].map(
                  ([lat, lng]) => [lat, lng] as [number, number]
                );

                return (
                  <Polygon
                    key={asset.id}
                    positions={areaPoints}
                    pathOptions={{ color: "#a855f7", weight: 3, fillOpacity: 0.18 }}
                    eventHandlers={{
                      click: () => handleEditAsset(asset),
                    }}
                  >
                    <Popup>
                      <b>{asset.name}</b>
                      <br />
                      Polygon Area {level}
                      {asset.notes ? (
                        <>
                          <br />
                          {asset.notes}
                        </>
                      ) : null}
                      <br />
                      <button onClick={() => handleEditAsset(asset)}>Edit</button>{" "}
                      <button onClick={() => handleDeleteAsset(asset.id)}>Delete</button>
                    </Popup>

                    <Tooltip permanent direction="center" opacity={0.9} className="area-size-label">
                      {asset.name || level}
                    </Tooltip>
                  </Polygon>
                );
              })}

          <CableLinesLayer
            assets={savedJoints}
            cablesVisible={visibleLayers.cables}
            visibleLayers={visibleLayers}
            onDeleteAsset={handleDeleteAsset}
            onEditAsset={handleEditAsset}
          />

          {pickedLocation && mapMode === "pick" && (
            <Marker position={[pickedLocation.lat, pickedLocation.lng]}>
              <Popup>Picked Location</Popup>
            </Marker>
          )}

          {visibleLayers.measurements &&
            measurePoints.map((point, index) => (
              <Marker
                key={`measure-${index}`}
                position={[point.lat, point.lng]}
              >
                <Popup>
                  <b>Measure Point {index + 1}</b>
                  <br />
                  {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
                </Popup>
              </Marker>
            ))}

          {visibleLayers.measurements && measurePoints.length >= 2 && (
            <Polyline
              positions={measurePoints.map(
                (p) => [p.lat, p.lng] as [number, number]
              )}
              pathOptions={{ color: "#60a5fa", weight: 3 }}
            />
          )}

          {draftAreaPoints.map((point, index) => (
            <Marker
              key={`draft-area-${index}`}
              position={[point.lat, point.lng]}
              draggable
              eventHandlers={{
                dragend: (event) => {
                  const marker = event.target as L.Marker;
                  const nextPoint = marker.getLatLng();
                  handleMoveAreaPoint(index, {
                    lat: nextPoint.lat,
                    lng: nextPoint.lng,
                  });
                },
              }}
            >
              <Popup>
                <b>Area Point {index + 1}</b>
                <br />
                Drag this marker to adjust the polygon.
                <br />
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </Popup>
            </Marker>
          ))}

          {draftAreaPoints.length >= 2 && (
            <Polyline
              positions={[
                ...draftAreaPoints.map((p) => [p.lat, p.lng] as [number, number]),
                ...(draftAreaPoints.length >= 3
                  ? [[draftAreaPoints[0].lat, draftAreaPoints[0].lng] as [number, number]]
                  : []),
              ]}
              pathOptions={{ color: "#a855f7", weight: 3, dashArray: "8, 6" }}
            />
          )}

          {draftAreaPoints.length >= 3 && (
            <Polygon
              positions={draftAreaPoints.map(
                (p) => [p.lat, p.lng] as [number, number]
              )}
              pathOptions={{ color: "#a855f7", weight: 3, fillOpacity: 0.16 }}
            />
          )}

          {draftCablePoints.map((point, index) => (
            <Marker
              key={`draft-cable-${index}`}
              position={[point.lat, point.lng]}
            >
              <Popup>
                <b>Cable Point {index + 1}</b>
                <br />
                {point.lat.toFixed(5)}, {point.lng.toFixed(5)}
              </Popup>
            </Marker>
          ))}

          {draftCablePoints.length >= 2 && (
            <Polyline
              positions={draftCablePoints.map(
                (p) => [p.lat, p.lng] as [number, number]
              )}
              pathOptions={{
                color:
                  cableType === "ULW Cable"
                    ? "#22c55e"
                    : cableType === "Link Cable"
                    ? "#3b82f6"
                    : "#f59e0b",
                weight: 4,
                dashArray: installMethod === "OH" ? "10, 8" : undefined,
              }}
            />
          )}
        </MapContainer>

        <MapContextMenu
          visible={contextMenu.visible}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={handleCloseContextMenu}
          onSelect={handleContextAddAsset}
        />

        <CableDetailsModal
          visible={showCableModal}
          name={jointName}
          notes={notes}
          cableType={cableType}
          fibreCount={fibreCount}
          installMethod={installMethod}
          onChangeName={setJointName}
          onChangeNotes={setNotes}
          onChangeCableType={setCableType}
          onChangeFibreCount={setFibreCount}
          onChangeInstallMethod={setInstallMethod}
          onStart={startCableDrawing}
          onCancel={resetEditor}
          isEditing={!!editingAssetId}
        />

        <PoleDetailsModal
          visible={showPoleModal}
          name={jointName}
          details={poleDetails}
          onChangeName={setJointName}
          onChange={setPoleDetails}
          onSave={() => {
            setShowPoleModal(false);
            if (editingAssetId) {
              handleSaveEdits();
            } else {
              handleSaveJoint();
            }
          }}
          onCancel={resetEditor}
        />

        <DistributionPointDetailsModal
          visible={showDpModal}
          name={jointName}
          details={dpDetails}
          onChangeName={setJointName}
          onChange={setDpDetails}
          onSave={() => {
            setShowDpModal(false);
            if (editingAssetId) {
              handleSaveEdits();
            } else {
              handleSaveJoint();
            }
          }}
          onCancel={resetEditor}
        />

        <ChamberDetailsModal
          visible={showChamberModal}
          name={jointName}
          notes={notes}
          details={chamberDetails}
          onChangeName={setJointName}
          onChangeNotes={setNotes}
          onChange={setChamberDetails}
          onSave={() => {
            setShowChamberModal(false);
            if (editingAssetId) {
              handleSaveEdits();
            } else {
              handleSaveJoint();
            }
          }}
          onCancel={resetEditor}
        />
      </div>


      <button
        onClick={() => setLayersOpen((open) => !open)}
        style={{
          position: "absolute",
          top: 16,
          right: 16,
          zIndex: 1100,
          background: "#2563eb",
          color: "white",
          border: "none",
          borderRadius: 8,
          padding: "0.55rem 0.8rem",
          fontWeight: 700,
          cursor: "pointer",
          boxShadow: "0 8px 20px rgba(0,0,0,0.3)",
        }}
      >
        Layers
      </button>

      {layersOpen && (
        <LayersPanel
          visibleLayers={visibleLayers}
          setVisibleLayers={setVisibleLayers}
          basemap={basemap}
          setBasemap={setBasemap}
          roadOverlayVisible={roadOverlayVisible}
          setRoadOverlayVisible={setRoadOverlayVisible}
          snapEnabled={snapEnabled}
          setSnapEnabled={setSnapEnabled}
        />
      )}
    </div>
  );
}

const panel: React.CSSProperties = {
  padding: "1rem",
  display: "flex",
  flexDirection: "column",
  gap: "1rem",
  borderRight: "1px solid #374151",
};

const card: React.CSSProperties = {
  background: "#374151",
  padding: "1rem",
  borderRadius: 10,
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const label: React.CSSProperties = {
  fontSize: "0.9rem",
  fontWeight: 600,
};

const input: React.CSSProperties = {
  padding: "0.5rem",
  borderRadius: 6,
  border: "1px solid #4b5563",
  background: "#111827",
  color: "white",
  width: "100%",
  boxSizing: "border-box",
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "none",
};

const btnSecondary: React.CSSProperties = {
  background: "#374151",
  color: "white",
  padding: "0.5rem",
  borderRadius: 6,
  cursor: "pointer",
  border: "1px solid #4b5563",
};

const layerRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  fontSize: "0.95rem",
};