export type RoutePoint = { lat: number; lng: number };

function fallbackLine(points: RoutePoint[]): [number, number][] {
  return points.map((point) => [point.lat, point.lng]);
}

export async function routePointsToRoads(
  points: RoutePoint[]
): Promise<[number, number][]> {
  return fallbackLine(points);
}

export async function routeToRoads(
  start: RoutePoint,
  end: RoutePoint
): Promise<[number, number][]> {
  return routePointsToRoads([start, end]);
}