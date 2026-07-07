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
  | "build"
  | "customer-live"
  | "pia-ready"
  | "walkoff-ready"
  | "complete";

export type DeliveryPhaseConfig = {
  id: DeliveryPhaseId;
  label: string;
  shortLabel: string;
  description: string;
  statusLabel: string;
  allowsCustomerLiveWithoutPia: boolean;
  allowsWalkOffWithoutPia: boolean;
};

export const deliveryPhaseOptions: DeliveryPhaseConfig[] = [
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
    id: "customer-live",
    label: "Customer Live Override",
    shortLabel: "Customer Live",
    description: "Allows customers to go live while PIA evidence is still being completed.",
    statusLabel: "Customer Live",
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
    id: "walkoff-ready",
    label: "Walk-Off Override",
    shortLabel: "Walk-Off",
    description: "Manager override to allow formal walk-off before every PIA item is complete.",
    statusLabel: "Walk-Off Override",
    allowsCustomerLiveWithoutPia: true,
    allowsWalkOffWithoutPia: true,
  },
  {
    id: "complete",
    label: "Complete",
    shortLabel: "Complete",
    description: "Final commercial and delivery close-out state.",
    statusLabel: "Complete",
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
  if (text === "build" || text.includes("build")) return "build";
  if (
    text === "customer-live" ||
    text === "customer_live" ||
    text.includes("customer live")
  )
    return "customer-live";
  if (text === "pia-ready" || text === "pia_ready" || text.includes("pia ready"))
    return "pia-ready";
  if (
    text === "walkoff-ready" ||
    text === "walk-off-ready" ||
    text === "walkoff_override" ||
    text.includes("walk-off") ||
    text.includes("walkoff")
  )
    return "walkoff-ready";
  if (text === "complete" || text.includes("complete")) return "complete";
  if (text === "live") return "customer-live";
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
    "build"
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
