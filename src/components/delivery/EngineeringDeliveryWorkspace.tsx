import React, { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../map/types";
import {
  EngineeringQueueCard,
  EngineeringTwinSnapshotStatus,
  addLocalEngineeringTwinSnapshot,
  compareEngineeringTwinSnapshots,
  createEngineeringRollbackPlan,
  createEngineeringTwinSnapshot,
  readLocalJobPacks,
  getLatestEngineeringTwinSnapshot,
  getPublishedEngineeringTwinSnapshot,
  publishEngineeringTwinSnapshot,
  readLocalEngineeringQueue,
  readLocalEngineeringTwin,
} from "../../core/engineering";
import type {
  EngineeringQueueItem,
  EngineeringRollbackPlan,
  EngineeringTwinState,
} from "../../core/engineering";

type DeliveryTab =
  | "overview"
  | "revisions"
  | "ecr"
  | "jobPacks"
  | "approvals"
  | "buildPartner"
  | "digitalTwin"
  | "history";

type RevisionStatus =
  | "Survey Draft"
  | "Internal Review"
  | "Approved Design"
  | "Issued For Construction"
  | "Superseded";

type EcrStatus = "Draft" | "Awaiting Review" | "Approved" | "Rejected" | "Revision Required";

type ApprovalStatus = "Pending" | "Approved" | "Blocked";

type DeliveryRevision = {
  id: string;
  revision: number;
  title: string;
  status: RevisionStatus;
  createdAt: string;
  createdBy: string;
  issuedAt?: string;
  issuedBy?: string;
  reason: string;
  changeSummary: string[];
  affectedAssetIds: string[];
  fasVersion: string;
  asBuiltVersion: string;
  acknowledgedByBuildPartner?: boolean;
};

type EngineeringChangeRequest = {
  id: string;
  number: string;
  title: string;
  reason: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  raisedBy: string;
  raisedAt: string;
  status: EcrStatus;
  affectedAssetIds: string[];
  impact: string;
};

type DeliveryApproval = {
  id: string;
  stage: string;
  owner: string;
  status: ApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  notes?: string;
};

type DeliveryHistoryItem = {
  id: string;
  at: string;
  action: string;
  user: string;
  notes: string;
};

type DeliveryWorkspaceState = {
  revisions: DeliveryRevision[];
  ecrs: EngineeringChangeRequest[];
  approvals: DeliveryApproval[];
  history: DeliveryHistoryItem[];
};

type EngineeringDeliveryWorkspaceProps = {
  areaKey: string;
  areaName: string;
  projectAssets: SavedMapAsset[];
  onSelectAsset?: (asset: SavedMapAsset) => void;
};

const approvalStages = [
  { stage: "Internal Survey Review", owner: "Internal Survey Team" },
  { stage: "Survey QA Sign-Off", owner: "Survey QA" },
  { stage: "Build Manager Review", owner: "Build Manager" },
  { stage: "QA Manager Review", owner: "QA Manager" },
  { stage: "Issue For Construction", owner: "Build Manager" },
];

const deliveryTabs: { id: DeliveryTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "revisions", label: "Revisions" },
  { id: "ecr", label: "Engineering Changes" },
  { id: "jobPacks", label: "Job Packs" },
  { id: "approvals", label: "Approvals" },
  { id: "buildPartner", label: "Build Partner" },
  { id: "digitalTwin", label: "Digital Twin" },
  { id: "history", label: "History" },
];

const nowLabel = () => new Date().toLocaleString();

const getAssetTitle = (asset: SavedMapAsset): string => {
  const anyAsset = asset as any;
  return (
    anyAsset.name ||
    anyAsset.label ||
    anyAsset.title ||
    anyAsset.properties?.name ||
    anyAsset.properties?.label ||
    anyAsset.id ||
    "Unnamed asset"
  );
};

const makeInitialState = (areaName: string): DeliveryWorkspaceState => ({
  revisions: [
    {
      id: "rev-0",
      revision: 0,
      title: "Survey Draft",
      status: "Survey Draft",
      createdAt: nowLabel(),
      createdBy: "Survey Team",
      reason: "Initial field survey captured from live map data.",
      changeSummary: [
        "Survey assets captured on map.",
        "PIANOI / PIA references to be checked before issue.",
        "Internal survey team to confirm duplicate homes, DP allocation and fibre design.",
      ],
      affectedAssetIds: [],
      fasVersion: `${areaName}-FAS-DRAFT`,
      asBuiltVersion: `${areaName}-ASB-DRAFT`,
    },
  ],
  ecrs: [],
  approvals: approvalStages.map((item, index) => ({
    id: `approval-${index + 1}`,
    stage: item.stage,
    owner: item.owner,
    status: index === 0 ? "Pending" : "Blocked",
  })),
  history: [
    {
      id: "history-0",
      at: nowLabel(),
      action: "Delivery workspace created",
      user: "Alistra GIS",
      notes: "Revision 0 survey draft created from the current workspace.",
    },
  ],
});

