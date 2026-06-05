import { useEffect, useMemo, useState } from "react";

export type DeviceLayout = {
  width: number;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
};

function getWindowWidth(): number {
  if (typeof window === "undefined") return 1200;
  return window.innerWidth;
}

export function useDeviceLayout(): DeviceLayout {
  const [width, setWidth] = useState(getWindowWidth);

  useEffect(() => {
    const update = () => setWidth(getWindowWidth());
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return useMemo(
    () => ({
      width,
      isMobile: width < 600,
      isTablet: width >= 600 && width < 1024,
      isDesktop: width >= 1024,
    }),
    [width],
  );
}
