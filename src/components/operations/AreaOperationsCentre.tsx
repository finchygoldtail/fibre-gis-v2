import React, { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../map/types";

type OperationsTab = "timeline" | "messages" | "tasks" | "blockers" | "decisions" | "handover";
type Priority = "Low" | "Normal" | "High" | "Critical";
type TaskStatus = "Open" | "In Progress" | "Complete";
type BlockerStatus = "Open" | "Resolved";

type OperationsMessage = {
  id: string;
  category: string;
  priority: Priority;
  body: string;
  author: string;
  createdAt: string;
  pinned?: boolean;
  linkedAssetId?: string;
};

type OperationsTask = {
  id: string;
  title: string;
  assignedTo: string;
  dueDate: string;
  priority: Priority;
  status: TaskStatus;
  linkedAssetId?: string;
  createdAt: string;
};

type OperationsBlocker = {
  id: string;
  title: string;
  owner: string;
  reason: string;
  status: BlockerStatus;
  priority: Priority;
  linkedAssetId?: string;
  createdAt: string;
  resolvedAt?: string;
};

type OperationsDecision = {
  id: string;
  title: string;
  reason: string;
  approvedBy: string;
  linkedAssetId?: string;
  createdAt: string;
};

type HandoverNote = {
  id: string;
  stage: string;
  summary: string;
  risks: string;
  owner: string;
  createdAt: string;
};

type OperationsState = {
  messages: OperationsMessage[];
  tasks: OperationsTask[];
  blockers: OperationsBlocker[];
  decisions: OperationsDecision[];
  handovers: HandoverNote[];
};

type AreaOperationsCentreProps = {
  areaKey: string;
  areaName: string;
  projectAssets: SavedMapAsset[];
  currentUserName?: string;
  onSelectAsset?: (asset: SavedMapAsset) => void;
};

const emptyState: OperationsState = {
  messages: [],
  tasks: [],
  blockers: [],
  decisions: [],
  handovers: [],
};

const tabs: { id: OperationsTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "messages", label: "Messages" },
  { id: "tasks", label: "Tasks" },
  { id: "blockers", label: "Blockers" },
  { id: "decisions", label: "Decisions" },
  { id: "handover", label: "Handover" },
];

const categories = ["General", "Survey", "Build", "QA", "PIA", "Commercial", "Health & Safety", "Customer", "Blocker"];
const priorities: Priority[] = ["Low", "Normal", "High", "Critical"];
const stages = ["Survey → Build", "Build → QA", "QA → PIA", "PIA → Commercial", "Commercial → Operations", "Operations → Maintenance"];

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const nowIso = () => new Date().toISOString();

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getAssetTitle = (asset: SavedMapAsset) =>
  String(
    (asset as any).name ||
      (asset as any).jointName ||
      (asset as any).label ||
      (asset as any).assetId ||
      asset.id,
  );

const safeStorageKey = (areaKey: string) =>
  `alistra-area-operations:${areaKey || "current-area"}`;

const loadState = (areaKey: string): OperationsState => {
  if (typeof window === "undefined") return emptyState;
  try {
    const raw = window.localStorage.getItem(safeStorageKey(areaKey));
    if (!raw) return emptyState;
    const parsed = JSON.parse(raw) as Partial<OperationsState>;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      blockers: Array.isArray(parsed.blockers) ? parsed.blockers : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      handovers: Array.isArray(parsed.handovers) ? parsed.handovers : [],
    };
  } catch {
    return emptyState;
  }
};

const saveState = (areaKey: string, state: OperationsState) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(safeStorageKey(areaKey), JSON.stringify(state));
};

const priorityStyle = (priority: Priority): React.CSSProperties => {
  if (priority === "Critical") return { background: "rgba(239,68,68,0.18)", color: "#fecaca", borderColor: "rgba(248,113,113,0.55)" };
  if (priority === "High") return { background: "rgba(249,115,22,0.18)", color: "#fed7aa", borderColor: "rgba(251,146,60,0.5)" };
  if (priority === "Low") return { background: "rgba(59,130,246,0.16)", color: "#bfdbfe", borderColor: "rgba(96,165,250,0.45)" };
  return { background: "rgba(148,163,184,0.12)", color: "#e2e8f0", borderColor: "rgba(148,163,184,0.35)" };
};