export default function EngineeringDeliveryWorkspace({
  areaKey,
  areaName,
  projectAssets,
  onSelectAsset,
}: EngineeringDeliveryWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<DeliveryTab>("overview");
  const storageKey = `alistra-delivery-workspace:${areaKey}`;
  const [state, setState] = useState<DeliveryWorkspaceState>(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved) as DeliveryWorkspaceState;
    } catch {
      // Local test storage only; ignore corrupt state and rebuild the local view.
    }
    return makeInitialState(areaName);
  });
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [ecrReason, setEcrReason] = useState("");
  const [ecrTitle, setEcrTitle] = useState("");
  const [ecrPriority, setEcrPriority] = useState<EngineeringChangeRequest["priority"]>("Medium");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [engineeringQueueItems, setEngineeringQueueItems] = useState<EngineeringQueueItem[]>(() =>
    readLocalEngineeringQueue(areaKey),
  );
  const [jobPacks, setJobPacks] = useState(() => readLocalJobPacks(areaKey));

  const [engineeringTwinState, setEngineeringTwinState] = useState<EngineeringTwinState>(() =>
    readLocalEngineeringTwin(areaKey, areaName),
  );
  const [rollbackPlan, setRollbackPlan] = useState<EngineeringRollbackPlan | null>(null);

  useEffect(() => {
    const refreshEngineeringQueue = () => {
      setEngineeringQueueItems(readLocalEngineeringQueue(areaKey));
      setJobPacks(readLocalJobPacks(areaKey));
      setEngineeringTwinState(readLocalEngineeringTwin(areaKey, areaName));
    };

    refreshEngineeringQueue();
    window.addEventListener("storage", refreshEngineeringQueue);
    const timer = window.setInterval(refreshEngineeringQueue, 2500);

    return () => {
      window.removeEventListener("storage", refreshEngineeringQueue);
      window.clearInterval(timer);
    };
  }, [areaKey, areaName]);

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Non-blocking local workspace cache.
    }
  }, [state, storageKey]);


  const currentIfcRevision = useMemo(
    () =>
      [...state.revisions]
        .reverse()
        .find((revision) => revision.status === "Issued For Construction"),
    [state.revisions],
  );

  const currentRevision = useMemo(
    () => [...state.revisions].sort((a, b) => b.revision - a.revision)[0],
    [state.revisions],
  );


  const issuedJobPack = useMemo(
    () => jobPacks.find((pack) => pack.status === "issued_to_build_partner"),
    [jobPacks],
  );


  const latestTwinSnapshot = useMemo(
    () => getLatestEngineeringTwinSnapshot(engineeringTwinState),
    [engineeringTwinState],
  );

  const publishedTwinSnapshot = useMemo(
    () => getPublishedEngineeringTwinSnapshot(engineeringTwinState),
    [engineeringTwinState],
  );

  const twinComparison = useMemo(
    () => compareEngineeringTwinSnapshots(publishedTwinSnapshot, latestTwinSnapshot),
    [publishedTwinSnapshot, latestTwinSnapshot],
  );

  const openEcrs = state.ecrs.filter(
    (ecr) => ecr.status !== "Approved" && ecr.status !== "Rejected",
  );
  const approvedApprovals = state.approvals.filter((item) => item.status === "Approved").length;
  const approvalPercent = Math.round((approvedApprovals / Math.max(1, state.approvals.length)) * 100);
  const canIssueForConstruction = state.approvals.every((item) => item.status === "Approved");

  const addHistory = (action: string, notes: string, user = "Current User") => {
    const item: DeliveryHistoryItem = {
      id: `history-${Date.now()}`,
      at: nowLabel(),
      action,
      user,
      notes,
    };
    return item;
  };

  const createEcr = () => {
    if (!ecrTitle.trim() || !ecrReason.trim()) return;
    const nextNumber = String(state.ecrs.length + 1).padStart(3, "0");
    const ecr: EngineeringChangeRequest = {
      id: `ecr-${Date.now()}`,
      number: `ECR-${nextNumber}`,
      title: ecrTitle.trim(),
      reason: ecrReason.trim(),
      priority: ecrPriority,
      raisedBy: "Current User",
      raisedAt: nowLabel(),
      status: "Awaiting Review",
      affectedAssetIds: selectedAssetIds,
      impact: "Build pack revision required before contractor continues on affected assets.",
    };
    setState((current) => ({
      ...current,
      ecrs: [ecr, ...current.ecrs],
      history: [
        addHistory("Engineering change raised", `${ecr.number}: ${ecr.title}`),
        ...current.history,
      ],
    }));
    setEcrTitle("");
    setEcrReason("");
    setSelectedAssetIds([]);
  };

  const approveNextStage = () => {
    const next = state.approvals.find((item) => item.status !== "Approved");
    if (!next) return;
    setState((current) => ({
      ...current,
      approvals: current.approvals.map((item) => {
        if (item.id === next.id) {
          return {
            ...item,
            status: "Approved",
            approvedBy: "Current User",
            approvedAt: nowLabel(),
            notes: approvalNotes || "Approved in Delivery Workspace.",
          };
        }
        if (item.status === "Blocked") return { ...item, status: "Pending" };
        return item;
      }),
      history: [
        addHistory("Approval completed", `${next.stage}${approvalNotes ? ` — ${approvalNotes}` : ""}`),
        ...current.history,
      ],
    }));
    setApprovalNotes("");
  };

  const issueRevision = () => {
    if (!canIssueForConstruction) return;
    const nextRevisionNumber = Math.max(...state.revisions.map((revision) => revision.revision)) + 1;
    const approvedEcrs = state.ecrs.filter((ecr) => ecr.status === "Approved" || ecr.status === "Revision Required");
    const revision: DeliveryRevision = {
      id: `rev-${Date.now()}`,
      revision: nextRevisionNumber,
      title: `Issued For Construction Rev ${nextRevisionNumber}`,
      status: "Issued For Construction",
      createdAt: nowLabel(),
      createdBy: "Build Manager",
      issuedAt: nowLabel(),
      issuedBy: "Build Manager",
      reason: approvedEcrs.length
        ? "Issued following approved engineering changes."
        : "Issued after internal survey QA, build manager and QA manager approval.",
      changeSummary: approvedEcrs.length
        ? approvedEcrs.map((ecr) => `${ecr.number}: ${ecr.title}`)
        : [
            "Internal survey review completed.",
            "Survey QA signed off.",
            "Build Manager approved IFC issue.",
            "QA Manager approval captured.",
          ],
      affectedAssetIds: Array.from(new Set(approvedEcrs.flatMap((ecr) => ecr.affectedAssetIds))),
      fasVersion: `${areaName}-FAS-REV${nextRevisionNumber}`,
      asBuiltVersion: `${areaName}-ASB-REV${nextRevisionNumber}`,
      acknowledgedByBuildPartner: false,
    };
    setState((current) => ({
      ...current,
      revisions: [
        ...current.revisions.map((item) =>
          item.status === "Issued For Construction"
            ? { ...item, status: "Superseded" as RevisionStatus }
            : item,
        ),
        revision,
      ],
      history: [
        addHistory("Revision issued for construction", `Rev ${nextRevisionNumber} is now the active build pack.`),
        ...current.history,
      ],
    }));
  };

  const markEcrApproved = (id: string) => {
    setState((current) => ({
      ...current,
      ecrs: current.ecrs.map((ecr) =>
        ecr.id === id ? { ...ecr, status: "Revision Required" } : ecr,
      ),
      history: [addHistory("Engineering change approved", "ECR marked as requiring a new revision."), ...current.history],
    }));
  };

  const acknowledgeCurrentRevision = () => {
    if (!currentIfcRevision) return;
    setState((current) => ({
      ...current,
      revisions: current.revisions.map((revision) =>
        revision.id === currentIfcRevision.id
          ? { ...revision, acknowledgedByBuildPartner: true }
          : revision,
      ),
      history: [
        addHistory("Build Partner acknowledged revision", `Rev ${currentIfcRevision.revision} acknowledged.`),
        ...current.history,
      ],
    }));
  };

  const toggleSelectedAsset = (assetId: string) => {
    setSelectedAssetIds((current) =>
      current.includes(assetId)
        ? current.filter((id) => id !== assetId)
        : [...current, assetId],
    );
  };

  const captureEngineeringTwinSnapshot = () => {
    const snapshot = createEngineeringTwinSnapshot({
      areaId: areaKey,
      areaName,
      assets: projectAssets as any[],
      revisionNumber: `TWIN-${areaName.replace(/\s+/g, "-").toUpperCase()}-${engineeringTwinState.snapshots.length + 1}`,
      status: EngineeringTwinSnapshotStatus.Review,
      reason: "Live map snapshot captured for engineering comparison and revision control.",
      createdBy: "Current User",
    });
    const nextTwinState = addLocalEngineeringTwinSnapshot(snapshot);
    setEngineeringTwinState(nextTwinState);
    setState((current) => ({
      ...current,
      history: [
        addHistory(
          "Engineering twin snapshot captured",
          `${snapshot.revisionNumber}: ${snapshot.assetCount} assets captured from the live map.`,
          "Alistra GIS",
        ),
        ...current.history,
      ],
    }));
  };

  const publishTwinSnapshot = (snapshotId: string) => {
    const nextTwinState = publishEngineeringTwinSnapshot(engineeringTwinState, snapshotId);
    setEngineeringTwinState(nextTwinState);
    const snapshot = nextTwinState.snapshots.find((item) => item.id === snapshotId);
    setState((current) => ({
      ...current,
      history: [
        addHistory(
          "Engineering twin snapshot published",
          snapshot ? `${snapshot.revisionNumber} is now the published engineering baseline.` : "Digital twin baseline published.",
          "Alistra GIS",
        ),
        ...current.history,
      ],
    }));
  };

  const previewRollbackToSnapshot = (snapshotId: string) => {
    const snapshot = engineeringTwinState.snapshots.find((item) => item.id === snapshotId);
    if (!snapshot) return;

    const plan = createEngineeringRollbackPlan({
      areaId: areaKey,
      areaName,
      targetSnapshot: snapshot,
      currentAssets: projectAssets as any[],
      reason: `Rollback preview to ${snapshot.revisionNumber}.`,
      createdBy: "Current User",
    });

    setRollbackPlan(plan);
    setState((current) => ({
      ...current,
      history: [
        addHistory(
          "Rollback preview created",
          plan.summary,
          "Alistra GIS",
        ),
        ...current.history,
      ],
    }));
  };

  const selectedAssetLabels = selectedAssetIds
    .map((id) => projectAssets.find((asset) => asset.id === id))
    .filter(Boolean)
    .map((asset) => getAssetTitle(asset as SavedMapAsset));

  return (
    <div style={shell}>
      <header style={header}>
        <div>
          <div style={eyebrow}>Phase 15 · Engineering Delivery Workspace</div>
          <h2 style={title}>{areaName}</h2>
          <p style={subtitle}>
            Controlled survey review, job pack revisions, engineering change control and IFC release.
          </p>
        </div>
        <div style={statusCard}>
          <span style={statusLabel}>Active IFC</span>
          <strong>{currentIfcRevision ? `Rev ${currentIfcRevision.revision}` : "Not issued"}</strong>
          <small>{currentIfcRevision?.acknowledgedByBuildPartner ? "Acknowledged by BP" : "Awaiting acknowledgement"}</small>
        </div>
      </header>

      <nav style={tabBar}>
        {deliveryTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            style={activeTab === tab.id ? tabButtonActive : tabButton}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {activeTab === "overview" ? (
        <div style={grid}>
          <section style={panel}>
            <div style={panelTitle}>Delivery Control</div>
            <div style={kpiGrid}>
              <Info label="Current Revision" value={`Rev ${currentRevision?.revision ?? 0}`} />
              <Info label="IFC Status" value={currentIfcRevision ? "Issued" : "Locked"} />
              <Info label="Approval Chain" value={`${approvalPercent}%`} />
              <Info label="Open ECRs" value={openEcrs.length} />
              <Info label="Twin Snapshots" value={engineeringTwinState.snapshots.length} />
              <Info label="Assets in Pack" value={projectAssets.length} />
              <Info label="Next Action" value={canIssueForConstruction ? "Issue IFC" : "Complete approvals"} />
            </div>
            <div style={gateBox(canIssueForConstruction)}>
              <strong>{canIssueForConstruction ? "Ready to issue build pack" : "Build pack locked"}</strong>
              <span>
                {canIssueForConstruction
                  ? "All internal approvals are complete. The Build Manager can issue the next IFC revision."
                  : "Survey QA, Build Manager and QA Manager sign-off must complete before the Build Partner sees the pack."}
              </span>
            </div>
          </section>

          <section style={panelWide}>
            <EngineeringQueueCard
              items={engineeringQueueItems}
              title="Live Engineering Queue"
              onOpenQueue={() => setActiveTab("ecr")}
            />
          </section>

          <section style={panel}>
            <div style={panelTitle}>Revision Change Summary</div>
            <strong style={revisionTitle}>{currentRevision?.title}</strong>
            <p style={muted}>{currentRevision?.reason}</p>
            <ul style={list}>
              {(currentRevision?.changeSummary || []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section style={panelWide}>
            <div style={panelTitle}>Controlled Workflow</div>
            <div style={workflowRow}>
              {[
                "PIANOI",
                "Field Survey",
                "Internal Review",
                "Survey QA",
                "Build Manager",
                "IFC Release",
                "Build Partner",
                "QA / ECR",
              ].map((stage, index) => (
                <div key={stage} style={workflowStep(index <= approvedApprovals)}>
                  <span>{index + 1}</span>
                  <strong>{stage}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "revisions" ? (
        <section style={panel}>
          <div style={panelTitle}>Revision Register</div>
          <div style={tableWrap}>
            <table style={table}>
              <thead>
                <tr>
                  <th>Revision</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Issued</th>
                  <th>FAS</th>
                  <th>Change Summary</th>
                </tr>
              </thead>
              <tbody>
                {[...state.revisions].sort((a, b) => b.revision - a.revision).map((revision) => (
                  <tr key={revision.id}>
                    <td>Rev {revision.revision}</td>
                    <td><span style={pill(revision.status)}>{revision.status}</span></td>
                    <td>{revision.createdAt}</td>
                    <td>{revision.issuedAt || "Not issued"}</td>
                    <td>{revision.fasVersion}</td>
                    <td>{revision.changeSummary.slice(0, 2).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" style={primaryButton} onClick={issueRevision} disabled={!canIssueForConstruction}>
            Issue New IFC Revision
          </button>
        </section>
      ) : null}

      {activeTab === "ecr" ? (
        <div style={grid}>
          <section style={panel}>
            <div style={panelTitle}>Raise Engineering Change Request</div>
            <label style={fieldLabel}>Title</label>
            <input style={input} value={ecrTitle} onChange={(event) => setEcrTitle(event.target.value)} placeholder="Example: DP12 moved to SB18" />
            <label style={fieldLabel}>Reason for change</label>
            <textarea style={textarea} value={ecrReason} onChange={(event) => setEcrReason(event.target.value)} placeholder="Example: Existing pole unsuitable / D-pole required / service ex route changed." />
            <label style={fieldLabel}>Priority</label>
            <select style={input} value={ecrPriority} onChange={(event) => setEcrPriority(event.target.value as EngineeringChangeRequest["priority"])}>
              <option>Low</option>
              <option>Medium</option>
              <option>High</option>
              <option>Critical</option>
            </select>
            <div style={assetPicker}>
              <strong>Link affected assets</strong>
              <div style={assetChipWrap}>
                {projectAssets.slice(0, 80).map((asset) => (
                  <button key={asset.id} type="button" onClick={() => toggleSelectedAsset(asset.id)} style={selectedAssetIds.includes(asset.id) ? assetChipActive : assetChip}>
                    {getAssetTitle(asset)}
                  </button>
                ))}
              </div>
              <small>{selectedAssetLabels.length ? selectedAssetLabels.join(", ") : "No assets linked yet."}</small>
            </div>
            <button type="button" style={primaryButton} onClick={createEcr}>Create ECR</button>
          </section>

          <section style={panel}>
            <div style={panelTitle}>Engineering Change Register</div>
            <div style={stack}>
              {state.ecrs.length ? state.ecrs.map((ecr) => (
                <div key={ecr.id} style={recordCard}>
                  <div style={recordHead}>
                    <strong>{ecr.number} · {ecr.title}</strong>
                    <span style={priorityPill(ecr.priority)}>{ecr.priority}</span>
                  </div>
                  <p style={muted}>{ecr.reason}</p>
                  <small>{ecr.status} · {ecr.affectedAssetIds.length} linked assets · {ecr.raisedAt}</small>
                  <div style={buttonRow}>
                    <button type="button" style={secondaryButton} onClick={() => markEcrApproved(ecr.id)}>Approve for Revision</button>
                    {ecr.affectedAssetIds.map((assetId) => {
                      const asset = projectAssets.find((item) => item.id === assetId);
                      return asset ? (
                        <button key={assetId} type="button" style={linkButton} onClick={() => onSelectAsset?.(asset)}>
                          Open {getAssetTitle(asset)}
                        </button>
                      ) : null;
                    })}
                  </div>
                </div>
              )) : <div style={emptyBox}>No engineering changes raised yet.</div>}
            </div>
          </section>
        </div>
      ) : null}

      {activeTab === "jobPacks" ? (
        <section style={panel}>
          <div style={panelTitle}>Job Pack Editor</div>
          <div style={comingSoonHero}>
            <div>
              <div style={eyebrow}>Phase 16 · Coming Soon</div>
              <h3 style={comingSoonTitle}>Production Job Pack Editor</h3>
              <p style={comingSoonText}>
                The one-click Job Pack prototype has been parked while the dedicated production editor is built.
                This keeps tonight&apos;s delivery workspace stable and prevents unfinished FAS, UPRN and route data from
                being issued before engineering review.
              </p>
            </div>
            <span style={comingSoonBadge}>Coming Soon</span>
          </div>

          <div style={kpiGrid}>
            <Info label="Area" value={areaName} />
            <Info label="Assets Included" value={projectAssets.length} />
            <Info label="FAS Version" value={currentIfcRevision?.fasVersion || "Not issued"} />
            <Info label="As-Built Version" value={currentIfcRevision?.asBuiltVersion || "Not issued"} />
            <Info label="Saved Draft Packs" value={jobPacks.length} />
            <Info label="Issued Pack" value={issuedJobPack ? issuedJobPack.jobPackNumber : "None"} />
          </div>

          <div style={roadmapGrid}>
            <div style={roadmapCard}>
              <strong>What is changing?</strong>
              <p style={muted}>
                Job Packs will move into their own controlled editor instead of being exported directly from raw live map data.
              </p>
              <ul style={roadmapList}>
                <li>Draft pack generated from the live map.</li>
                <li>Engineer reviews routes, UPRNs, FAS and schedules.</li>
                <li>Corrections stay in the draft pack until approved.</li>
                <li>Final issue exports PDF / ZIP and archives the controlled version.</li>
              </ul>
            </div>

            <div style={roadmapCard}>
              <strong>Planned editor modules</strong>
              <ul style={roadmapList}>
                <li>Route-by-route engineering sheets.</li>
                <li>FAS / fibre allocation editor.</li>
                <li>DP, Pole, Chamber and Cable schedule review.</li>
                <li>UPRN visibility controls and validation.</li>
                <li>Risk, QA and construction notes review.</li>
                <li>As-built and walk-off pack generation.</li>
              </ul>
            </div>
          </div>

          <div style={statusTimeline}>
            {[
              ["Engineering Core", "Complete"],
              ["Delivery Workspace", "Complete"],
              ["Digital Twin", "Complete"],
              ["PIA QA", "Complete"],
              ["Commercial Reporting", "Complete"],
              ["Job Pack Editor", "Coming Soon"],
            ].map(([label, value]) => (
              <div key={label} style={statusTimelineItem}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <button type="button" style={disabledComingSoonButton} disabled>
            Job Pack Editor Coming Soon
          </button>
        </section>
      ) : null}

      {activeTab === "approvals" ? (
        <section style={panel}>
          <div style={panelTitle}>Approval Chain</div>
          <div style={approvalList}>
            {state.approvals.map((approval) => (
              <div key={approval.id} style={approvalCard(approval.status)}>
                <div>
                  <strong>{approval.stage}</strong>
                  <div style={muted}>{approval.owner}</div>
                  {approval.approvedAt ? <small>{approval.approvedBy} · {approval.approvedAt}</small> : null}
                </div>
                <span style={approvalPill(approval.status)}>{approval.status}</span>
              </div>
            ))}
          </div>
          <label style={fieldLabel}>Approval notes</label>
          <textarea style={textarea} value={approvalNotes} onChange={(event) => setApprovalNotes(event.target.value)} placeholder="Add any checks completed before approving the next stage." />
          <button type="button" style={primaryButton} onClick={approveNextStage} disabled={state.approvals.every((item) => item.status === "Approved")}>
            Approve Next Stage
          </button>
        </section>
      ) : null}

      {activeTab === "buildPartner" ? (
        <section style={panel}>
          <div style={panelTitle}>Build Partner Controlled View</div>
          <div style={gateBox(Boolean(currentIfcRevision))}>
            <strong>{currentIfcRevision ? `Released Build Pack Rev ${currentIfcRevision.revision}` : "No build pack released"}</strong>
            <span>
              {currentIfcRevision
                ? "Build Partner can only see the current issued revision. Drafts, internal notes and commercial values remain hidden."
                : "Nothing is visible to the Build Partner until a pack is issued for construction."}
            </span>
          </div>
          {currentIfcRevision ? (
            <>
              <div style={kpiGrid}>
                <Info label="Revision" value={`Rev ${currentIfcRevision.revision}`} />
                <Info label="Issued" value={currentIfcRevision.issuedAt || "Unknown"} />
                <Info label="Issued By" value={currentIfcRevision.issuedBy || "Build Manager"} />
                <Info label="Acknowledged" value={currentIfcRevision.acknowledgedByBuildPartner ? "Yes" : "No"} />
              </div>
              <button type="button" style={primaryButton} onClick={acknowledgeCurrentRevision} disabled={Boolean(currentIfcRevision.acknowledgedByBuildPartner)}>
                Acknowledge Current Revision
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {activeTab === "digitalTwin" ? (
        <div style={grid}>
          <section style={panel}>
            <div style={panelTitle}>Engineering Digital Twin</div>
            <p style={muted}>
              Capture immutable local snapshots from the live map so Delivery can compare the current design against the published engineering baseline before issuing new packs.
            </p>
            <div style={kpiGrid}>
              <Info label="Snapshots" value={engineeringTwinState.snapshots.length} />
              <Info label="Published Baseline" value={publishedTwinSnapshot?.revisionNumber || "None"} />
              <Info label="Latest Snapshot" value={latestTwinSnapshot?.revisionNumber || "None"} />
              <Info label="Asset Changes" value={twinComparison.result.assetDiffs.length} />
              <Info label="Major Changes" value={twinComparison.result.majorChangeCount} />
              <Info label="Live Assets" value={projectAssets.length} />
            </div>
            <div style={gateBox(Boolean(publishedTwinSnapshot))}>
              <strong>{publishedTwinSnapshot ? "Engineering baseline active" : "No published baseline yet"}</strong>
              <span>
                {publishedTwinSnapshot
                  ? twinComparison.result.summary
                  : "Capture a snapshot, then publish it as the baseline before comparing future design changes."}
              </span>
            </div>
            <button type="button" style={primaryButton} onClick={captureEngineeringTwinSnapshot}>
              Capture Live Map Snapshot
            </button>
          </section>

          <section style={panel}>
            <div style={panelTitle}>Snapshot Register</div>
            <div style={stack}>
              {engineeringTwinState.snapshots.length ? engineeringTwinState.snapshots.map((snapshot) => (
                <div key={snapshot.id} style={recordCard}>
                  <div style={recordHead}>
                    <strong>{snapshot.revisionNumber}</strong>
                    <span style={pill(snapshot.status)}>{snapshot.status.replace(/_/g, " ")}</span>
                  </div>
                  <p style={muted}>{snapshot.reason}</p>
                  <small>{snapshot.assetCount} assets · {snapshot.createdBy || "Unknown"} · {snapshot.createdAt}</small>
                  <div style={kpiGrid}>
                    <Info label="Poles" value={snapshot.metadata.poleCount} />
                    <Info label="DPs" value={snapshot.metadata.dpCount} />
                    <Info label="Chambers" value={snapshot.metadata.chamberCount} />
                    <Info label="Joints" value={snapshot.metadata.jointCount} />
                    <Info label="Cables" value={snapshot.metadata.cableCount} />
                    <Info label="Homes" value={snapshot.metadata.homeCount} />
                  </div>
                  <div style={buttonRow}>
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() => publishTwinSnapshot(snapshot.id)}
                      disabled={publishedTwinSnapshot?.id === snapshot.id}
                    >
                      {publishedTwinSnapshot?.id === snapshot.id ? "Published Baseline" : "Publish Baseline"}
                    </button>
                    <button
                      type="button"
                      style={secondaryButton}
                      onClick={() => previewRollbackToSnapshot(snapshot.id)}
                    >
                      Preview Rollback
                    </button>
                  </div>
                </div>
              )) : <div style={emptyBox}>No engineering twin snapshots captured yet.</div>}
            </div>
          </section>

          <section style={panelWide}>
            <div style={panelTitle}>Baseline Comparison</div>
            <p style={muted}>{twinComparison.result.summary}</p>
            <div style={tableWrap}>
              <table style={table}>
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Type</th>
                    <th>Impact</th>
                    <th>Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {twinComparison.result.assetDiffs.slice(0, 30).map((diff) => (
                    <tr key={`${diff.assetId}-${diff.diffType}`}>
                      <td>{diff.assetName || diff.assetId}</td>
                      <td>{diff.assetType || diff.diffType.replace(/_/g, " ")}</td>
                      <td><span style={pill(diff.impact)}>{diff.impact}</span></td>
                      <td>{diff.summary}</td>
                    </tr>
                  ))}
                  {!twinComparison.result.assetDiffs.length ? (
                    <tr>
                      <td colSpan={4}>No asset differences detected against the published baseline.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section style={panelWide}>
            <div style={panelTitle}>Rollback Preview</div>
            {rollbackPlan ? (
              <>
                <div style={gateBox(rollbackPlan.actionCount > 0)}>
                  <strong>{rollbackPlan.targetRevisionNumber}</strong>
                  <span>{rollbackPlan.summary}</span>
                </div>
                <div style={tableWrap}>
                  <table style={table}>
                    <thead>
                      <tr>
                        <th>Action</th>
                        <th>Asset</th>
                        <th>Impact</th>
                        <th>Fields</th>
                        <th>Summary</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rollbackPlan.actions.slice(0, 40).map((action) => (
                        <tr key={action.id}>
                          <td>{action.actionType.replace(/_/g, " ")}</td>
                          <td>{action.assetName || action.assetId}</td>
                          <td><span style={pill(action.impact)}>{action.impact}</span></td>
                          <td>{action.changedFields.length ? action.changedFields.slice(0, 4).join(", ") : "Whole asset"}</td>
                          <td>{action.summary}</td>
                        </tr>
                      ))}
                      {!rollbackPlan.actions.length ? (
                        <tr>
                          <td colSpan={5}>No rollback actions required.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={emptyBox}>Select Preview Rollback on any snapshot to generate a controlled rollback plan. This does not change the live map.</div>
            )}
          </section>
        </div>
      ) : null}

      {activeTab === "history" ? (
        <section style={panel}>
          <div style={panelTitle}>Delivery History</div>
          <div style={stack}>
            {state.history.map((item) => (
              <div key={item.id} style={historyItem}>
                <div>
                  <strong>{item.action}</strong>
                  <p style={muted}>{item.notes}</p>
                </div>
                <small>{item.user}<br />{item.at}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}


function formatEngineeringDocumentType(documentType: string): string {
  return documentType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={infoCard}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}



const comingSoonHero: React.CSSProperties = {
  border: "1px solid rgba(56, 189, 248, 0.35)",
  borderRadius: 20,
  padding: 18,
  background: "linear-gradient(135deg, rgba(8, 47, 73, 0.56), rgba(15, 23, 42, 0.92))",
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 14,
};

const comingSoonTitle: React.CSSProperties = {
  margin: "6px 0 8px",
  fontSize: 24,
  color: "#f8fafc",
};

const comingSoonText: React.CSSProperties = {
  margin: 0,
  color: "#cbd5e1",
  maxWidth: 880,
  lineHeight: 1.5,
};

const comingSoonBadge: React.CSSProperties = {
  border: "1px solid rgba(250, 204, 21, 0.45)",
  borderRadius: 999,
  padding: "7px 12px",
  background: "rgba(113, 63, 18, 0.28)",
  color: "#fef3c7",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const roadmapGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 14,
  marginTop: 14,
};

const roadmapCard: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(2, 6, 23, 0.45)",
};

const roadmapList: React.CSSProperties = {
  margin: "10px 0 0",
  paddingLeft: 18,
  color: "#cbd5e1",
  lineHeight: 1.45,
};

const statusTimeline: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const statusTimelineItem: React.CSSProperties = {
  border: "1px solid rgba(34, 197, 94, 0.22)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(20, 83, 45, 0.14)",
  display: "grid",
  gap: 4,
};

const disabledComingSoonButton: React.CSSProperties = {
  marginTop: 14,
  border: "1px solid rgba(148, 163, 184, 0.28)",
  borderRadius: 12,
  padding: "10px 14px",
  background: "rgba(30, 41, 59, 0.72)",
  color: "#94a3b8",
  fontWeight: 900,
  cursor: "not-allowed",
};

const shell: React.CSSProperties = {
  background: "rgba(2, 6, 23, 0.96)",
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 22,
  padding: 18,
  color: "#e5e7eb",
  boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 14,
};

const eyebrow: React.CSSProperties = {
  color: "#38bdf8",
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  margin: "4px 0",
  fontSize: 24,
};

const subtitle: React.CSSProperties = {
  margin: 0,
  color: "#94a3b8",
  maxWidth: 820,
};

const statusCard: React.CSSProperties = {
  minWidth: 190,
  border: "1px solid rgba(56, 189, 248, 0.35)",
  borderRadius: 16,
  padding: 14,
  background: "rgba(8, 47, 73, 0.5)",
  display: "grid",
  gap: 4,
};

const statusLabel: React.CSSProperties = {
  color: "#bae6fd",
  fontSize: 12,
  fontWeight: 800,
};

const tabBar: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 16,
};

const tabButton: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.22)",
  borderRadius: 999,
  padding: "8px 12px",
  background: "rgba(15, 23, 42, 0.9)",
  color: "#cbd5e1",
  cursor: "pointer",
  fontWeight: 800,
};

const tabButtonActive: React.CSSProperties = {
  ...tabButton,
  background: "linear-gradient(135deg, rgba(14, 165, 233, 0.95), rgba(37, 99, 235, 0.95))",
  color: "white",
  borderColor: "rgba(125, 211, 252, 0.65)",
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
  gap: 14,
};

const panel: React.CSSProperties = {
  border: "1px solid rgba(148, 163, 184, 0.18)",
  borderRadius: 18,
  background: "rgba(15, 23, 42, 0.86)",
  padding: 16,
};

const panelWide: React.CSSProperties = {
  ...panel,
  gridColumn: "1 / -1",
};

const panelTitle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 900,
  marginBottom: 12,
  color: "#f8fafc",
};

const kpiGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
};

const infoCard: React.CSSProperties = {
  display: "grid",
  gap: 4,
  border: "1px solid rgba(148, 163, 184, 0.14)",
  borderRadius: 14,
  padding: 12,
  background: "rgba(2, 6, 23, 0.55)",
};

const gateBox = (open: boolean): React.CSSProperties => ({
  marginTop: 14,
  border: `1px solid ${open ? "rgba(34, 197, 94, 0.35)" : "rgba(248, 113, 113, 0.35)"}`,
  borderRadius: 16,
  padding: 13,
  background: open ? "rgba(20, 83, 45, 0.25)" : "rgba(127, 29, 29, 0.25)",
  display: "grid",
  gap: 4,
});

const revisionTitle: React.CSSProperties = { color: "#f8fafc", fontSize: 16 };
const muted: React.CSSProperties = { color: "#94a3b8", margin: "6px 0" };
const list: React.CSSProperties = { margin: "8px 0 0", paddingLeft: 18, color: "#cbd5e1" };

const workflowRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
  gap: 10,
};

const workflowStep = (done: boolean): React.CSSProperties => ({
  border: `1px solid ${done ? "rgba(34, 197, 94, 0.35)" : "rgba(148, 163, 184, 0.18)"}`,
  borderRadius: 14,
  padding: 12,
  background: done ? "rgba(20, 83, 45, 0.22)" : "rgba(30, 41, 59, 0.55)",
  display: "grid",
  gap: 6,
});

const tableWrap: React.CSSProperties = { overflowX: "auto" };
const table: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: 13 };
const primaryButton: React.CSSProperties = {
  marginTop: 12,
  border: 0,
  borderRadius: 12,
  padding: "10px 14px",
  background: "linear-gradient(135deg, #0ea5e9, #2563eb)",
  color: "white",
  fontWeight: 900,
  cursor: "pointer",
};
const secondaryButton: React.CSSProperties = {
  border: "1px solid rgba(56, 189, 248, 0.45)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(14, 165, 233, 0.12)",
  color: "#bae6fd",
  fontWeight: 800,
  cursor: "pointer",
};
const linkButton: React.CSSProperties = {
  ...secondaryButton,
  borderColor: "rgba(148, 163, 184, 0.3)",
  color: "#e5e7eb",
};
const fieldLabel: React.CSSProperties = { display: "block", marginTop: 10, marginBottom: 5, color: "#cbd5e1", fontSize: 12, fontWeight: 800 };
const input: React.CSSProperties = { width: "100%", boxSizing: "border-box", borderRadius: 10, border: "1px solid rgba(148, 163, 184, 0.22)", background: "rgba(2, 6, 23, 0.65)", color: "#f8fafc", padding: 10 };
const textarea: React.CSSProperties = { ...input, minHeight: 86, resize: "vertical" };
const assetPicker: React.CSSProperties = { marginTop: 12, border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: 14, padding: 12, background: "rgba(2, 6, 23, 0.35)" };
const assetChipWrap: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0" };
const assetChip: React.CSSProperties = { border: "1px solid rgba(148, 163, 184, 0.18)", borderRadius: 999, padding: "6px 9px", background: "rgba(15, 23, 42, 0.85)", color: "#cbd5e1", cursor: "pointer" };
const assetChipActive: React.CSSProperties = { ...assetChip, background: "rgba(14, 165, 233, 0.22)", borderColor: "rgba(56, 189, 248, 0.55)", color: "#e0f2fe" };
const stack: React.CSSProperties = { display: "grid", gap: 10 };
const recordCard: React.CSSProperties = { border: "1px solid rgba(148, 163, 184, 0.16)", borderRadius: 14, padding: 12, background: "rgba(2, 6, 23, 0.45)" };
const recordHead: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 };
const buttonRow: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 };
const emptyBox: React.CSSProperties = { border: "1px dashed rgba(148, 163, 184, 0.22)", borderRadius: 14, padding: 18, color: "#94a3b8" };
const packCard: React.CSSProperties = { border: "1px solid rgba(56, 189, 248, 0.25)", borderRadius: 16, padding: 16, background: "rgba(8, 47, 73, 0.32)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", marginBottom: 12 };
const packTitle: React.CSSProperties = { margin: "5px 0", color: "#f8fafc" };
const approvalList: React.CSSProperties = { display: "grid", gap: 8 };
const approvalCard = (status: ApprovalStatus): React.CSSProperties => ({
  border: `1px solid ${status === "Approved" ? "rgba(34,197,94,.35)" : status === "Pending" ? "rgba(234,179,8,.35)" : "rgba(148,163,184,.18)"}`,
  borderRadius: 14,
  padding: 12,
  background: status === "Approved" ? "rgba(20,83,45,.22)" : status === "Pending" ? "rgba(113,63,18,.18)" : "rgba(30,41,59,.5)",
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
});
const historyItem: React.CSSProperties = { ...recordCard, display: "flex", justifyContent: "space-between", gap: 14 };
const pill = (status: string): React.CSSProperties => ({
  display: "inline-flex",
  borderRadius: 999,
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 900,
  color: status.includes("Issued") ? "#dcfce7" : status.includes("Superseded") ? "#fecaca" : "#e0f2fe",
  background: status.includes("Issued") ? "rgba(22, 163, 74, .22)" : status.includes("Superseded") ? "rgba(220, 38, 38, .2)" : "rgba(14, 165, 233, .18)",
});
const approvalPill = (status: ApprovalStatus): React.CSSProperties => ({ ...pill(status), color: status === "Approved" ? "#dcfce7" : status === "Pending" ? "#fef3c7" : "#cbd5e1" });
const priorityPill = (priority: EngineeringChangeRequest["priority"]): React.CSSProperties => ({
  ...pill(priority),
  color: priority === "Critical" || priority === "High" ? "#fecaca" : priority === "Medium" ? "#fef3c7" : "#dbeafe",
  background: priority === "Critical" || priority === "High" ? "rgba(220, 38, 38, .22)" : priority === "Medium" ? "rgba(234, 179, 8, .18)" : "rgba(37, 99, 235, .18)",
});
