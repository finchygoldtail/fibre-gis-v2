import type { AuditIssue } from "../../../services/areaAudit";
import type { SavedMapAsset } from "../../map/types";

export type AreaReadinessState =
  | "Survey"
  | "Build"
  | "Testing"
  | "Ready For Service"
  | "Live"
  | "Blocked"
  | "Maintenance Hold";

export type AreaReadiness = {
  state: AreaReadinessState;
  score: number;
  summary: string;
  blockers: string[];
  nextActions: string[];
  qaHigh: number;
  qaMedium: number;
  dpCompletionPercent: number;
  rfsPercent: number;
  disconnectedAssets: number;
};

export type DeliveryPhaseId =
  | "area-identified"
  | "gate-1-area-identified"
  | "completion-survey"
  | "building-job-packs"
  | "ready-for-build"
  | "survey-stage"
  | "build"
  | "customers-live"
  | "pia-ready"
  | "walkoff"
  | "as-builds-complete"
  | "handover"
  | "handed-over";

export type DeliveryPhaseConfig = {
  id: DeliveryPhaseId;
  label: string;
  shortLabel: string;
  gateLabel?: string;
  description: string;
  statusLabel: string;
  allowsCustomerLiveWithoutPia: boolean;
  allowsWalkOffWithoutPia: boolean;
};

export const deliveryPhaseOptions: DeliveryPhaseConfig[] = [
  {
    id: "area-identified",
    label: "Gate 101 - Area Abandoned",
    shortLabel: "Area Abandoned",
    gateLabel: "Gate 101",
    description: "Area is marked as abandoned before progressing through the delivery gates.",
    statusLabel: "Gate 101 - Area Abandoned",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "gate-1-area-identified",
    label: "Gate 1 - Area Identified",
    shortLabel: "Area Identified",
    gateLabel: "Gate 1",
    description: "Gate 1 checkpoint confirming the area boundary and initial commercial intent.",
    statusLabel: "Gate 1 - Area Identified",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "completion-survey",
    label: "Gate 2 - Completion Survey",
    shortLabel: "Completion Survey",
    gateLabel: "Gate 2",
    description: "Survey completion gate before build packs are prepared.",
    statusLabel: "Gate 2 - Completion Survey",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "building-job-packs",
    label: "Gate 3 - Building Job Packs",
    shortLabel: "Building Job Packs",
    gateLabel: "Gate 3",
    description: "Job packs are being prepared for field delivery.",
    statusLabel: "Gate 3 - Building Job Packs",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "ready-for-build",
    label: "Gate 4 - Ready For Build",
    shortLabel: "Ready For Build",
    gateLabel: "Gate 4",
    description: "Build pack and dependencies are ready for construction.",
    statusLabel: "Gate 4 - Ready For Build",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "survey-stage",
    label: "Survey Stage",
    shortLabel: "Survey Stage",
    description: "Survey activity is underway before build starts.",
    statusLabel: "Survey Stage",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "build",
    label: "Build Phase",
    shortLabel: "Build",
    description: "Normal build state. PIA must pass before walk-off.",
    statusLabel: "Build Phase",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "customers-live",
    label: "Customers Live",
    shortLabel: "Customers Live",
    description: "Allows customers to go live while PIA evidence is still being completed.",
    statusLabel: "Customers Live",
    allowsCustomerLiveWithoutPia: true,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "pia-ready",
    label: "PIA Ready",
    shortLabel: "PIA Ready",
    description: "PIA is complete and the area is ready for normal walk-off checks.",
    statusLabel: "PIA Ready",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: false,
  },
  {
    id: "walkoff",
    label: "Walk-Off",
    shortLabel: "Walk-Off",
    description: "Manager override to allow formal walk-off before every PIA item is complete.",
    statusLabel: "Walk-Off",
    allowsCustomerLiveWithoutPia: true,
    allowsWalkOffWithoutPia: true,
  },
  {
    id: "as-builds-complete",
    label: "As-Builts Complete",
    shortLabel: "As-Builts Complete",
    description: "As-built records are complete and ready for handover review.",
    statusLabel: "As-Builts Complete",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: true,
  },
  {
    id: "handover",
    label: "Handover",
    shortLabel: "Handover",
    description: "Area is in final handover review.",
    statusLabel: "Handover",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: true,
  },
  {
    id: "handed-over",
    label: "Handed Over",
    shortLabel: "Handed Over",
    description: "Final delivery handover is complete.",
    statusLabel: "Handed Over",
    allowsCustomerLiveWithoutPia: false,
    allowsWalkOffWithoutPia: true,
  },
];

