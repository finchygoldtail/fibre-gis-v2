import React from "react";
import WorkspaceOverview from "./WorkspaceOverview";
import WorkspaceTopology from "./WorkspaceTopology";
import WorkspaceQA from "./WorkspaceQA";
import WorkspaceBuild from "./WorkspaceBuild";
import WorkspaceMaintenance from "./WorkspaceMaintenance";
import WorkspaceAssets from "./WorkspaceAssets";
import WorkspaceFibre from "./WorkspaceFibre";
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
  onOpenPanel?: (panel: string, tab?: string) => void;
  onOpenTrace?: () => void;
  onOpenQA?: () => void;
  onOpenFibreTopology?: () => void;
  onExport?: () => void;
  onBackToMap?: () => void;
};

export default function WorkspaceTabContent(props: Props) {
  switch (props.activeTab) {
    case "topology": return <WorkspaceTopology {...props} />;
    case "qa": return <WorkspaceQA {...props} />;
    case "build": return <WorkspaceBuild {...props} />;
    case "maintenance": return <WorkspaceMaintenance {...props} />;
    case "assets": return <WorkspaceAssets {...props} />;
    case "fibre": return <WorkspaceFibre {...props} />;
    case "reports": return <WorkspaceReports {...props} />;
    case "overview":
    default:
      return <WorkspaceOverview {...props} />;
  }
}
