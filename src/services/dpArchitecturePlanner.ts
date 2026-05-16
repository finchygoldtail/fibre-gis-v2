// =====================================================
// FILE: dpArchitecturePlanner.ts
// PURPOSE: Central DP / CBT / AFN / MDU architecture planner.
//          Keeps fibre planning rules out of large UI files.
//
// IMPORTANT:
// - Does NOT save to Firestore.
// - Does NOT change drop-cable generation.
// - Does NOT change cable route drawing.
// - Does NOT mix CBT terminal logic with passthrough/splitter logic.
// - AFN, MDU and MDU_SPLITTER are allowed on the same passthrough
//   serving chain because they all reserve fibres from a through cable.
// =====================================================

import type { DistributionPointDetails, SavedMapAsset } from "../components/map/types";

export type DistributionArchitecture = "CBT" | "AFN" | "MDU" | "MDU_SPLITTER";

export type DpFibrePlanSeverity = "ok" | "warning" | "error";

export type DpFibrePlan = {
  architecture: DistributionArchitecture;
  connectedHomes: number;
  requiredCustomerOutputs: number;
  capacity: number;
  availableOutputs: number;
  requiredInputFibres: number;
  reservedFibres: number;
  recommendedPortCount: number;
  splitterRatio?: "1:8";
  status: DpFibrePlanSeverity;
  title: string;
  notes: string[];
  warnings: string[];
};

type BuildDpFibrePlanInput = {
  closureType?: DistributionArchitecture | string | null;
  connectedHomes: number;
  currentInputFibres?: number[];
  mduFibres?: number;
  mduSplitterFibres?: number;
};

export type DpFibrePlanAllocation = {
  throughCableId?: string;
  inputFibres?: number[];
  localReservedFibres?: number;
  branchReservedFibres?: number;
  downstreamReservedFibres?: number;
  totalReservedFibres?: number;
};

function normaliseArchitecture(value: unknown): DistributionArchitecture {
  const raw = String(value || "CBT").toUpperCase();
  if (raw === "AFN") return "AFN";
  if (raw === "MDU") return "MDU";
  if (raw === "MDU_SPLITTER") return "MDU_SPLITTER";
  return "CBT";
}

function nextCbtPortSize(homeCount: number): number {
  if (homeCount <= 0) return 4;
  if (homeCount <= 4) return 4;
  if (homeCount <= 8) return 8;
  return 12;
}

