import { projectsService } from "../clockify-sdk/projects";
import { reportsService } from "../clockify-sdk/reports";
import { moveTimeEntries } from "../clockify-sdk/entry-admin";
import { TOOLS_CONFIG } from "../config/api";
import { BULK_MAX_ITEMS } from "../validation/entries/bulk-edit-entries-schema";
import { z } from "zod";
import {
  McpResponse,
  McpToolConfig,
  TEditProjectSchema,
  TListProjectsSchema,
  TMergeProjectsSchema,
} from "../types";

function mapFullProject(project: any): Record<string, unknown> {
  return {
    id: project.id,
    name: project.name,
    clientId: project.clientId,
    clientName: project.clientName,
    archived: project.archived,
    billable: project.billable,
    color: project.color,
    note: project.note,
    public: project.public,
    estimate: project.estimate,
    budgetEstimate: project.budgetEstimate,
    customFields: (project.customFields ?? []).map((field: any) => ({
      customFieldId: field.customFieldId ?? field.id,
      name: field.name,
      type: field.type,
      value: field.value ?? field.defaultValue,
    })),
  };
}

export const findProjectTool: McpToolConfig = {
  name: TOOLS_CONFIG.projects.list.name,
  description: TOOLS_CONFIG.projects.list.description,
  parameters: {
    workspaceId: z
      .string()
      .describe(
        "The ID of the workspace that you need to get the projects from"
      ),
    archived: z
      .enum(["active", "archived", "both"])
      .optional()
      .default("active")
      .describe("Which projects to return: active (default), archived or both"),
    full: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "When true, returns complete project objects including customFields, archived, clientId, billable, note, color, public and estimates"
      ),
  },
  handler: async (params: TListProjectsSchema): Promise<McpResponse> => {
    if (!params.workspaceId || typeof params.workspaceId !== "string")
      throw new Error("Workspace ID required to fetch projects");

    try {
      const response = await projectsService.fetchAll(params.workspaceId, {
        archived: params.archived,
        hydrated: params.full,
      });

      const projects = params.full
        ? response.data.map(mapFullProject)
        : response.data.map((project: any) => ({
            id: project.id,
            name: project.name,
            clientName: project.clientName,
            archived: project.archived,
          }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              count: projects.length,
              complete: true, // fetchAllPages always drains every page
              projects,
            }),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve projects: ${error.message}`);
    }
  },
};

export const editProjectTool: McpToolConfig = {
  name: TOOLS_CONFIG.projects.edit.name,
  description: TOOLS_CONFIG.projects.edit.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace where the project is located"),
    projectId: z.string().describe("The id of the project to be edited"),
    name: z.string().optional().describe("The new name of the project"),
    clientId: z
      .string()
      .optional()
      .describe("The id of the client to associate with the project"),
    color: z
      .string()
      .optional()
      .describe("The project color as a hex value, e.g. #FF5733"),
    note: z.string().optional().describe("A note describing the project"),
    billable: z
      .boolean()
      .optional()
      .describe("If new time entries on the project default to billable"),
    isPublic: z
      .boolean()
      .optional()
      .describe("If the project is visible to all workspace members"),
    archived: z
      .boolean()
      .optional()
      .describe("Set to true to archive the project, false to restore it"),
  },
  handler: async (params: TEditProjectSchema): Promise<McpResponse> => {
    try {
      const result = await projectsService.update(params);

      return {
        content: [
          {
            type: "text",
            text: `Project updated successfully. ID: ${result.data.id} Name: ${result.data.name}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to edit project: ${error.message}`);
    }
  },
};

// Clockify has no native merge endpoint (confirmed against API docs as of
// Aug 2026), so this is a composite: detailed report to find every entry on
// the source across all users, then per-entry move with task remapping
export const mergeProjectsTool: McpToolConfig = {
  name: TOOLS_CONFIG.projects.merge.name,
  description: TOOLS_CONFIG.projects.merge.description,
  parameters: {
    workspaceId: z.string().describe("The id of the workspace"),
    sourceProjectId: z
      .string()
      .describe("The project whose time entries will be moved away"),
    targetProjectId: z
      .string()
      .describe("The project that will receive the time entries"),
    taskMappingStrategy: z
      .enum(["clear", "match-by-name", "fail-if-task-present"])
      .optional()
      .default("match-by-name")
      .describe(
        "How to handle project-scoped tasks on moved entries: clear them, map to a same-named task on the target (created if absent), or fail the entry"
      ),
    archiveSource: z
      .boolean()
      .optional()
      .default(false)
      .describe("Archive the source project after a successful move"),
    dryRun: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to TRUE: returns the full plan without writing. Set to false explicitly to execute the merge"
      ),
    start: z.coerce
      .date()
      .optional()
      .describe(
        "Start of the entry search window. Defaults to 2010-01-01 to cover the full history"
      ),
    end: z.coerce
      .date()
      .optional()
      .describe("End of the entry search window. Defaults to now + 1 year"),
  },
  handler: async (params: TMergeProjectsSchema): Promise<McpResponse> => {
    try {
      if (params.sourceProjectId === params.targetProjectId) {
        throw new Error("sourceProjectId and targetProjectId must differ");
      }

      // Detailed report is the only workspace-wide (all members) entry
      // source; the base API only lists one user's entries at a time
      const rawEntries = await reportsService.detailedAllPages({
        workspaceId: params.workspaceId,
        start: params.start ?? new Date("2010-01-01T00:00:00Z"),
        end:
          params.end ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        projectIds: [params.sourceProjectId],
      });

      const allEntryIds = rawEntries
        .map((entry: any) => entry._id)
        .filter(Boolean);

      // Cap each call at the bulk batch limit so a huge merge can't run
      // past client timeouts mid-write with no manifest returned. Re-running
      // is safe and picks up where it left off: moved entries no longer
      // match the source project filter.
      const timeEntryIds = allEntryIds.slice(0, BULK_MAX_ITEMS);
      const remainingEntries = allEntryIds.length - timeEntryIds.length;

      const blockers = rawEntries
        .filter(
          (entry: any) =>
            entry.isLocked ||
            entry.approvalRequestId ||
            entry.invoicingInfo?.invoiceId
        )
        .map((entry: any) => ({
          id: entry._id,
          isLocked: entry.isLocked ?? false,
          approvalRequestId: entry.approvalRequestId ?? null,
          invoiced: Boolean(entry.invoicingInfo?.invoiceId),
        }));

      const manifest = timeEntryIds.length
        ? await moveTimeEntries({
            workspaceId: params.workspaceId,
            timeEntryIds,
            targetProjectId: params.targetProjectId,
            taskMappingStrategy: params.taskMappingStrategy ?? "match-by-name",
            dryRun: params.dryRun ?? true,
          })
        : {
            dryRun: params.dryRun ?? true,
            total: 0,
            succeeded: 0,
            failed: 0,
            createdTasks: [],
            items: [],
          };

      let sourceArchived = false;
      if (
        !params.dryRun &&
        params.archiveSource &&
        manifest.failed === 0 &&
        remainingEntries === 0
      ) {
        await projectsService.update({
          workspaceId: params.workspaceId,
          projectId: params.sourceProjectId,
          archived: true,
        });
        sourceArchived = true;
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              ...manifest,
              sourceProjectId: params.sourceProjectId,
              targetProjectId: params.targetProjectId,
              totalMatchedEntries: allEntryIds.length,
              remainingEntries,
              likelyBlockedEntries: blockers,
              sourceArchived,
              note: manifest.dryRun
                ? `DRY RUN — nothing was written. Re-run with dryRun=false to execute${
                    remainingEntries > 0
                      ? `. Only the first ${BULK_MAX_ITEMS} of ${allEntryIds.length} entries are planned per call; repeat until remainingEntries is 0`
                      : ""
                  }`
                : remainingEntries > 0
                ? `Moved the first ${timeEntryIds.length} of ${allEntryIds.length} entries; re-run the same call to continue (${remainingEntries} remaining). Source not archived until all entries are moved`
                : params.archiveSource && !sourceArchived
                ? "Source NOT archived because some entries failed to move"
                : undefined,
            }),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to merge projects: ${error.message}`);
    }
  },
};
