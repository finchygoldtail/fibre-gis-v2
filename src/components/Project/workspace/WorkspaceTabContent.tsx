import React from "react";
import WorkspaceOverview from "./WorkspaceOverview";
import WorkspaceQA from "./WorkspaceQA";
import WorkspaceBuild from "./WorkspaceBuild";
import WorkspaceAssets from "./WorkspaceAssets";
import WorkspaceReports from "./WorkspaceReports";

type Props = {
  activeTab: string;
  projectName: string;
  status?: string;
  stats: any;
  projectAssets: any[];
  projectArea?: any;
  auditIssues?: any[];
  disconnectedAssets?: any[];
  networkGraph?: any;
  managerAreaPoints?: { lat: number; lng: number }[];
  isManagerAreaDrawing?: boolean;
  areaDistributionPoints?: any[];
  onStartManagerAreaDrawing?: () => void;
  onStopManagerAreaDrawing?: () => void;
  onClearManagerAreaDrawing?: () => void;
  onBulkUpdateDpStatus?: (args: {
    assetIds: string[];
    status: "Live" | "BWIP" | "Unserviceable" | "Live not ready for service";
    note: string;
  }) => void;
  onBulkUpdateCablePiaNoi?: (args: {
    assetIds: string[];
    piaNoiNumber: string;
    note: string;
  }) => void | Promise<void>;
  onBulkUpdateJointInstallMethod?: (args: {
    assetIds: string[];
    installMethod: "Underground" | "Overhead";
    note: string;
  }) => void | Promise<void>;
  onClearDpFibreAllocations?: () => void;
  onApplyAddressSheetAssignments?: (request: any) => void | Promise<void>;
  onApplySbRouteAssignments?: (request: any) => void | Promise<void>;
  onSelectAsset?: (asset: any) => void;
  onOpenJointEditor?: (asset: any) => void;
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
  onResolveDuplicateHomes?: (request: any) => void;
};

export default function WorkspaceTabContent(props: Props) {
  switch (props.activeTab) {
    case "qa": return <WorkspaceQA {...props} />;
    case "build": return <WorkspaceBuild {...props} />;
    case "assets": return <WorkspaceAssets {...props} />;
    case "reports": return <WorkspaceReports {...props} />;
    case "overview":
    default:
      return <WorkspaceOverview {...props} />;
  }
}
