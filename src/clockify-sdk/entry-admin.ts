import { entriesService } from "./entries";
import { tasksService } from "./tasks";
import { mergeEntryUpdate, EntryEdits } from "../config/entry-merge";
import {
  mapWithConcurrency,
  withRateLimitRetry,
} from "../config/concurrency";
import {
  resolveTaskMapping,
  TaskMappingStrategy,
} from "../config/task-mapping";

export interface EntrySnapshot {
  description?: string;
  billable?: boolean;
  start?: string;
  end?: string;
  projectId?: string;
  taskId?: string;
  tagIds?: string[];
  customFieldValues?: { customFieldId: string; value: unknown }[];
}

export interface BulkItemResult {
  timeEntryId: string;
  status: "planned" | "updated" | "failed";
  before?: EntrySnapshot;
  after?: Record<string, unknown>;
  taskAction?: string;
  error?: string;
}

export interface BulkManifest {
  dryRun: boolean;
  total: number;
  succeeded: number;
  failed: number;
  createdTasks: { id: string; name: string }[];
  items: BulkItemResult[];
}

/**
 * Snapshot the mutable fields of an entry before changing it, so bulk
 * manifests double as undo files.
 */
function snapshotEntry(entry: any): EntrySnapshot {
  return {
    description: entry.description,
    billable: entry.billable,
    start: entry.timeInterval?.start,
    end: entry.timeInterval?.end,
    projectId: entry.projectId,
    taskId: entry.taskId,
    tagIds: entry.tagIds,
    customFieldValues: (entry.customFieldValues ?? []).map((cf: any) => ({
      customFieldId: cf.customFieldId,
      value: cf.value,
    })),
  };
}

function errorMessage(error: any): string {
  const apiMessage = error?.response?.data?.message;
  const status = error?.response?.status;
  const base = apiMessage ?? error?.message ?? "Unknown error";
  if (status === 403) {
    return `${base} (403 — the entry may be locked/approved/invoiced, or the token lacks admin permission)`;
  }
  return status ? `${base} (HTTP ${status})` : base;
}

function summarize(
  dryRun: boolean,
  items: BulkItemResult[],
  createdTasks: { id: string; name: string }[]
): BulkManifest {
  const failed = items.filter((item) => item.status === "failed").length;
  return {
    dryRun,
    total: items.length,
    succeeded: items.length - failed,
    failed,
    createdTasks,
    items,
  };
}

export interface BulkEditParams {
  workspaceId: string;
  edits: ({ timeEntryId: string } & EntryEdits)[];
  dryRun: boolean;
}

export async function bulkEditEntries(
  params: BulkEditParams
): Promise<BulkManifest> {
  const { workspaceId, dryRun } = params;

  const items = await mapWithConcurrency(params.edits, async (edit) => {
    const { timeEntryId, ...fields } = edit;
    try {
      const current = await withRateLimitRetry(() =>
        entriesService.getById(workspaceId, timeEntryId)
      );
      const body = mergeEntryUpdate(current.data, fields);
      const result: BulkItemResult = {
        timeEntryId,
        status: "planned",
        before: snapshotEntry(current.data),
        after: body,
      };

      if (!dryRun) {
        await withRateLimitRetry(() =>
          entriesService.update(workspaceId, timeEntryId, body)
        );
        result.status = "updated";
      }
      return result;
    } catch (error: any) {
      return {
        timeEntryId,
        status: "failed" as const,
        error: errorMessage(error),
      };
    }
  });

  return summarize(dryRun, items, []);
}

export interface MoveEntriesParams {
  workspaceId: string;
  timeEntryIds: string[];
  targetProjectId: string;
  taskMappingStrategy: TaskMappingStrategy;
  dryRun: boolean;
}

