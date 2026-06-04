import React from "react";

type MapSidebarControllerProps = {
  visible: boolean;
  children: React.ReactNode;
};

export default function MapSidebarController({ visible, children }: MapSidebarControllerProps) {
  if (!visible) return null;
  return <>{children}</>;
}
