import type { AssetType, SavedMapAsset } from "../types";
import {
  DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
  inferTelecomAssetTypeFromName,
  isTelecomDistributionPointName,
  normaliseDistributionPointAsset,
} from "../../../services/assetNameValidation";

type MarkAssetForLiveSync = (asset: SavedMapAsset, isNew?: boolean) => SavedMapAsset;

type CreatePiaOverlayAssetsOptions = {
  savedJoints: SavedMapAsset[];
  markAssetForLiveSync: MarkAssetForLiveSync;
};

type CreateMapAssetsFromAnyGeoJsonOptions = {
  activeProjectId: string | null;
  markAssetForLiveSync: MarkAssetForLiveSync;
  /**
   * Optional active project polygon. When present, home imports are clipped
   * during conversion so large city-wide UPRN files do not create hundreds
   * of thousands of in-memory home assets before filtering.
   */
  activeProjectArea?: SavedMapAsset | null;
};

const normalisePiaGeoJsonCoordinate = (
  coord: any,
): [number, number] | null => {
  if (!Array.isArray(coord) || coord.length < 2) return null;

  const x = Number(coord[0]);
  const y = Number(coord[1]);

  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  // Normal GeoJSON WGS84 is [lng, lat].
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) {
    return [y, x];
  }

  // Many QGIS/KML exports arrive as EPSG:3857 Web Mercator metres.
  // Example from the user's PIA file: x=-168793, y=7087372.
  if (Math.abs(x) <= 20037508.34 && Math.abs(y) <= 20037508.34) {
    const earthRadius = 6378137;
    const lng = (x / earthRadius) * (180 / Math.PI);
    const lat =
      (2 * Math.atan(Math.exp(y / earthRadius)) - Math.PI / 2) *
      (180 / Math.PI);

    if (
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      return [lat, lng];
    }
  }

  return null;
};

export const createPiaOverlayAssetsFromGeoJson = (
  geojson: any,
  options: CreatePiaOverlayAssetsOptions,
): SavedMapAsset[] => {
  const { savedJoints, markAssetForLiveSync } = options;
  if (!geojson?.features || !Array.isArray(geojson.features)) {
    throw new Error("Invalid GeoJSON FeatureCollection");
  }

  const existingPiaKeys = new Set(
    savedJoints
      .filter(
        (asset) => String((asset as any).source || "") === "pia-overlay",
      )
      .map((asset) =>
        String((asset as any).piaRef || asset.name || asset.id || "").trim(),
      )
      .filter(Boolean),
  );

  return geojson.features
    .map((feature: any, index: number) => {
      if (feature?.geometry?.type !== "LineString") return null;
      if (!Array.isArray(feature.geometry.coordinates)) return null;

      const coords = feature.geometry.coordinates
        .map((coord: any) => normalisePiaGeoJsonCoordinate(coord))
        .filter(Boolean) as [number, number][];

      if (coords.length < 2) return null;

      const props = feature.properties || {};
      const rawName = String(
        props.Name ||
          props.name ||
          props.id ||
          feature.id ||
          `PIA Route ${index + 1}`,
      ).trim();

      const description = String(
        props.description || props.Description || "",
      ).trim();
      const lowerName = rawName.toLowerCase();
      const lowerDescription = description.toLowerCase();

      const piaKind =
        lowerName.includes("trnch") || lowerDescription.includes("trench")
          ? "trench"
          : lowerName.includes("cnd") || lowerDescription.includes("duct")
            ? "duct"
            : "route";

      const piaKey = rawName || `${piaKind}-${index + 1}`;

      // if (existingPiaKeys.has(piaKey)) return null;
      existingPiaKeys.add(piaKey);

      return markAssetForLiveSync(
        {
          id: `pia-${crypto.randomUUID()}`,
          name: rawName || `PIA Route ${index + 1}`,
          assetType: "pia-route",
          jointType: "PIA Route",
          source: "pia-overlay",
          cableType: "PIA Overlay",
          installMethod: "Underground",
          notes: description,
          status: "Live",
          piaRef: piaKey,
          piaKind,
          piaProperties: props,
          geometry: {
            type: "LineString",
            coordinates: coords,
          },
        } as SavedMapAsset,
        true,
      );
    })
    .filter(Boolean) as SavedMapAsset[];
};

const readGeoJsonProp = (
  props: any,
  keys: string[],
  fallback = "",
): string => {
  for (const key of keys) {
    const value = props?.[key];
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return String(value).trim();
    }
  }
  return fallback;
};