export async function moveTimeEntries(
  params: MoveEntriesParams
): Promise<BulkManifest> {
  const { workspaceId, targetProjectId, taskMappingStrategy, dryRun } = params;

  // Target task names are needed to remap; fetched once up front
  const targetTaskIdsByName = new Map<string, string>();
  if (taskMappingStrategy === "match-by-name") {
    const targetTasks = await tasksService.fetchAll(
      workspaceId,
      targetProjectId
    );
    for (const task of targetTasks.data) {
      targetTaskIdsByName.set(String(task.name).toLowerCase(), task.id);
    }
  }

  // Caches shared across items: source task names (many entries share a
  // task) and created target tasks (so concurrent items don't create dupes)
  const sourceTaskNames = new Map<string, Promise<string | undefined>>();
  const creations = new Map<string, Promise<{ id: string; name: string }>>();
  const createdTasks: { id: string; name: string }[] = [];

  function getSourceTaskName(
    projectId: string,
    taskId: string
  ): Promise<string | undefined> {
    const key = `${projectId}/${taskId}`;
    let pending = sourceTaskNames.get(key);
    if (!pending) {
      pending = withRateLimitRetry(() =>
        tasksService.getById(workspaceId, projectId, taskId)
      ).then(
        (response) => response.data?.name,
        () => undefined
      );
      sourceTaskNames.set(key, pending);
    }
    return pending;
  }

  function createTargetTask(name: string): Promise<{ id: string; name: string }> {
    const key = name.toLowerCase();
    let pending = creations.get(key);
    if (!pending) {
      pending = withRateLimitRetry(() =>
        tasksService.create({
          workspaceId,
          projectId: targetProjectId,
          name,
        })
      ).then(
        (response) => {
          const created = { id: response.data.id, name };
          createdTasks.push(created);
          targetTaskIdsByName.set(key, created.id);
          return created;
        },
        (error) => {
          // Drop the failed attempt from the cache so one transient error
          // doesn't cascade to every later entry sharing this task name
          creations.delete(key);
          throw error;
        }
      );
      creations.set(key, pending);
    }
    return pending;
  }

  const items = await mapWithConcurrency(
    params.timeEntryIds,
    async (timeEntryId) => {
      try {
        const current = await withRateLimitRetry(() =>
          entriesService.getById(workspaceId, timeEntryId)
        );
        const entry = current.data;

        // Task names only matter for match-by-name; clear/fail strategies
        // just need to know whether a task is present
        const needsTaskName = taskMappingStrategy === "match-by-name";
        const sourceTaskName =
          needsTaskName && entry.taskId && entry.projectId
            ? await getSourceTaskName(entry.projectId, entry.taskId)
            : undefined;

        if (needsTaskName && entry.taskId && !sourceTaskName) {
          return {
            timeEntryId,
            status: "failed" as const,
            before: snapshotEntry(entry),
            error: `Could not resolve the name of task ${entry.taskId} on project ${entry.projectId}; entry skipped to avoid a wrong mapping`,
          };
        }

        const mapping = resolveTaskMapping(
          taskMappingStrategy,
          entry.taskId ? sourceTaskName ?? String(entry.taskId) : undefined,
          targetTaskIdsByName
        );

        if (mapping.action === "fail") {
          return {
            timeEntryId,
            status: "failed" as const,
            before: snapshotEntry(entry),
            error: mapping.reason,
          };
        }

        let taskId: string | null;
        let taskAction: string;
        if (mapping.action === "none") {
          taskId = null;
          taskAction = "no-task";
        } else if (mapping.action === "clear") {
          taskId = null;
          taskAction = "cleared";
        } else if (mapping.action === "map") {
          taskId = mapping.taskId;
          taskAction = `mapped-to:${mapping.taskId}`;
        } else if (dryRun) {
          taskId = null;
          taskAction = `would-create-task:${mapping.name}`;
        } else {
          const created = await createTargetTask(mapping.name);
          taskId = created.id;
          taskAction = `created-task:${created.id}`;
        }

        const body = mergeEntryUpdate(entry, {
          projectId: targetProjectId,
          taskId,
        });

        const result: BulkItemResult = {
          timeEntryId,
          status: "planned",
          before: snapshotEntry(entry),
          after: body,
          taskAction,
        };

        if (!dryRun) {
          await withRateLimitRetry(() =>
            entriesService.update(workspaceId, timeEntryId, body)
          );
          result.status = "updated";
        }
        return result;
      } catch (error: any) {
        return {
          timeEntryId,
          status: "failed" as const,
          error: errorMessage(error),
        };
      }
    }
  );

  return summarize(dryRun, items, createdTasks);
}
