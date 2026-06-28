import {
  createEngineeringQueueFromInput,
} from './engineeringQueueAutomation';
import type {
  EngineeringQueueCreationContext,
  EngineeringQueueCreationResult,
} from './engineeringQueueAutomation';
import type {
  EngineeringAssetSnapshot,
  EngineeringChangeInput,
  EngineeringHistoryEvent,
  EngineeringQueueItem,
} from './engineeringTypes';

export type EngineeringPersistSave<TSaveResult> = () => Promise<TSaveResult> | TSaveResult;

export interface EngineeringSaveIntegrationContext extends EngineeringQueueCreationContext {
  persistQueueItem?: (item: EngineeringQueueItem) => Promise<void> | void;
  persistHistoryEvent?: (event: EngineeringHistoryEvent) => Promise<void> | void;
  onEngineeringResult?: (result: EngineeringQueueCreationResult) => Promise<void> | void;
  blockSaveWhenApprovalRequired?: boolean;
}

export interface EngineeringSaveIntegrationResult<TSaveResult> {
  saved: boolean;
  saveResult?: TSaveResult;
  engineering: EngineeringQueueCreationResult;
  blockedReason?: string;
}

export class EngineeringSaveBlockedError extends Error {
  public readonly engineering: EngineeringQueueCreationResult;

  constructor(message: string, engineering: EngineeringQueueCreationResult) {
    super(message);
    this.name = 'EngineeringSaveBlockedError';
    this.engineering = engineering;
  }
}

export async function runEngineeringPreSaveAnalysis(
  input: EngineeringChangeInput,
  context: EngineeringSaveIntegrationContext,
): Promise<EngineeringQueueCreationResult> {
  const engineering = createEngineeringQueueFromInput(input, context);

  if (engineering.queueItem && context.persistQueueItem) {
    await context.persistQueueItem(engineering.queueItem);
  }

  if (context.persistHistoryEvent) {
    for (const event of engineering.historyEvents) {
      await context.persistHistoryEvent(event);
    }
  }

  if (context.onEngineeringResult) {
    await context.onEngineeringResult(engineering);
  }

  return engineering;
}

export async function withEngineeringSaveAnalysis<TSaveResult>(params: {
  before?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null;
  after?: EngineeringAssetSnapshot | EngineeringAssetSnapshot[] | null;
  context: EngineeringSaveIntegrationContext;
  persistSave: EngineeringPersistSave<TSaveResult>;
}): Promise<EngineeringSaveIntegrationResult<TSaveResult>> {
  const engineering = await runEngineeringPreSaveAnalysis(
    {
      before: params.before,
      after: params.after,
      areaId: params.context.areaId,
      userId: params.context.createdBy,
      source: params.context.source,
    },
    params.context,
  );

  if (params.context.blockSaveWhenApprovalRequired && engineering.shouldBlockAutoIssue) {
    const blockedReason = engineering.queueItem
      ? `Engineering approval required for ${engineering.queueItem.reason}`
      : 'Engineering approval required';

    return {
      saved: false,
      engineering,
      blockedReason,
    };
  }

  const saveResult = await params.persistSave();

  return {
    saved: true,
    saveResult,
    engineering,
  };
}

export function assertEngineeringSaveAllowed<TSaveResult>(
  result: EngineeringSaveIntegrationResult<TSaveResult>,
): EngineeringSaveIntegrationResult<TSaveResult> {
  if (!result.saved) {
    throw new EngineeringSaveBlockedError(result.blockedReason ?? 'Engineering save blocked', result.engineering);
  }

  return result;
}

export function createNoopEngineeringPersistence() {
  const queue: EngineeringQueueItem[] = [];
  const history: EngineeringHistoryEvent[] = [];

  return {
    queue,
    history,
    persistQueueItem(item: EngineeringQueueItem) {
      queue.push(item);
    },
    persistHistoryEvent(event: EngineeringHistoryEvent) {
      history.push(event);
    },
  };
}