export function getDeliveryPhaseConfig(id: DeliveryPhaseId): DeliveryPhaseConfig {
  return (
    deliveryPhaseOptions.find((phase) => phase.id === id) ||
    deliveryPhaseOptions[0]
  );
}

function normaliseDeliveryPhase(value: unknown): DeliveryPhaseId | null {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;
  if (text === "area-identified" || text === "area identified")
    return "area-identified";
  if (
    text === "gate-1-area-identified" ||
    text.includes("gate 1") ||
    text.includes("gate 1 - area identified")
  )
    return "gate-1-area-identified";
  if (
    text === "completion-survey" ||
    text === "completion_survey" ||
    text.includes("completion survey") ||
    text.includes("competion survey")
  )
    return "completion-survey";
  if (
    text === "building-job-packs" ||
    text === "building_job_packs" ||
    text.includes("building job packs") ||
    text.includes("job pack")
  )
    return "building-job-packs";
  if (
    text === "ready-for-build" ||
    text === "ready_for_build" ||
    text.includes("ready for build")
  )
    return "ready-for-build";
  if (
    text === "survey-stage" ||
    text === "survey_stage" ||
    text.includes("survey stage") ||
    text === "survey"
  )
    return "survey-stage";
  if (
    text === "as-builds-complete" ||
    text === "as_builts_complete" ||
    text.includes("as builds complete") ||
    text.includes("as-builds complete") ||
    text.includes("as builts complete")
  )
    return "as-builds-complete";
  if (text === "build" || text.includes("build")) return "build";
  if (
    text === "customer-live" ||
    text === "customers-live" ||
    text === "customer_live" ||
    text === "customers_live" ||
    text.includes("customer live") ||
    text.includes("customers live")
  )
    return "customers-live";
  if (text === "pia-ready" || text === "pia_ready" || text.includes("pia ready"))
    return "pia-ready";
  if (
    text === "walkoff" ||
    text === "walkoff-ready" ||
    text === "walk-off-ready" ||
    text === "walkoff_override" ||
    text.includes("walk-off") ||
    text.includes("walkoff")
  )
    return "walkoff";
  if (text === "handover" || text.includes("handover")) return "handover";
  if (
    text === "handed-over" ||
    text === "handed_over" ||
    text.includes("handed over")
  )
    return "handed-over";
  if (text === "complete" || text.includes("complete")) return "handed-over";
  if (text === "live") return "customers-live";
  return null;
}

export function getWorkspaceDeliveryPhase(
  projectArea: SavedMapAsset | null | undefined,
  fallbackStatus?: string,
): DeliveryPhaseId {
  const item = projectArea as any;
  return (
    normaliseDeliveryPhase(item?.deliveryPhase) ||
    normaliseDeliveryPhase(item?.properties?.deliveryPhase) ||
    normaliseDeliveryPhase(item?.phase) ||
    normaliseDeliveryPhase(item?.properties?.phase) ||
    normaliseDeliveryPhase(fallbackStatus) ||
    "area-identified"
  );
}

export function readinessTone(
  state: AreaReadinessState,
): "default" | "good" | "warn" | "bad" {
  if (state === "Live" || state === "Ready For Service") return "good";
  if (state === "Testing" || state === "Build") return "warn";
  if (state === "Blocked" || state === "Maintenance Hold") return "bad";
  return "default";
}

export function readinessColour(state: AreaReadinessState): string {
  if (state === "Live") return "#22c55e";
  if (state === "Ready For Service") return "#4ade80";
  if (state === "Testing") return "#38bdf8";
  if (state === "Build") return "#fbbf24";
  if (state === "Blocked") return "#fb7185";
  if (state === "Maintenance Hold") return "#f97316";
  return "#94a3b8";
}