const buildGeoJsonAssetText = (feature: any): string => {
  const props = feature?.properties || {};
  return [
    props.assetType,
    props.jointType,
    props.type,
    props.category,
    props.class,
    props.name,
    props.Name,
    props.id,
    props.dpType,
    props.chamberType,
    props.cableType,
    props.description,
    props.Description,
    feature?.geometry?.type,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
};

const getOpenreachFeatureName = (feature: any): string => {
  const props = feature?.properties || {};
  return String(
    props.Name ||
      props.name ||
      props.ref ||
      props.Ref ||
      props.id ||
      props.ID ||
      feature?.id ||
      "",
  )
    .trim()
    .toUpperCase();
};

const getOpenreachFeatureDescription = (feature: any): string => {
  const props = feature?.properties || {};
  return String(props.description || props.Description || props.notes || props.Notes || "")
    .trim()
    .toUpperCase();
};

const isOpenreachPoleFeature = (feature: any): boolean => {
  const name = getOpenreachFeatureName(feature);
  const text = `${name} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`.toUpperCase();
  return (
    name.startsWith("POL:") ||
    name.startsWith("MP:") ||
    name.startsWith("POLE:") ||
    text.includes("MISSING POLE") ||
    text.includes(" POLE") ||
    text.includes("OR POLE")
  );
};

const isOpenreachChamberFeature = (feature: any): boolean => {
  const name = getOpenreachFeatureName(feature);
  const text = `${name} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`.toUpperCase();
  return (
    name.startsWith("JC:") ||
    name.startsWith("JNT:") ||
    name.startsWith("CH:") ||
    name.startsWith("CHAMBER:") ||
    text.includes(" CHAMBER") ||
    text.includes("JOINT CHAMBER") ||
    text.includes("JBF") ||
    text.includes("JB")
  );
};

const isOpenreachRouteFeature = (feature: any): boolean => {
  const name = getOpenreachFeatureName(feature);
  const text = `${name} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`;
  return (
    name.startsWith("OSP:") ||
    text.includes("OSP:TRNCH") ||
    text.includes("TRNCH") ||
    text.includes("TRENCH") ||
    text.includes("OSP:CND") ||
    text.includes("CND") ||
    text.includes("DUCT") ||
    text.includes("SPAN") ||
    text.includes("OVERHEAD") ||
    text.includes("PIA") ||
    text.includes("OPENREACH")
  );
};

const classifyGeoJsonFeature = (
  feature: any,
): AssetType | "pia-route" | "home" | "area" | "cable" => {
  const geometryType = String(feature?.geometry?.type || "");
  const text = buildGeoJsonAssetText(feature);
  const props = feature?.properties || {};
  const propKeys = Object.keys(props).join(" ").toLowerCase();
  const hasClosurePortFields =
    geometryType === "Point" &&
    (Object.prototype.hasOwnProperty.call(props, "ports_count") ||
      Object.prototype.hasOwnProperty.call(props, "slots_count") ||
      Object.prototype.hasOwnProperty.call(props, "portsCount") ||
      Object.prototype.hasOwnProperty.call(props, "slotsCount"));

  if (geometryType.includes("Polygon")) return "area";

  // Openreach KML/QGIS exports often use short asset prefixes in Name:
  //   POL:* = pole, JC:* / CH:* = joint chamber, OSP:* = duct/trench/span.
  // Do this before the generic Point fallback, otherwise POL:DATA points
  // become distribution-points and render as black DP squares.
  if (geometryType === "Point" && isOpenreachPoleFeature(feature)) {
    return "pole" as AssetType;
  }

  if (geometryType === "Point" && isOpenreachChamberFeature(feature)) {
    return "chamber" as AssetType;
  }

  if (geometryType.includes("LineString") && isOpenreachRouteFeature(feature)) {
    return "pia-route";
  }

  // UPRN home GeoJSON often stores the useful clue in the FIELD NAME
  // e.g. { UPRN: "123..." }, not in the field value. The old logic only
  // searched values, so 300k Bradford UPRN points were being imported as DPs.
  if (
    geometryType === "Point" &&
    (propKeys.includes("uprn") ||
      propKeys.includes("udprn") ||
      propKeys.includes("toid") ||
      (!hasClosurePortFields &&
        (text.includes("uprn") ||
          text.includes("home") ||
          text.includes("premise") ||
          text.includes("building") ||
          text.includes("residential"))))
  ) {
    return "home";
  }

  if (
    text.includes("pia") ||
    text.includes("openreach") ||
    text.includes("osp:trnch") ||
    text.includes("trnch") ||
    text.includes("osp:cnd") ||
    text.includes("duct") ||
    text.includes("trench")
  ) {
    return "pia-route";
  }

  if (geometryType.includes("LineString")) return "cable";

  if (
    text.includes("street cab") ||
    text.includes("streetcab") ||
    text.includes("cabinet") ||
    text.includes("cab")
  ) {
    return "street-cab" as AssetType;
  }

  if (
    text.includes("chamber") ||
    text.includes("fw2") ||
    text.includes("fw4") ||
    text.includes("fw6") ||
    text.includes("fw10")
  ) {
    return "chamber" as AssetType;
  }

  if (text.includes("pole")) return "pole" as AssetType;

  if (geometryType === "Point") {
    const telecomType = inferTelecomAssetTypeFromName(text);
    if (telecomType) return telecomType;
  }

  if (
    text.includes("distribution") ||
    text.includes(" dp") ||
    text.startsWith("dp") ||
    text.includes(" afn") ||
    text.startsWith("afn") ||
    text.includes(" cbt") ||
    text.startsWith("cbt") ||
    // QGIS closure exports can have names like BA-POG-AG4-SB50 in the
    // description field, with no explicit asset type. Treat SB references as DPs
    // before checking for AG, otherwise AG4 makes them import as AG joints.
    isTelecomDistributionPointName(text) ||
    // Some closure exports identify DPs only by telecom closure fields.
    hasClosurePortFields
  ) {
    return "distribution-point" as AssetType;
  }

  if (text.includes("exchange")) return "exchange" as AssetType;
  if (text.includes("lmj") || text.includes("cmj") || text.includes("ag"))
    return "ag-joint" as AssetType;

  return geometryType === "Point"
    ? ("distribution-point" as AssetType)
    : "cable";
};

const convertGeoJsonPoint = (coordinates: any): [number, number] | null => {
  return normalisePiaGeoJsonCoordinate(coordinates);
};

const convertGeoJsonLine = (coordinates: any): [number, number][] => {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((coord: any) => normalisePiaGeoJsonCoordinate(coord))
    .filter(Boolean) as [number, number][];
};

const convertGeoJsonPolygon = (coordinates: any): [number, number][][] => {
  if (!Array.isArray(coordinates)) return [];
  return coordinates
    .map((ring: any) => convertGeoJsonLine(ring))
    .filter((ring: [number, number][]) => ring.length >= 3);
};

const DEFAULT_HOME_IMPORT_PADDING_METERS = 30;

function metersToDegreesLat(meters: number): number {
  return meters / 111_320;
}

function metersToDegreesLng(meters: number, latitude: number): number {
  const safeCos = Math.max(Math.cos((latitude * Math.PI) / 180), 0.01);
  return meters / (111_320 * safeCos);
}

function getLatLngPolygonBounds(points: [number, number][]) {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;

  points.forEach(([lat, lng]) => {
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
  });

  const centreLat = (minLat + maxLat) / 2;
  const latPad = metersToDegreesLat(DEFAULT_HOME_IMPORT_PADDING_METERS);
  const lngPad = metersToDegreesLng(DEFAULT_HOME_IMPORT_PADDING_METERS, centreLat);

  return {
    minLat: minLat - latPad,
    maxLat: maxLat + latPad,
    minLng: minLng - lngPad,
    maxLng: maxLng + lngPad,
  };
}

function pointInLatLngBounds(point: [number, number], bounds: ReturnType<typeof getLatLngPolygonBounds>): boolean {
  const [lat, lng] = point;
  return lat >= bounds.minLat && lat <= bounds.maxLat && lng >= bounds.minLng && lng <= bounds.maxLng;
}

function pointInLatLngPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [pointLat, pointLng] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [latI, lngI] = polygon[i];
    const [latJ, lngJ] = polygon[j];

    const intersects =
      latI > pointLat !== latJ > pointLat &&
      pointLng < ((lngJ - lngI) * (pointLat - latI)) / ((latJ - latI) || Number.EPSILON) + lngI;

    if (intersects) inside = !inside;
  }

  return inside;
}

