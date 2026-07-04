import { useEffect, useMemo, useState } from "react";

export type DeviceLayoutKind =
  | "smallPhone"
  | "largePhone"
  | "tabletPortrait"
  | "tabletLandscape"
  | "laptop"
  | "desktop";

export type DeviceLayout = {
  width: number;
  height: number;
  orientation: "portrait" | "landscape";
  layout: DeviceLayoutKind;
  isSmallPhone: boolean;
  isLargePhone: boolean;
  isMobile: boolean;
  isTabletPortrait: boolean;
  isTabletLandscape: boolean;
  isTablet: boolean;
  isLaptop: boolean;
  isDesktop: boolean;
  isTouchLayout: boolean;
  isShortViewport: boolean;
};

function getWindowSize(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 1200, height: 800 };
  return { width: window.innerWidth, height: window.innerHeight };
}

function hasCoarsePointer(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(pointer: coarse)").matches;
}

function getLayoutKind(width: number): DeviceLayoutKind {
  if (width < 390) return "smallPhone";
  if (width < 640) return "largePhone";
  if (width < 900) return "tabletPortrait";
  if (width < 1180) return "tabletLandscape";
  if (width < 1440) return "laptop";
  return "desktop";
}

export function useDeviceLayout(): DeviceLayout {
  const [size, setSize] = useState(getWindowSize);

  useEffect(() => {
    const update = () => setSize(getWindowSize());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return useMemo(() => {
    const layout = getLayoutKind(size.width);
    const orientation = size.height >= size.width ? "portrait" : "landscape";
    const isSmallPhone = layout === "smallPhone";
    const isLargePhone = layout === "largePhone";
    const isTabletPortrait = layout === "tabletPortrait";
    const isTabletLandscape = layout === "tabletLandscape";
    const isLaptop = layout === "laptop";
    const isDesktop = layout === "desktop" || layout === "laptop";
    const isPhoneLandscape =
      orientation === "landscape" && hasCoarsePointer() && size.height < 640;
    const isMobile = isSmallPhone || isLargePhone || isPhoneLandscape;
    const isTablet = isTabletPortrait || isTabletLandscape;

    return {
      width: size.width,
      height: size.height,
      orientation,
      layout,
      isSmallPhone,
      isLargePhone,
      isMobile,
      isTabletPortrait,
      isTabletLandscape,
      isTablet,
      isLaptop,
      isDesktop,
      isTouchLayout: isMobile || isTablet || hasCoarsePointer(),
      isShortViewport: size.height < 680,
    };
  }, [size]);
}
