export type PointCoordinate = [number, number];

export type PolygonCoordinates = PointCoordinate[];

function normalizePolygonCoordinates(
  polygon: any
): PolygonCoordinates {
  // GeoJSON Polygon
  if (
    Array.isArray(polygon) &&
    Array.isArray(polygon[0]) &&
    Array.isArray(polygon[0][0])
  ) {
    return polygon[0] as PolygonCoordinates;
  }

  // Already flat
  return polygon as PolygonCoordinates;
}

// --------------------------------------------------
// POINT IN POLYGON
// Ray-casting algorithm
// --------------------------------------------------

export function pointInPolygon(
  point: PointCoordinate,
  polygon: any
): boolean {
  const coords = normalizePolygonCoordinates(polygon);

  const x = point[0];
  const y = point[1];

  let inside = false;

  for (
    let i = 0, j = coords.length - 1;
    i < coords.length;
    j = i++
  ) {
    const xi = coords[i][0];
    const yi = coords[i][1];

    const xj = coords[j][0];
    const yj = coords[j][1];

    const intersect =
      yi > y !== yj > y &&
      x <
        ((xj - xi) * (y - yi)) / (yj - yi + 0.0000001) +
          xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

// --------------------------------------------------
// GET ASSETS INSIDE AREA
// --------------------------------------------------

export function getAssetsInArea(
  assets: any[] = [],
  polygon: any
) {
  return assets.filter((asset) => {
    const geometry = asset?.geometry;

    if (!geometry) return false;

    // --------------------------------------------------
    // POINTS
    // --------------------------------------------------

    if (
      geometry.type === "Point" &&
      Array.isArray(geometry.coordinates)
    ) {
      return pointInPolygon(
        geometry.coordinates,
        polygon
      );
    }

    // --------------------------------------------------
    // LINESTRINGS
    // If ANY coordinate touches polygon
    // --------------------------------------------------

    if (
      geometry.type === "LineString" &&
      Array.isArray(geometry.coordinates)
    ) {
      return geometry.coordinates.some((coord: any) =>
        pointInPolygon(coord, polygon)
      );
    }

    // --------------------------------------------------
    // POLYGONS
    // Check first coordinate
    // --------------------------------------------------

    if (
      geometry.type === "Polygon" &&
      Array.isArray(geometry.coordinates?.[0])
    ) {
      const firstCoord =
        geometry.coordinates[0][0];

      if (!firstCoord) return false;

      return pointInPolygon(
        firstCoord,
        polygon
      );
    }

    return false;
  });
}