function getActiveProjectAreaPolygon(area?: SavedMapAsset | null): [number, number][] | null {
  const geometry = (area as any)?.geometry;
  if (geometry?.type !== "Polygon" || !Array.isArray(geometry.coordinates)) return null;

  const ring = geometry.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;

  return ring
    .map((coord: any) => {
      if (!Array.isArray(coord) || coord.length < 2) return null;
      const lat = Number(coord[0]);
      const lng = Number(coord[1]);
      return Number.isFinite(lat) && Number.isFinite(lng) ? ([lat, lng] as [number, number]) : null;
    })
    .filter(Boolean) as [number, number][];
}

function homePointTouchesActiveProjectArea(
  point: [number, number],
  polygon: [number, number][] | null,
  bounds: ReturnType<typeof getLatLngPolygonBounds> | null,
): boolean {
  if (!polygon || !bounds) return true;
  return pointInLatLngBounds(point, bounds) && pointInLatLngPolygon(point, polygon);
}

const buildImportedAssetBase = (
  feature: any,
  index: number,
  importKind: string,
  activeProjectId: string | null,
) => {
  const props = feature?.properties || {};
  const existingId = readGeoJsonProp(props, [
    "id",
    "ID",
    "assetId",
    "AssetId",
  ]);
  const name = readGeoJsonProp(
  props,
  [
    "ag_code",
    "AG_CODE",
    "fibrehood_code",
    "FIBREHOOD_CODE",
    "fibrehood_name",
    "FIBREHOOD_NAME",
    "name",
    "Name",
    "label",
    "Label",
    "ref",
    "Ref",
    // QGIS closure files commonly store the usable DP label here.
    "description",
    "Description",
    "id",
    "ID",
  ],
  `Imported ${importKind} ${index + 1}`,
);

  return {
    id: existingId
      ? `${importKind}-${existingId}`
      : `${importKind}-${crypto.randomUUID()}`,
    name,
    notes: readGeoJsonProp(props, [
      "notes",
      "Notes",
      "description",
      "Description",
    ]),
    status: readGeoJsonProp(props, ["status", "Status"], "Planned"),
    source: readGeoJsonProp(props, ["source", "Source"], "geojson-import"),
    importedProperties: props,
    projectId: activeProjectId || undefined,
  };
};

