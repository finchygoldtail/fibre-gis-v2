export type RoutePoint = {
  lat: number;
  lng: number;
};

type FrontageResult = {
  frontage: RoutePoint;
  approach: RoutePoint;
};

function midpoint(a: RoutePoint, b: RoutePoint): RoutePoint {
  return {
    lat: (a.lat + b.lat) / 2,
    lng: (a.lng + b.lng) / 2,
  };
}

function offsetToward(
  from: RoutePoint,
  to: RoutePoint,
  factor = 0.15,
): RoutePoint {
  return {
    lat: from.lat + (to.lat - from.lat) * factor,
    lng: from.lng + (to.lng - from.lng) * factor,
  };
}

function fallbackLine(points: RoutePoint[]): [number, number][] {
  return points.map((point) => [point.lat, point.lng]);
}

/**
 * Creates a simple frontage-style route:
 *
 * DP
 * → frontage approach point
 * → frontage point
 * → home
 *
 * This dramatically reduces spider-web visuals compared
 * to direct centroid routing.
 */
export function generateFrontageRoute(
  start: RoutePoint,
  end: RoutePoint,
): [number, number][] {
  const frontage = midpoint(start, end);

  const approach = offsetToward(start, frontage, 0.75);

  return fallbackLine([
    start,
    approach,
    frontage,
    end,
  ]);
}

export async function routePointsToRoads(
  points: RoutePoint[],
): Promise<[number, number][]> {
  if (points.length < 2) {
    return fallbackLine(points);
  }

  const routed: [number, number][] = [];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];

    const segment = generateFrontageRoute(start, end);

    if (i === 0) {
      routed.push(...segment);
    } else {
      routed.push(...segment.slice(1));
    }
  }

  return routed;
}

export async function routeToRoads(
  start: RoutePoint,
  end: RoutePoint,
): Promise<[number, number][]> {
  return generateFrontageRoute(start, end);
}