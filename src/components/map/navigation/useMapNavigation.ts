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

function getRouteLengthMeters(points: [number, number][]): number {
  return points.reduce((total, point, index) => {
    const previous = points[index - 1];
    if (!previous) return total;
    return total + Leaflet.latLng(previous[0], previous[1]).distanceTo(Leaflet.latLng(point[0], point[1]));
  }, 0);
}

function getCableFrameMaxZoom(points: [number, number][]): number {
  const routeLength = getRouteLengthMeters(points);

  if (routeLength >= 1000) return 14;
  if (routeLength >= 400) return 15;
  if (routeLength >= 150) return 16;
  return 18;
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
        const points = (asset.geometry.coordinates || []) as [number, number][];
        if (points.length === 0) return;

        mapRef.current?.fitBounds(Leaflet.latLngBounds(points), {
          padding: [120, 120],
          maxZoom: getCableFrameMaxZoom(points),
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