export default function AreaOperationsCentre({
  areaKey,
  areaName,
  projectAssets,
  currentUserName = "Alistra User",
  onSelectAsset,
}: AreaOperationsCentreProps) {
  const [activeTab, setActiveTab] = useState<OperationsTab>("timeline");
  const [state, setState] = useState<OperationsState>(() => loadState(areaKey));
  const [messageBody, setMessageBody] = useState("");
  const [messageCategory, setMessageCategory] = useState("General");
  const [messagePriority, setMessagePriority] = useState<Priority>("Normal");
  const [messageAssetId, setMessageAssetId] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignedTo, setTaskAssignedTo] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState<Priority>("Normal");
  const [taskAssetId, setTaskAssetId] = useState("");

  const [blockerTitle, setBlockerTitle] = useState("");
  const [blockerOwner, setBlockerOwner] = useState("");
  const [blockerReason, setBlockerReason] = useState("");
  const [blockerPriority, setBlockerPriority] = useState<Priority>("High");
  const [blockerAssetId, setBlockerAssetId] = useState("");

  const [decisionTitle, setDecisionTitle] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [decisionApprovedBy, setDecisionApprovedBy] = useState(currentUserName);
  const [decisionAssetId, setDecisionAssetId] = useState("");

  const [handoverStage, setHandoverStage] = useState(stages[0]);
  const [handoverSummary, setHandoverSummary] = useState("");
  const [handoverRisks, setHandoverRisks] = useState("");
  const [handoverOwner, setHandoverOwner] = useState(currentUserName);

  useEffect(() => {
    setState(loadState(areaKey));
  }, [areaKey]);

  useEffect(() => {
    saveState(areaKey, state);
  }, [areaKey, state]);

  const assetLookup = useMemo(() => {
    const map = new Map<string, SavedMapAsset>();
    projectAssets.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [projectAssets]);

  const selectableAssets = useMemo(
    () => projectAssets.slice(0, 300).sort((a, b) => getAssetTitle(a).localeCompare(getAssetTitle(b))),
    [projectAssets],
  );

  const openTasks = state.tasks.filter((task) => task.status !== "Complete");
  const openBlockers = state.blockers.filter((blocker) => blocker.status !== "Resolved");
  const pinnedMessages = state.messages.filter((message) => message.pinned);

  const timelineItems = useMemo(() => {
    const items = [
      ...state.messages.map((message) => ({
        id: `message-${message.id}`,
        type: message.pinned ? "Pinned message" : "Message",
        title: message.body,
        meta: `${message.category} · ${message.priority} · ${message.author}`,
        at: message.createdAt,
        assetId: message.linkedAssetId,
      })),
      ...state.tasks.map((task) => ({
        id: `task-${task.id}`,
        type: "Task",
        title: task.title,
        meta: `${task.status} · ${task.priority} · ${task.assignedTo || "Unassigned"}`,
        at: task.createdAt,
        assetId: task.linkedAssetId,
      })),
      ...state.blockers.map((blocker) => ({
        id: `blocker-${blocker.id}`,
        type: blocker.status === "Resolved" ? "Resolved blocker" : "Blocker",
        title: blocker.title,
        meta: `${blocker.status} · ${blocker.priority} · ${blocker.owner || "No owner"}`,
        at: blocker.createdAt,
        assetId: blocker.linkedAssetId,
      })),
      ...state.decisions.map((decision) => ({
        id: `decision-${decision.id}`,
        type: "Decision",
        title: decision.title,
        meta: `Approved by ${decision.approvedBy || "Not stated"}`,
        at: decision.createdAt,
        assetId: decision.linkedAssetId,
      })),
      ...state.handovers.map((handover) => ({
        id: `handover-${handover.id}`,
        type: "Handover",
        title: handover.stage,
        meta: `${handover.owner || "No owner"} · ${handover.summary}`,
        at: handover.createdAt,
      })),
    ];
    return items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [state]);

  const updateState = (updater: (current: OperationsState) => OperationsState) => {
    setState((current) => updater(current));
  };

  const addMessage = () => {
    const body = messageBody.trim();
    if (!body) return;
    updateState((current) => ({
      ...current,
      messages: [
        {
          id: makeId(),
          body,
          category: messageCategory,
          priority: messagePriority,
          author: currentUserName,
          linkedAssetId: messageAssetId || undefined,
          createdAt: nowIso(),
        },
        ...current.messages,
      ],
    }));
    setMessageBody("");
    setMessageAssetId("");
  };

  const addTask = () => {
    const title = taskTitle.trim();
    if (!title) return;
    updateState((current) => ({
      ...current,
      tasks: [
        {
          id: makeId(),
          title,
          assignedTo: taskAssignedTo.trim() || "Unassigned",
          dueDate: taskDueDate,
          priority: taskPriority,
          status: "Open",
          linkedAssetId: taskAssetId || undefined,
          createdAt: nowIso(),
        },
        ...current.tasks,
      ],
    }));
    setTaskTitle("");
    setTaskAssignedTo("");
    setTaskDueDate("");
    setTaskAssetId("");
  };

  const addBlocker = () => {
    const title = blockerTitle.trim();
    if (!title) return;
    updateState((current) => ({
      ...current,
      blockers: [
        {
          id: makeId(),
          title,
          owner: blockerOwner.trim() || "Unassigned",
          reason: blockerReason.trim(),
          priority: blockerPriority,
          status: "Open",
          linkedAssetId: blockerAssetId || undefined,
          createdAt: nowIso(),
        },
        ...current.blockers,
      ],
    }));
    setBlockerTitle("");
    setBlockerOwner("");
    setBlockerReason("");
    setBlockerAssetId("");
  };

  const addDecision = () => {
    const title = decisionTitle.trim();
    if (!title) return;
    updateState((current) => ({
      ...current,
      decisions: [
        {
          id: makeId(),
          title,
          reason: decisionReason.trim(),
          approvedBy: decisionApprovedBy.trim() || currentUserName,
          linkedAssetId: decisionAssetId || undefined,
          createdAt: nowIso(),
        },
        ...current.decisions,
      ],
    }));
    setDecisionTitle("");
    setDecisionReason("");
    setDecisionAssetId("");
  };

  const addHandover = () => {
    const summary = handoverSummary.trim();
    if (!summary) return;
    updateState((current) => ({
      ...current,
      handovers: [
        {
          id: makeId(),
          stage: handoverStage,
          summary,
          risks: handoverRisks.trim(),
          owner: handoverOwner.trim() || currentUserName,
          createdAt: nowIso(),
        },
        ...current.handovers,
      ],
    }));
    setHandoverSummary("");
    setHandoverRisks("");
  };

  const selectLinkedAsset = (assetId?: string) => {
    if (!assetId) return;
    const asset = assetLookup.get(assetId);
    if (asset) onSelectAsset?.(asset);
  };

  const assetSelect = (value: string, onChange: (next: string) => void) => (
    <select style={inputStyle} value={value} onChange={(event) => onChange(event.target.value)}>
      <option value="">No linked asset</option>
      {selectableAssets.map((asset) => (
        <option key={asset.id} value={asset.id}>
          {getAssetTitle(asset)}
        </option>
      ))}
    </select>
  );

  const linkedAssetButton = (assetId?: string) => {
    if (!assetId) return null;
    const asset = assetLookup.get(assetId);
    if (!asset) return null;
    return (
      <button type="button" style={assetButton} onClick={() => selectLinkedAsset(assetId)}>
        Linked asset: {getAssetTitle(asset)}
      </button>
    );
  };

  return (
    <section style={shellStyle}>
      <div style={headerStyle}>
        <div>
          <div style={kickerStyle}>OPERATIONS CENTRE</div>
          <h3 style={titleStyle}>{areaName} Operations</h3>
          <p style={hintStyle}>
            Area timeline, messages, tasks, blockers, decisions and handover notes tied directly to the project workspace.
          </p>
        </div>
        <div style={summaryGridStyle}>
          <SummaryCard label="Open Tasks" value={openTasks.length} tone={openTasks.length ? "amber" : "green"} />
          <SummaryCard label="Open Blockers" value={openBlockers.length} tone={openBlockers.length ? "red" : "green"} />
          <SummaryCard label="Pinned" value={pinnedMessages.length} tone={pinnedMessages.length ? "blue" : "muted"} />
          <SummaryCard label="Decisions" value={state.decisions.length} tone="muted" />
        </div>
      </div>

      {pinnedMessages.length ? (
        <div style={pinnedPanelStyle}>
          <strong>PINNED NOTICES</strong>
          <div style={pinnedListStyle}>
            {pinnedMessages.slice(0, 3).map((message) => (
              <div key={message.id} style={pinnedItemStyle}>
                <span>{message.body}</span>
                {linkedAssetButton(message.linkedAssetId)}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div style={tabBarStyle}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            style={tabButtonStyle(activeTab === tab.id)}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "timeline" && (
        <div style={contentGridStyle}>
          <div style={listPanelStyle}>
            <SectionTitle title="Area Timeline" subtitle="Messages, tasks, blockers, decisions and handovers in one feed." />
            {timelineItems.length ? timelineItems.map((item) => (
              <div key={item.id} style={timelineItemStyle}>
                <div style={timelineTimeStyle}>{formatDateTime(item.at)}</div>
                <div style={timelineBodyStyle}>
                  <div style={itemTypeStyle}>{item.type}</div>
                  <strong>{item.title}</strong>
                  <div style={mutedStyle}>{item.meta}</div>
                  {linkedAssetButton(item.assetId)}
                </div>
              </div>
            )) : <EmptyState text="No operations activity yet. Add a message, task, blocker, decision or handover note." />}
          </div>
          <NextActionPanel openTasks={openTasks.length} openBlockers={openBlockers.length} />
        </div>
      )}

      {activeTab === "messages" && (
        <div style={contentGridStyle}>
          <div style={formPanelStyle}>
            <SectionTitle title="Post Message" subtitle="Use categories and priorities instead of scattered chat." />
            <textarea style={textareaStyle} value={messageBody} onChange={(event) => setMessageBody(event.target.value)} placeholder="Post an area update, mention @QA Team or record a blocker note..." />
            <div style={formGridStyle}>
              <select style={inputStyle} value={messageCategory} onChange={(event) => setMessageCategory(event.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
              <select style={inputStyle} value={messagePriority} onChange={(event) => setMessagePriority(event.target.value as Priority)}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
              {assetSelect(messageAssetId, setMessageAssetId)}
            </div>
            <button type="button" style={primaryButtonStyle} onClick={addMessage}>Post Message</button>
          </div>
          <div style={listPanelStyle}>
            <SectionTitle title="Team Messages" subtitle="Pin key notices so they stay visible." />
            {state.messages.length ? state.messages.map((message) => (
              <RecordCard key={message.id} title={message.body} meta={`${message.category} · ${message.author} · ${formatDateTime(message.createdAt)}`} priority={message.priority}>
                {linkedAssetButton(message.linkedAssetId)}
                <button type="button" style={secondaryButtonStyle} onClick={() => updateState((current) => ({ ...current, messages: current.messages.map((item) => item.id === message.id ? { ...item, pinned: !item.pinned } : item) }))}>{message.pinned ? "Unpin" : "Pin"}</button>
              </RecordCard>
            )) : <EmptyState text="No messages posted yet." />}
          </div>
        </div>
      )}

      {activeTab === "tasks" && (
        <div style={contentGridStyle}>
          <div style={formPanelStyle}>
            <SectionTitle title="Create Task" subtitle="Assign a clear owner, due date and linked asset." />
            <input style={inputStyle} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" />
            <div style={formGridStyle}>
              <input style={inputStyle} value={taskAssignedTo} onChange={(event) => setTaskAssignedTo(event.target.value)} placeholder="Assigned to" />
              <input style={inputStyle} type="date" value={taskDueDate} onChange={(event) => setTaskDueDate(event.target.value)} />
              <select style={inputStyle} value={taskPriority} onChange={(event) => setTaskPriority(event.target.value as Priority)}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
              {assetSelect(taskAssetId, setTaskAssetId)}
            </div>
            <button type="button" style={primaryButtonStyle} onClick={addTask}>Create Task</button>
          </div>
          <div style={listPanelStyle}>
            <SectionTitle title="Task Manager" subtitle="Move actions from chat into trackable work." />
            {state.tasks.length ? state.tasks.map((task) => (
              <RecordCard key={task.id} title={task.title} meta={`${task.status} · ${task.assignedTo} · Due ${task.dueDate || "not set"}`} priority={task.priority}>
                {linkedAssetButton(task.linkedAssetId)}
                <div style={buttonRowStyle}>
                  {(["Open", "In Progress", "Complete"] as TaskStatus[]).map((status) => (
                    <button key={status} type="button" style={secondaryButtonStyle} onClick={() => updateState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status } : item) }))}>{status}</button>
                  ))}
                </div>
              </RecordCard>
            )) : <EmptyState text="No tasks created yet." />}
          </div>
        </div>
      )}

      {activeTab === "blockers" && (
        <div style={contentGridStyle}>
          <div style={formPanelStyle}>
            <SectionTitle title="Raise Blocker" subtitle="Track issues stopping delivery, walk-off, commercial approval or RFS." />
            <input style={inputStyle} value={blockerTitle} onChange={(event) => setBlockerTitle(event.target.value)} placeholder="Blocker title" />
            <textarea style={textareaStyle} value={blockerReason} onChange={(event) => setBlockerReason(event.target.value)} placeholder="Reason / impact" />
            <div style={formGridStyle}>
              <input style={inputStyle} value={blockerOwner} onChange={(event) => setBlockerOwner(event.target.value)} placeholder="Owner" />
              <select style={inputStyle} value={blockerPriority} onChange={(event) => setBlockerPriority(event.target.value as Priority)}>{priorities.map((priority) => <option key={priority}>{priority}</option>)}</select>
              {assetSelect(blockerAssetId, setBlockerAssetId)}
            </div>
            <button type="button" style={dangerButtonStyle} onClick={addBlocker}>Raise Blocker</button>
          </div>
          <div style={listPanelStyle}>
            <SectionTitle title="Blockers Board" subtitle="Keep delivery blockers visible until resolved." />
            {state.blockers.length ? state.blockers.map((blocker) => (
              <RecordCard key={blocker.id} title={blocker.title} meta={`${blocker.status} · ${blocker.owner} · ${formatDateTime(blocker.createdAt)}`} priority={blocker.priority}>
                {blocker.reason ? <div style={mutedStyle}>{blocker.reason}</div> : null}
                {linkedAssetButton(blocker.linkedAssetId)}
                <button type="button" style={secondaryButtonStyle} onClick={() => updateState((current) => ({ ...current, blockers: current.blockers.map((item) => item.id === blocker.id ? { ...item, status: item.status === "Resolved" ? "Open" : "Resolved", resolvedAt: item.status === "Resolved" ? undefined : nowIso() } : item) }))}>{blocker.status === "Resolved" ? "Reopen" : "Mark Resolved"}</button>
              </RecordCard>
            )) : <EmptyState text="No blockers raised." />}
          </div>
        </div>
      )}

      {activeTab === "decisions" && (
        <div style={contentGridStyle}>
          <div style={formPanelStyle}>
            <SectionTitle title="Record Decision" subtitle="Permanent project decisions separate from chat." />
            <input style={inputStyle} value={decisionTitle} onChange={(event) => setDecisionTitle(event.target.value)} placeholder="Decision" />
            <textarea style={textareaStyle} value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Reason / evidence" />
            <div style={formGridStyle}>
              <input style={inputStyle} value={decisionApprovedBy} onChange={(event) => setDecisionApprovedBy(event.target.value)} placeholder="Approved by" />
              {assetSelect(decisionAssetId, setDecisionAssetId)}
            </div>
            <button type="button" style={primaryButtonStyle} onClick={addDecision}>Record Decision</button>
          </div>
          <div style={listPanelStyle}>
            <SectionTitle title="Decisions Register" subtitle="Important area decisions retained with the workspace." />
            {state.decisions.length ? state.decisions.map((decision) => (
              <RecordCard key={decision.id} title={decision.title} meta={`Approved by ${decision.approvedBy} · ${formatDateTime(decision.createdAt)}`} priority="Normal">
                {decision.reason ? <div style={mutedStyle}>{decision.reason}</div> : null}
                {linkedAssetButton(decision.linkedAssetId)}
              </RecordCard>
            )) : <EmptyState text="No decisions recorded yet." />}
          </div>
        </div>
      )}

      {activeTab === "handover" && (
        <div style={contentGridStyle}>
          <div style={formPanelStyle}>
            <SectionTitle title="Stage Handover" subtitle="Leave structured notes for the next team." />
            <select style={inputStyle} value={handoverStage} onChange={(event) => setHandoverStage(event.target.value)}>{stages.map((stage) => <option key={stage}>{stage}</option>)}</select>
            <textarea style={textareaStyle} value={handoverSummary} onChange={(event) => setHandoverSummary(event.target.value)} placeholder="Summary for the next team" />
            <textarea style={textareaStyle} value={handoverRisks} onChange={(event) => setHandoverRisks(event.target.value)} placeholder="Outstanding risks / actions" />
            <input style={inputStyle} value={handoverOwner} onChange={(event) => setHandoverOwner(event.target.value)} placeholder="Owner" />
            <button type="button" style={primaryButtonStyle} onClick={addHandover}>Save Handover</button>
          </div>
          <div style={listPanelStyle}>
            <SectionTitle title="Handover Centre" subtitle="Survey, build, QA, PIA, commercial and operations handovers." />
            {state.handovers.length ? state.handovers.map((handover) => (
              <RecordCard key={handover.id} title={handover.stage} meta={`${handover.owner} · ${formatDateTime(handover.createdAt)}`} priority="Normal">
                <div>{handover.summary}</div>
                {handover.risks ? <div style={mutedStyle}>Risks: {handover.risks}</div> : null}
              </RecordCard>
            )) : <EmptyState text="No handover notes saved yet." />}
          </div>
        </div>
      )}
    </section>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "green" | "amber" | "red" | "blue" | "muted" }) {
  const toneStyle: Record<typeof tone, React.CSSProperties> = {
    green: { borderColor: "rgba(34,197,94,0.45)", color: "#bbf7d0" },
    amber: { borderColor: "rgba(245,158,11,0.45)", color: "#fde68a" },
    red: { borderColor: "rgba(248,113,113,0.55)", color: "#fecaca" },
    blue: { borderColor: "rgba(96,165,250,0.45)", color: "#bfdbfe" },
    muted: { borderColor: "rgba(148,163,184,0.28)", color: "#e2e8f0" },
  };
  return <div style={{ ...summaryCardStyle, ...toneStyle[tone] }}><span>{label}</span><strong>{value}</strong></div>;
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div style={{ marginBottom: 12 }}><h4 style={sectionTitleStyle}>{title}</h4><div style={hintStyle}>{subtitle}</div></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div style={emptyStyle}>{text}</div>;
}

function RecordCard({ title, meta, priority, children }: { title: string; meta: string; priority: Priority; children?: React.ReactNode }) {
  return <div style={recordCardStyle}><div style={recordHeaderStyle}><strong>{title}</strong><span style={{ ...pillStyle, ...priorityStyle(priority) }}>{priority}</span></div><div style={mutedStyle}>{meta}</div><div style={{ marginTop: 10 }}>{children}</div></div>;
}

function NextActionPanel({ openTasks, openBlockers }: { openTasks: number; openBlockers: number }) {
  const nextAction = openBlockers > 0 ? "Resolve open blockers first." : openTasks > 0 ? "Close or progress open tasks." : "No open blockers or tasks. Area operations are clear.";
  return <div style={sidePanelStyle}><SectionTitle title="Next Action" subtitle="Quick operational focus for managers." /><div style={nextActionStyle}>{nextAction}</div><div style={miniStatStyle}>Open blockers: {openBlockers}</div><div style={miniStatStyle}>Open tasks: {openTasks}</div></div>;
}

const shellStyle: React.CSSProperties = { border: "1px solid rgba(59,130,246,0.22)", background: "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(2,6,23,0.98))", borderRadius: 22, padding: 18, boxShadow: "0 24px 70px rgba(2,6,23,0.42)", color: "#e2e8f0" };
const headerStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(260px, 0.7fr)", gap: 16, alignItems: "start", marginBottom: 16 };
const kickerStyle: React.CSSProperties = { fontSize: 11, letterSpacing: 0.6, color: "#60a5fa", fontWeight: 900 };
const titleStyle: React.CSSProperties = { margin: "4px 0", fontSize: 24, color: "#f8fafc" };
const hintStyle: React.CSSProperties = { color: "#94a3b8", fontSize: 12, lineHeight: 1.45 };
const summaryGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 };
const summaryCardStyle: React.CSSProperties = { border: "1px solid", borderRadius: 14, padding: "10px 12px", background: "rgba(15,23,42,0.72)", display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12 };
const tabBarStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, margin: "14px 0" };
const tabButtonStyle = (active: boolean): React.CSSProperties => ({ border: `1px solid ${active ? "rgba(96,165,250,0.7)" : "rgba(148,163,184,0.28)"}`, background: active ? "rgba(37,99,235,0.28)" : "rgba(15,23,42,0.68)", color: active ? "#dbeafe" : "#cbd5e1", borderRadius: 999, padding: "8px 12px", cursor: "pointer", fontWeight: 800, fontSize: 12 });
const contentGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "minmax(0, 0.95fr) minmax(320px, 1.05fr)", gap: 14, alignItems: "start" };
const formPanelStyle: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", borderRadius: 18, padding: 14, background: "rgba(15,23,42,0.68)" };
const listPanelStyle: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", borderRadius: 18, padding: 14, background: "rgba(15,23,42,0.5)", maxHeight: 620, overflow: "auto" };
const sidePanelStyle: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.22)", borderRadius: 18, padding: 14, background: "rgba(15,23,42,0.5)" };
const sectionTitleStyle: React.CSSProperties = { margin: 0, color: "#f8fafc", fontSize: 16 };
const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", border: "1px solid rgba(148,163,184,0.28)", borderRadius: 12, padding: "10px 12px", background: "rgba(2,6,23,0.8)", color: "#e2e8f0", outline: "none" };
const textareaStyle: React.CSSProperties = { ...inputStyle, minHeight: 90, resize: "vertical" };
const formGridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 10 };
const primaryButtonStyle: React.CSSProperties = { border: "1px solid rgba(96,165,250,0.55)", background: "rgba(37,99,235,0.32)", color: "#dbeafe", borderRadius: 12, padding: "10px 14px", cursor: "pointer", fontWeight: 900, marginTop: 10 };
const dangerButtonStyle: React.CSSProperties = { ...primaryButtonStyle, borderColor: "rgba(248,113,113,0.55)", background: "rgba(220,38,38,0.24)", color: "#fecaca" };
const secondaryButtonStyle: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.3)", background: "rgba(15,23,42,0.72)", color: "#cbd5e1", borderRadius: 10, padding: "7px 10px", cursor: "pointer", fontWeight: 800, fontSize: 12 };
const assetButton: React.CSSProperties = { ...secondaryButtonStyle, marginTop: 8, color: "#bfdbfe", borderColor: "rgba(96,165,250,0.38)" };
const buttonRowStyle: React.CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 };
const recordCardStyle: React.CSSProperties = { border: "1px solid rgba(148,163,184,0.18)", borderRadius: 16, padding: 12, background: "rgba(2,6,23,0.48)", marginBottom: 10 };
const recordHeaderStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
const mutedStyle: React.CSSProperties = { color: "#94a3b8", fontSize: 12, marginTop: 4, lineHeight: 1.4 };
const pillStyle: React.CSSProperties = { border: "1px solid", borderRadius: 999, padding: "4px 8px", fontSize: 11, fontWeight: 900, whiteSpace: "nowrap" };
const emptyStyle: React.CSSProperties = { border: "1px dashed rgba(148,163,184,0.26)", borderRadius: 14, padding: 16, color: "#94a3b8", background: "rgba(2,6,23,0.35)", fontSize: 13 };
const timelineItemStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "92px minmax(0, 1fr)", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(148,163,184,0.14)" };
const timelineTimeStyle: React.CSSProperties = { color: "#93c5fd", fontSize: 12, fontWeight: 900 };
const timelineBodyStyle: React.CSSProperties = { color: "#e2e8f0" };
const itemTypeStyle: React.CSSProperties = { color: "#60a5fa", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 };
const pinnedPanelStyle: React.CSSProperties = { border: "1px solid rgba(250,204,21,0.35)", borderRadius: 16, padding: 12, background: "rgba(113,63,18,0.18)", marginBottom: 12, color: "#fde68a" };
const pinnedListStyle: React.CSSProperties = { display: "grid", gap: 8, marginTop: 8 };
const pinnedItemStyle: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", color: "#fef3c7", fontSize: 13 };
const nextActionStyle: React.CSSProperties = { border: "1px solid rgba(96,165,250,0.35)", borderRadius: 14, padding: 14, background: "rgba(30,64,175,0.18)", color: "#dbeafe", fontWeight: 900 };
const miniStatStyle: React.CSSProperties = { marginTop: 10, color: "#cbd5e1", fontSize: 13 };