function clampCount(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

function architectureFamily(value: DistributionArchitecture): "CBT_TERMINAL" | "PASSTHROUGH_SPLITTER" {
  return value === "CBT" ? "CBT_TERMINAL" : "PASSTHROUGH_SPLITTER";
}

function architecturesCanShareThroughCable(
  a: DistributionArchitecture,
  b: DistributionArchitecture,
): boolean {
  // AFN, MDU and MDU_SPLITTER can share the same through-cable chain.
  // CBT is terminal architecture and must not be mixed into that chain.
  return architectureFamily(a) === architectureFamily(b);
}

export function buildDpFibrePlan(input: BuildDpFibrePlanInput): DpFibrePlan {
  const architecture = normaliseArchitecture(input.closureType);
  const connectedHomes = clampCount(input.connectedHomes);
  const currentInputFibres = (input.currentInputFibres || [])
    .map((fibre) => Number(fibre))
    .filter((fibre) => Number.isFinite(fibre) && fibre > 0);

  if (architecture === "CBT") {
    const recommendedPortCount = nextCbtPortSize(connectedHomes);
    const overCapacity = connectedHomes > 12;
    return {
      architecture,
      connectedHomes,
      requiredCustomerOutputs: connectedHomes,
      capacity: recommendedPortCount,
      availableOutputs: Math.max(0, recommendedPortCount - connectedHomes),
      // CBT architecture remains CBT. Do not convert to AFN just because
      // there are more than 12 homes.
      requiredInputFibres: connectedHomes > 0 ? 1 : 0,
      reservedFibres: connectedHomes > 0 ? 1 : 0,
      recommendedPortCount,
      status: overCapacity ? "error" : "ok",
      title: `${recommendedPortCount}-port CBT plan`,
      notes: [
        "CBT architecture locked: do not mix AFNs into this serving chain.",
        "CBT uses terminal outputs for homes; over 12 homes should be split into another CBT/DP, not changed to AFN automatically.",
      ],
      warnings: overCapacity
        ? [
            `${connectedHomes} homes is over a single 12-port CBT. Split this serving group into multiple CBTs/DPs or change the whole network leg architecture intentionally.`,
          ]
        : [],
    };
  }

  if (architecture === "AFN") {
    const requiredInputFibres = connectedHomes > 0 ? Math.ceil(connectedHomes / 8) : 0;
    const selectedFibres = currentInputFibres.length;
    const capacity = Math.max(requiredInputFibres, selectedFibres) * 8;
    const warnings: string[] = [];

    if (requiredInputFibres > 4) {
      warnings.push(
        `${connectedHomes} homes needs ${requiredInputFibres} AFN input fibres. Current UI limits an AFN to 4 selected fibres, so split the chain or add another AFN.`
      );
    }

    if (selectedFibres > 0 && selectedFibres < requiredInputFibres) {
      warnings.push(
        `Selected fibres only provide ${selectedFibres * 8} outputs. Add ${requiredInputFibres - selectedFibres} more input fibre(s) for the connected homes.`
      );
    }

    return {
      architecture,
      connectedHomes,
      requiredCustomerOutputs: connectedHomes,
      capacity,
      availableOutputs: Math.max(0, capacity - connectedHomes),
      requiredInputFibres,
      reservedFibres: requiredInputFibres,
      recommendedPortCount: capacity,
      splitterRatio: "1:8",
      status: warnings.length ? "warning" : "ok",
      title: `${requiredInputFibres || 0} fibre AFN plan`,
      notes: [
        "AFN architecture locked: passthrough fibre spine remains AFN logic.",
        "Each selected AFN input fibre provides 8 local outputs while remaining fibres continue downstream.",
      ],
      warnings,
    };
  }

  if (architecture === "MDU" || architecture === "MDU_SPLITTER") {
    const directFibres = clampCount(input.mduFibres ?? Math.max(connectedHomes, 6));
    const splitterFibres = architecture === "MDU_SPLITTER" ? clampCount(input.mduSplitterFibres ?? 2) : 0;
    const splitterCapacity = splitterFibres * 8;
    const capacity = architecture === "MDU_SPLITTER" ? directFibres + splitterCapacity : directFibres;
    const reservedFibres = directFibres + splitterFibres;
    const warnings: string[] = [];

    if (connectedHomes > capacity) {
      warnings.push(
        `${connectedHomes} homes exceeds the current MDU capacity of ${capacity}. Increase direct/splitter fibres or split the building feed.`
      );
    }

    return {
      architecture,
      connectedHomes,
      requiredCustomerOutputs: connectedHomes,
      capacity,
      availableOutputs: Math.max(0, capacity - connectedHomes),
      requiredInputFibres: reservedFibres,
      reservedFibres,
      recommendedPortCount: capacity,
      splitterRatio: architecture === "MDU_SPLITTER" ? "1:8" : undefined,
      status: warnings.length ? "warning" : "ok",
      title: architecture === "MDU_SPLITTER" ? "MDU + splitter plan" : "MDU direct-feed plan",
      notes: [
        "MDU architecture locked for building-fed distribution.",
        architecture === "MDU_SPLITTER"
          ? "Direct building fibres and splitter fibres are reserved separately from the through cable."
          : "Direct-feed MDU fibres are reserved from the through cable.",
      ],
      warnings,
    };
  }

  return buildDpFibrePlan({ ...input, closureType: "CBT" });
}

export function applyDpFibrePlanToDetails(
  details: DistributionPointDetails,
  plan: DpFibrePlan,
  allocation?: DpFibrePlanAllocation,
): DistributionPointDetails {
  const next: DistributionPointDetails = {
    ...details,
    closureType: plan.architecture,
    connectionsToHomes: plan.capacity,
    networkArchitecture: plan.architecture,
    autoFibrePlan: {
      connectedHomes: plan.connectedHomes,
      requiredInputFibres: allocation?.localReservedFibres ?? plan.requiredInputFibres,
      branchReservedFibres: allocation?.branchReservedFibres ?? 0,
      downstreamReservedFibres: allocation?.downstreamReservedFibres ?? 0,
      reservedFibres: allocation?.totalReservedFibres ?? plan.reservedFibres,
      capacity: plan.capacity,
      updatedAt: new Date().toISOString(),
    },
  } as DistributionPointDetails;

  if (plan.architecture === "CBT") {
    return {
      ...next,
      afnDetails: undefined,
      mduDetails: undefined,
    };
  }

  if (plan.architecture === "AFN") {
    const existingFibres = allocation?.inputFibres || details.afnDetails?.inputFibres || [];
    return {
      ...next,
      afnDetails: {
        enabled: true,
        throughCableId: allocation?.throughCableId || details.afnDetails?.throughCableId,
        inputFibres: existingFibres,
        fibreCountUsed: allocation?.totalReservedFibres ?? plan.requiredInputFibres,
        splitterRatio: "1:8",
        splitterOutputs: Math.max(8, plan.capacity),
      },
      mduDetails: undefined,
    };
  }

  if (plan.architecture === "MDU" || plan.architecture === "MDU_SPLITTER") {
    const existing = details.mduDetails;
    const mduFibres = existing?.mduFibres || Math.max(plan.connectedHomes, 6);
    const splitterFibres = plan.architecture === "MDU_SPLITTER" ? existing?.splitterFibres || 2 : 0;
    return {
      ...next,
      afnDetails: undefined,
      mduDetails: {
        enabled: true,
        throughCableId: allocation?.throughCableId || existing?.throughCableId,
        mduFibres,
        splitterFibres,
        totalReservedFibres: allocation?.totalReservedFibres ?? (mduFibres + splitterFibres),
        inputFibres: allocation?.inputFibres || existing?.inputFibres || [],
      },
    };
  }

  return next;
}

function assetClosureType(asset: SavedMapAsset | null | undefined): DistributionArchitecture | null {
  const raw = (asset as any)?.dpDetails?.closureType;
  if (!raw) return null;
  return normaliseArchitecture(raw);
}

function assetThroughCableId(asset: SavedMapAsset | null | undefined): string {
  const details = (asset as any)?.dpDetails;
  return String(
    details?.afnDetails?.throughCableId ||
      details?.mduDetails?.throughCableId ||
      (asset as any)?.parentCableId ||
      ""
  );
}

export function getArchitectureConsistencyWarnings(input: {
  currentDpId?: string | null;
  currentClosureType?: DistributionArchitecture | string | null;
  currentThroughCableId?: string | null;
  allDistributionPoints?: SavedMapAsset[];
}): string[] {
  const currentArchitecture = normaliseArchitecture(input.currentClosureType);
  const currentThroughCableId = String(input.currentThroughCableId || "");
  if (!currentThroughCableId) return [];

  const conflicts = (input.allDistributionPoints || [])
    .map((asset) => {
      if (!asset || asset.id === input.currentDpId) return null;
      if (assetThroughCableId(asset) !== currentThroughCableId) return null;

      const otherArchitecture = assetClosureType(asset);
      if (!otherArchitecture) return null;

      if (architecturesCanShareThroughCable(currentArchitecture, otherArchitecture)) {
        return null;
      }

      return {
        asset,
        architecture: otherArchitecture,
      };
    })
    .filter(Boolean) as { asset: SavedMapAsset; architecture: DistributionArchitecture }[];

  if (!conflicts.length) return [];

  const names = conflicts
    .slice(0, 4)
    .map(({ asset, architecture }) => `${String((asset as any).name || asset.id)} is ${architecture}`)
    .join(", ");

  const currentFamily = architectureFamily(currentArchitecture);
  const blockedMessage =
    currentFamily === "CBT_TERMINAL"
      ? "CBT terminal architecture cannot share a through-cable chain with AFN/MDU splitter architecture."
      : "AFN/MDU passthrough architecture cannot share a through-cable chain with CBT terminal architecture.";

  return [
    `Mixed closure architecture detected on this through-cable chain: ${names}. ${blockedMessage}`,
  ];
}
