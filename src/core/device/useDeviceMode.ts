import { useEffect, useMemo, useState } from "react";

export type DeviceMode = "mobile" | "tablet" | "desktop";

export type DeviceModeState = {
  mode: DeviceMode;
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouchPreferred: boolean;
};

const MOBILE_MAX_WIDTH = 767;
const TABLET_MAX_WIDTH = 1199;

function readViewport() {
  if (typeof window === "undefined") {
    return { width: 1200, height: 800 };
  }

  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

function prefersTouch(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia("(pointer: coarse)").matches;
}

export function getDeviceMode(width: number): DeviceMode {
  if (width <= MOBILE_MAX_WIDTH) return "mobile";
  if (width <= TABLET_MAX_WIDTH) return "tablet";
  return "desktop";
}

export function useDeviceMode(): DeviceModeState {
  const [viewport, setViewport] = useState(readViewport);

  useEffect(() => {
    const updateViewport = () => setViewport(readViewport());

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  return useMemo(() => {
    const mode = getDeviceMode(viewport.width);
    const orientation = viewport.height >= viewport.width ? "portrait" : "landscape";

    return {
      mode,
      width: viewport.width,
      height: viewport.height,
      orientation,
      isMobile: mode === "mobile",
      isTablet: mode === "tablet",
      isDesktop: mode === "desktop",
      isTouchPreferred: mode !== "desktop" || prefersTouch(),
    };
  }, [viewport]);
}