export function buildAreaReadiness(args: {
  rolloutKpis: {
    homesPassed: number;
    homesLive: number;
    rfsPercent: number;
    dpTotal: number;
    dpLive: number;
    dpBwip: number;
    dpLnrfs: number;
    dpUnserviceable: number;
    dpPlanned: number;
    buildCompletionPercent: number;
    qaIssues: number;
    disconnectedAssets: number;
    dpNearCapacity?: number;
    dpOverCapacity?: number;
  };
  auditIssues: AuditIssue[];
  status?: string;
}): AreaReadiness {
  const { rolloutKpis, auditIssues, status } = args;
  const statusText = String(status || "").toLowerCase();
  const qaHigh = auditIssues.filter(
    (issue) => issue.severity === "high",
  ).length;
  const qaMedium = auditIssues.filter(
    (issue) => issue.severity === "medium",
  ).length;
  const blockers: string[] = [];
  const nextActions: string[] = [];

  if (statusText.includes("maintenance")) {
    blockers.push("Area is currently marked as maintenance / hold.");
  }

  if ((rolloutKpis.dpOverCapacity || 0) > 0) {
    blockers.push(`${rolloutKpis.dpOverCapacity} DP(s) are over capacity.`);
    nextActions.push(
      "Resolve oversubscribed DPs before DP operations handover.",
    );
  }

  if ((rolloutKpis.dpNearCapacity || 0) > 0) {
    nextActions.push(
      `${rolloutKpis.dpNearCapacity} DP(s) are at or near capacity; review splitter/port reserve.`,
    );
  }

  if (rolloutKpis.dpUnserviceable > 0) {
    blockers.push(`${rolloutKpis.dpUnserviceable} DP(s) are unserviceable.`);
    nextActions.push(
      "Clear or reclassify unserviceable DPs before RFS sign-off.",
    );
  }

  if (qaHigh > 0) {
    blockers.push(`${qaHigh} high QA issue(s) need resolving.`);
    nextActions.push("Resolve high severity QA issues.");
  }

  if (rolloutKpis.disconnectedAssets > 0) {
    blockers.push(
      `${rolloutKpis.disconnectedAssets} disconnected asset(s) in topology.`,
    );
    nextActions.push(
      "Fix disconnected assets or confirm they are intentionally isolated.",
    );
  }

  if (rolloutKpis.dpLnrfs > 0) {
    blockers.push(
      `${rolloutKpis.dpLnrfs} DP(s) are live but not ready for service.`,
    );
    nextActions.push("Complete LNRFS checks and move ready DPs to Live.");
  }

  if (rolloutKpis.dpBwip > 0) {
    nextActions.push(
      "Finish BWIP DPs and update live status when build is complete.",
    );
  }

  if (rolloutKpis.dpPlanned > 0) {
    nextActions.push("Progress planned DPs through build and test workflow.");
  }

  if (qaMedium > 0) {
    nextActions.push("Review medium QA issues before handover.");
  }

  const hardBlocked =
    statusText.includes("block") ||
    statusText.includes("hold") ||
    statusText.includes("maintenance") ||
    (rolloutKpis.dpOverCapacity || 0) > 0 ||
    rolloutKpis.dpUnserviceable > 0 ||
    qaHigh > 0 ||
    rolloutKpis.disconnectedAssets > 0;

  let state: AreaReadinessState = "Survey";

  if (statusText.includes("maintenance")) {
    state = "Maintenance Hold";
  } else if (hardBlocked) {
    state = "Blocked";
  } else if (
    rolloutKpis.dpTotal > 0 &&
    rolloutKpis.dpLive === rolloutKpis.dpTotal &&
    rolloutKpis.rfsPercent >= 95
  ) {
    state = "Live";
  } else if (
    rolloutKpis.buildCompletionPercent >= 95 &&
    rolloutKpis.rfsPercent >= 90 &&
    rolloutKpis.dpLnrfs === 0
  ) {
    state = "Ready For Service";
  } else if (
    rolloutKpis.buildCompletionPercent >= 70 ||
    rolloutKpis.rfsPercent >= 70 ||
    rolloutKpis.dpLnrfs > 0
  ) {
    state = "Testing";
  } else if (
    rolloutKpis.dpTotal > 0 ||
    rolloutKpis.dpBwip > 0 ||
    rolloutKpis.buildCompletionPercent > 0
  ) {
    state = "Build";
  }

  const blockerPenalty = Math.min(blockers.length * 12, 45);
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        rolloutKpis.buildCompletionPercent * 0.45 +
          rolloutKpis.rfsPercent * 0.45 +
          (rolloutKpis.dpTotal > 0 ? 10 : 0) -
          blockerPenalty,
      ),
    ),
  );

  if (!nextActions.length) {
    nextActions.push(
      "Area is operationally ready for final review / handover.",
    );
  }

  const summary =
    state === "Live"
      ? "All key rollout indicators show this area as live."
      : state === "Ready For Service"
        ? "Area is ready for RFS review with no hard blockers detected."
        : state === "Testing"
          ? "Build is mostly complete; testing and final QA remain."
          : state === "Build"
            ? "Area is in build with rollout work still in progress."
            : state === "Blocked"
              ? "Area has operational blockers that prevent RFS / live sign-off."
              : state === "Maintenance Hold"
                ? "Area is on maintenance hold."
                : "Area is still in survey / early planning.";

  return {
    state,
    score,
    summary,
    blockers,
    nextActions,
    qaHigh,
    qaMedium,
    dpCompletionPercent: rolloutKpis.buildCompletionPercent,
    rfsPercent: rolloutKpis.rfsPercent,
    disconnectedAssets: rolloutKpis.disconnectedAssets,
  };
}
