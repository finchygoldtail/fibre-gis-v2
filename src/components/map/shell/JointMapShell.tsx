import React from "react";

type JointMapShellProps = {
  topBar?: React.ReactNode;
  map: React.ReactNode;
  sidebar?: React.ReactNode;
  overlays?: React.ReactNode;
  modals?: React.ReactNode;
};

export default function JointMapShell({
  topBar,
  map,
  sidebar,
  overlays,
  modals,
}: JointMapShellProps) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      {map}
      {topBar}
      {sidebar}
      {overlays}
      {modals}
    </div>
  );
}
