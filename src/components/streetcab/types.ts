export type StreetCabPanelType =
  | "96f-panel"
  | "splitter-panel"
  | "link-cable-panel";

export type StreetCabPort = {
  id: string;
  number: number;
  label?: string;
};

export type StreetCabSplitterBlock = {
  id: string;
  number: number;
  input: StreetCabPort;
  outputs: StreetCabPort[];
};

export type StreetCab96FPanel = {
  id: string;
  type: "96f-panel";
  name: string;
  position: number;
  ports: StreetCabPort[];
};

export type StreetCabSplitterPanel = {
  id: string;
  type: "splitter-panel";
  name: string;
  position: number;
  splitters: StreetCabSplitterBlock[];
};

export type StreetCabLinkCablePanel = {
  id: string;
  type: "link-cable-panel";
  name: string;
  position: number;
  ports: StreetCabPort[];
};

export type StreetCabPanel =
  | StreetCab96FPanel
  | StreetCabSplitterPanel
  | StreetCabLinkCablePanel;

export type StreetCabConnection = {
  id: string;
  fromPanelId: string;
  fromPortId: string;
  toPanelId: string;
  toPortId: string;
};

export type StreetCabDetails = {
  cabinetRef?: string;
  status?: string;
  cabinetType?: string;
  photos?: string[];
  documents?: string[];
  panels: StreetCabPanel[];
  connections: StreetCabConnection[];
};