export type RoutePoint = { lat: number; lng: number };

const OSRM_BASE_URL = "https://router.project-osrm.org/route/v1/driving";

function fallbackLine(points: RoutePoint[]): [number, number][] {
  return points.map((point) => [point.lat, point.lng]);
}

export async function routePointsToRoads(
  points: RoutePoint[]
): Promise<[number, number][]> {
  if (points.length < 2) return fallbackLine(points);

  const coordinates = points
    .map((point) => `${point.lng},${point.lat}`)
    .join(";");

  const url = `${OSRM_BASE_URL}/${coordinates}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`OSRM request failed: ${response.status}`);
    }

    const data = await response.json();
    const route = data?.routes?.[0];
    const routeCoordinates = route?.geometry?.coordinates;

    if (!Array.isArray(routeCoordinates) || routeCoordinates.length === 0) {
      return fallbackLine(points);
    }

    // OSRM returns GeoJSON coordinates as [lng, lat].
    // Leaflet and your app store cable coordinates as [lat, lng].
    return routeCoordinates.map(([lng, lat]: [number, number]) => [lat, lng]);
  } catch (error) {
    console.error("Road routing failed, using straight/manual cable line:", error);
    return fallbackLine(points);
  }
}

export async function routeToRoads(
  start: RoutePoint,
  end: RoutePoint
): Promise<[number, number][]> {
  return routePointsToRoads([start, end]);
}
