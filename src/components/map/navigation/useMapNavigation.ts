import { useCallback } from "react";
import Leaflet from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import { saveMapView } from "../mapViewMemory";
import type { SavedMapAsset } from "../types";

type UseMapNavigationArgs = {
  mapRef: { current: LeafletMap | null };
  activeProjectIdRef: { current: string | null };
  setActiveProjectId: (projectId: string) => void;
  projectAreas: SavedMapAsset[];
};

const MIN_USEFUL_CABLE_FIT_ZOOM = 14;
const LONG_CABLE_FOCUS_ZOOM = 17;

function getClosestLinePoint(
  points: [number, number][],
  target: { lat: number; lng: number },
): [number, number] | null {
  if (!points.length) return null;

  return points.reduce<[number, number] | null>((closest, point) => {
    if (!closest) return point;

    const pointDistance =
      Math.abs(point[0] - target.lat) + Math.abs(point[1] - target.lng);
    const closestDistance =
      Math.abs(closest[0] - target.lat) + Math.abs(closest[1] - target.lng);

    return pointDistance < closestDistance ? point : closest;
  }, null);
}

export function useMapNavigation({
  mapRef,
  activeProjectIdRef,
  setActiveProjectId,
  projectAreas,
}: UseMapNavigationArgs) {
  const handleSelectProject = useCallback(
    (projectId: string) => {
      activeProjectIdRef.current = projectId;
      setActiveProjectId(projectId);
      saveMapView({ activeProjectId: projectId });

      const project = projectAreas.find((area) => area.id === projectId);
      if (!project || project.geometry?.type !== "Polygon") return;

      const points = project.geometry.coordinates[0];
      if (!points?.length) return;

      const bounds = Leaflet.latLngBounds(
        points.map(([lat, lng]) => [lat, lng] as [number, number]),
      );

      mapRef.current?.fitBounds(bounds, {
        padding: [60, 60],
        maxZoom: 18,
      });
    },
    [activeProjectIdRef, mapRef, projectAreas, setActiveProjectId],
  );

  const handleZoomToAsset = useCallback(
    (asset: SavedMapAsset) => {
      if (!asset.geometry) return;

      if (asset.geometry.type === "Point") {
        mapRef.current?.setView(asset.geometry.coordinates as [number, number], 19);
        return;
      }

      if (asset.geometry.type === "LineString") {
        const map = mapRef.current;
        const points = (asset.geometry.coordinates || []) as [number, number][];
        if (!map || points.length === 0) return;

        const bounds = Leaflet.latLngBounds(points);
        const fitZoom = map.getBoundsZoom(bounds, false, [60, 60]);

        if (fitZoom < MIN_USEFUL_CABLE_FIT_ZOOM) {
          const focusPoint =
            getClosestLinePoint(points, map.getCenter()) || points[0];
          map.setView(focusPoint, Math.max(map.getZoom(), LONG_CABLE_FOCUS_ZOOM), {
            animate: false,
          });
          return;
        }

        map.fitBounds(bounds, {
          padding: [60, 60],
          maxZoom: 19,
          animate: false,
        });
        return;
      }

      if (asset.geometry.type === "Polygon") {
        const points = (asset.geometry.coordinates?.[0] || []) as [number, number][];
        if (points.length === 0) return;

        mapRef.current?.fitBounds(Leaflet.latLngBounds(points), {
          padding: [60, 60],
          maxZoom: 19,
        });
      }
    },
    [mapRef],
  );

  return { handleSelectProject, handleZoomToAsset };
}
