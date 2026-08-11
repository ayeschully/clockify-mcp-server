import { z } from "zod";
import { TOOLS_CONFIG } from "../config/api";
import { bulkEditEntries, moveTimeEntries } from "../clockify-sdk/entry-admin";
import {
  McpResponse,
  McpToolConfig,
  TBulkEditEntriesSchema,
  TMoveEntriesSchema,
} from "../types";
import { BULK_MAX_ITEMS } from "../validation/entries/bulk-edit-entries-schema";

const DRY_RUN_NOTE =
  "DRY RUN — nothing was written. Review the plan, then re-run with dryRun=false to execute";

export const bulkEditEntriesTool: McpToolConfig = {
  name: TOOLS_CONFIG.entries.bulkEdit.name,
  description: TOOLS_CONFIG.entries.bulkEdit.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace the entries belong to"),
    edits: z
      .array(
        z.object({
          timeEntryId: z.string().describe("The id of the entry to edit"),
          description: z.string().optional(),
          billable: z.boolean().optional(),
          start: z.coerce.date().optional(),
          end: z.coerce.date().optional(),
          projectId: z.string().optional(),
          taskId: z
            .string()
            .nullable()
            .optional()
            .describe("New task id, or null to clear the task"),
          tagIds: z.array(z.string()).optional(),
        })
      )
      .min(1)
      .max(BULK_MAX_ITEMS)
      .describe(
        `Array of per-entry edits (max ${BULK_MAX_ITEMS} per call). Omitted fields are preserved, never cleared`
      ),
    dryRun: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to TRUE: returns before/after for every entry without writing. Set to false explicitly to execute"
      ),
  },
  handler: async (params: TBulkEditEntriesSchema): Promise<McpResponse> => {
    try {
      const manifest = await bulkEditEntries({
        workspaceId: params.workspaceId,
        edits: params.edits,
        dryRun: params.dryRun ?? true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...manifest,
              note: manifest.dryRun ? DRY_RUN_NOTE : undefined,
            }),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to bulk edit entries: ${error.message}`);
    }
  },
};

export const moveEntriesTool: McpToolConfig = {
  name: TOOLS_CONFIG.entries.move.name,
  description: TOOLS_CONFIG.entries.move.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace the entries belong to"),
    timeEntryIds: z
      .array(z.string())
      .min(1)
      .max(BULK_MAX_ITEMS)
      .describe(
        `Ids of the entries to move (max ${BULK_MAX_ITEMS} per call). Get them from get-detailed-report`
      ),
    targetProjectId: z
      .string()
      .describe("The project to move the entries to"),
    taskMappingStrategy: z
      .enum(["clear", "match-by-name", "fail-if-task-present"])
      .optional()
      .default("clear")
      .describe(
        "Tasks are project-scoped, so moved entries need task handling: clear the task, map to a same-named task on the target (created if absent), or fail entries that have a task"
      ),
    dryRun: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to TRUE: returns the move plan without writing. Set to false explicitly to execute"
      ),
  },
  handler: async (params: TMoveEntriesSchema): Promise<McpResponse> => {
    try {
      const manifest = await moveTimeEntries({
        workspaceId: params.workspaceId,
        timeEntryIds: params.timeEntryIds,
        targetProjectId: params.targetProjectId,
        taskMappingStrategy: params.taskMappingStrategy ?? "clear",
        dryRun: params.dryRun ?? true,
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...manifest,
              targetProjectId: params.targetProjectId,
              note: manifest.dryRun ? DRY_RUN_NOTE : undefined,
            }),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to move entries: ${error.message}`);
    }
  },
};