export const createMapAssetsFromAnyGeoJson = (
  geojson: any,
  options: CreateMapAssetsFromAnyGeoJsonOptions,
) => {
  const { activeProjectId, markAssetForLiveSync, activeProjectArea } = options;
  if (!geojson?.features || !Array.isArray(geojson.features)) {
    throw new Error("Invalid GeoJSON FeatureCollection");
  }

  const networkAssets: SavedMapAsset[] = [];
  const homeAssets: SavedMapAsset[] = [];
  const counts: Record<string, number> = {};
  const activeHomeImportPolygon = getActiveProjectAreaPolygon(activeProjectArea);
  const activeHomeImportBounds = activeHomeImportPolygon
    ? getLatLngPolygonBounds(activeHomeImportPolygon)
    : null;

  geojson.features.forEach((feature: any, index: number) => {
    const geometryType = String(feature?.geometry?.type || "");
    const props = feature?.properties || {};
    const classifiedType = classifyGeoJsonFeature(feature);
    counts[classifiedType] = (counts[classifiedType] || 0) + 1;

    if (classifiedType === "home") {
      if (geometryType !== "Point") return;
      const point = convertGeoJsonPoint(feature.geometry.coordinates);
      if (!point) return;

      // Critical performance guard: city-wide UPRN files can contain hundreds
      // of thousands of homes. Clip them to the selected project polygon before
      // creating SavedMapAsset objects, otherwise the browser can lock up.
      if (!homePointTouchesActiveProjectArea(point, activeHomeImportPolygon, activeHomeImportBounds)) {
        return;
      }

      const rawUprn = readGeoJsonProp(props, [
        "UPRN",
        "uprn",
        "Uprn",
        "id",
        "ID",
      ]);
      const id = rawUprn ? `uprn-${rawUprn}` : `home-${crypto.randomUUID()}`;
      homeAssets.push(
        markAssetForLiveSync(
          {
            id,
            name: rawUprn
              ? `UPRN ${rawUprn}`
              : readGeoJsonProp(props, ["name", "Name"], "Home"),
            assetType: "home",
            jointType: "Home",
            uprn: rawUprn || undefined,
            projectId: activeProjectId || undefined,
            connectionMode: "auto",
            notes: readGeoJsonProp(props, [
              "notes",
              "Notes",
              "description",
              "Description",
            ]),
            importedProperties: props,
            geometry: {
              type: "Point",
              coordinates: point,
            },
          } as SavedMapAsset,
          true,
        ),
      );
      return;
    }

    if (classifiedType === "pia-route") {
      const makePiaAsset = (coords: [number, number][], lineIndex?: number) => {
        if (coords.length < 2) return;
        const text = `${getOpenreachFeatureName(feature)} ${getOpenreachFeatureDescription(feature)} ${buildGeoJsonAssetText(feature)}`.toLowerCase();
        const base = buildImportedAssetBase(feature, index, "pia", activeProjectId);
        networkAssets.push(
          markAssetForLiveSync(
            {
              ...base,
              id: lineIndex !== undefined ? `pia-${crypto.randomUUID()}-${lineIndex + 1}` : `pia-${crypto.randomUUID()}`,
              name: lineIndex !== undefined ? `${base.name} ${lineIndex + 1}` : base.name,
              assetType: "pia-route" as any,
              jointType: "PIA Route",
              readOnly: true,
              source: "openreach",
              isReferenceAsset: true,
              cableType: "PIA Overlay",
              installMethod:
                text.includes("span") || text.includes("overhead")
                  ? "OH"
                  : "Underground",
              piaKind:
                text.includes("trench") || text.includes("trnch")
                  ? "trench"
                  : text.includes("span") || text.includes("overhead")
                    ? "span"
                    : "duct",
              geometry: {
                type: "LineString",
                coordinates: coords,
              },
            } as SavedMapAsset,
            true,
          ),
        );
      };

      if (geometryType === "LineString") {
        makePiaAsset(convertGeoJsonLine(feature.geometry.coordinates));
      }

      if (geometryType === "MultiLineString" && Array.isArray(feature.geometry.coordinates)) {
        feature.geometry.coordinates.forEach((line: any, lineIndex: number) =>
          makePiaAsset(convertGeoJsonLine(line), lineIndex),
        );
      }

      return;
    }

    if (geometryType === "Point") {
      const point = convertGeoJsonPoint(feature.geometry.coordinates);
      if (!point) return;
      const base = buildImportedAssetBase(
        feature,
        index,
        String(classifiedType),
        activeProjectId,
      );
      const isOrPole = classifiedType === "pole" && isOpenreachPoleFeature(feature);
      const isOrChamber =
        classifiedType === "chamber" && isOpenreachChamberFeature(feature);
      const jointType = readGeoJsonProp(
        props,
        ["jointType", "JointType", "type", "Type", "dpType", "DPType"],
        classifiedType === "distribution-point"
          ? "DP"
          : isOrPole
            ? "OR Pole"
            : isOrChamber
              ? "OR Chamber"
              : String(classifiedType),
      );
      const importedDpName =
        classifiedType === "distribution-point"
          ? readGeoJsonProp(
              props,
              [
                "description",
                "Description",
                "name",
                "Name",
                "label",
                "Label",
                "ref",
                "Ref",
              ],
              base.name,
            )
          : base.name;

      networkAssets.push(
        markAssetForLiveSync(
          normaliseDistributionPointAsset({
            ...base,
            name: importedDpName,
            assetType: classifiedType as AssetType,
            jointType,
            source: isOrPole || isOrChamber ? "openreach" : base.source,
            readOnly: isOrPole || isOrChamber ? true : (base as any).readOnly,
            isReferenceAsset: isOrPole || isOrChamber ? true : (base as any).isReferenceAsset,
            poleDetails:
              classifiedType === "pole"
                ? ({ poleType: isOrPole ? "or" : "new" } as any)
                : undefined,
            chamberDetails:
              classifiedType === "chamber"
                ? ({
                    chamberType: readGeoJsonProp(
                      props,
                      ["chamberType", "ChamberType", "type", "Type"],
                      isOrChamber ? "OR Chamber" : "fw2",
                    ),
                  } as any)
                : undefined,
            dpDetails:
              classifiedType === "distribution-point"
                ? ({
                    dpType: jointType || "DP",
                    // QGIS closure exports with SB references are AFN serving DPs by default.
                    // Without this, the editor falls back to CBT.
                    closureType: isTelecomDistributionPointName(importedDpName)
                      ? DEFAULT_DISTRIBUTION_CLOSURE_TYPE
                      : readGeoJsonProp(
                          props,
                          ["closureType", "ClosureType", "closure_type", "Closure_Type"],
                          DEFAULT_DISTRIBUTION_CLOSURE_TYPE,
                        ),
                    dpRole: "serving",
                    connectionsToHomes: Number.isFinite(Number(props.ports_count))
                      ? Number(props.ports_count)
                      : 8,
                    status: base.status,
                    ports: Number.isFinite(Number(props.ports_count))
                      ? Number(props.ports_count)
                      : undefined,
                    slots: Number.isFinite(Number(props.slots_count))
                      ? Number(props.slots_count)
                      : undefined,
                  } as any)
                : undefined,
            geometry: {
              type: "Point",
              coordinates: point,
            },
          } as SavedMapAsset),
          true,
        ),
      );
      return;
    }

    if (geometryType === "LineString") {
      const coords = convertGeoJsonLine(feature.geometry.coordinates);
      if (coords.length < 2) return;
      const base = buildImportedAssetBase(feature, index, "cable", activeProjectId);
      networkAssets.push(
        markAssetForLiveSync(
          {
            ...base,
            assetType: "cable" as AssetType,
            jointType: readGeoJsonProp(
              props,
              ["jointType", "JointType"],
              "Cable",
            ),
            cableType: readGeoJsonProp(
              props,
              ["cableType", "CableType"],
              "Feeder",
            ),
            fibreCount: readGeoJsonProp(
              props,
              ["fibreCount", "FibreCount", "fibres"],
              "",
            ),
            installMethod: readGeoJsonProp(
              props,
              ["installMethod", "InstallMethod"],
              "Underground",
            ),
            geometry: {
              type: "LineString",
              coordinates: coords,
            },
          } as SavedMapAsset,
          true,
        ),
      );
      return;
    }

    if (geometryType === "MultiLineString") {
      if (!Array.isArray(feature.geometry.coordinates)) return;
      feature.geometry.coordinates.forEach((line: any, lineIndex: number) => {
        const coords = convertGeoJsonLine(line);
        if (coords.length < 2) return;
        const base = buildImportedAssetBase(feature, index, "cable", activeProjectId);
        networkAssets.push(
          markAssetForLiveSync(
            {
              ...base,
              id: `${base.id}-${lineIndex + 1}`,
              name: `${base.name} ${lineIndex + 1}`,
              assetType: "cable" as AssetType,
              jointType: "Cable",
              cableType: readGeoJsonProp(
                props,
                ["cableType", "CableType"],
                "Feeder",
              ),
              installMethod: readGeoJsonProp(
                props,
                ["installMethod", "InstallMethod"],
                "Underground",
              ),
              geometry: {
                type: "LineString",
                coordinates: coords,
              },
            } as SavedMapAsset,
            true,
          ),
        );
      });
      return;
    }

    if (geometryType === "Polygon") {
      const rings = convertGeoJsonPolygon(feature.geometry.coordinates);
      if (!rings.length) return;
      networkAssets.push(
        markAssetForLiveSync(
          {
            ...buildImportedAssetBase(feature, index, "area", activeProjectId),
            assetType: "area" as AssetType,
            jointType: "Polygon Area",
            areaLevel: readGeoJsonProp(
              props,
              ["areaLevel", "level", "Level"],
              "L0",
            ),
            geometry: {
              type: "Polygon",
              coordinates: rings,
            },
          } as SavedMapAsset,
          true,
        ),
      );
      return;
    }

    if (geometryType === "MultiPolygon") {
      if (!Array.isArray(feature.geometry.coordinates)) return;
      feature.geometry.coordinates.forEach(
        (polygon: any, polygonIndex: number) => {
          const rings = convertGeoJsonPolygon(polygon);
          if (!rings.length) return;
          const base = buildImportedAssetBase(feature, index, "area", activeProjectId);
          networkAssets.push(
            markAssetForLiveSync(
              {
                ...base,
                id: `${base.id}-${polygonIndex + 1}`,
                // Keep APX / GeoJSON AG labels clean.
                // MultiPolygon parts still get unique IDs, but the display name
                // stays as the metadata value, e.g. BD-WRO-AG1 not BD-WRO-AG1 1.
                name: base.name,
                assetType: "area" as AssetType,
                jointType: "Polygon Area",
                areaLevel: readGeoJsonProp(
                  props,
                  ["areaLevel", "level", "Level"],
                  "L0",
                ),
                geometry: {
                  type: "Polygon",
                  coordinates: rings,
                },
              } as SavedMapAsset,
              true,
            ),
          );
        },
      );
    }
  });

  return { networkAssets, homeAssets, counts };
};
