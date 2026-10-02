import { z } from "zod";
import { TOOLS_CONFIG } from "../config/api";
import { customFieldsService } from "../clockify-sdk/custom-fields";
import { projectsService } from "../clockify-sdk/projects";
import { reportsService } from "../clockify-sdk/reports";
import {
  blockedEntryIds,
  EntryCustomFieldEdit,
  findBlockedEntries,
  setEntryCustomFields,
} from "../clockify-sdk/entry-custom-fields";
import {
  BulkItemResult,
  BulkManifest,
  errorMessage,
} from "../clockify-sdk/entry-admin";
import {
  CustomFieldInfo,
  resolveCustomFieldRefs,
} from "../config/custom-field-merge";
import {
  BackfillPlanItem,
  buildProjectDefaults,
  planBackfill,
  tallyCellsByField,
} from "../config/custom-field-backfill";
import {
  assertWritableManifestPath,
  ManifestFormat,
  resolveManifestFormat,
  writeManifestFile,
} from "../config/manifest-file";
import { BULK_MAX_ITEMS } from "../validation/entries/bulk-edit-entries-schema";
import { EntryCustomFieldEditSchema } from "../validation/entries/set-entry-custom-fields-schema";
import { DEFAULT_BACKFILL_FIELDS } from "../validation/entries/backfill-entry-custom-fields-schema";
import {
  McpResponse,
  McpToolConfig,
  TBackfillEntryCustomFieldsSchema,
  TSetEntryCustomFieldsSchema,
} from "../types";

const DRY_RUN_NOTE =
  "DRY RUN — nothing was written. Review the plan, then re-run with dryRun=false to execute";

const DEFAULT_WINDOW_START = new Date("2010-01-01T00:00:00Z");
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

// A project filter this large risks being rejected by the Reports API, so
// past it the report is fetched unfiltered and narrowed during planning
const MAX_PROJECT_FILTER_IDS = 200;

function jsonResponse(body: unknown): McpResponse {
  return { content: [{ type: "text", text: JSON.stringify(body) }] };
}

function filterTimeEntryFields(fields: readonly any[]): any[] {
  return fields.filter(
    (field: any) => !field.entityType || field.entityType === "TIMEENTRY"
  );
}

/** Workspace custom fields that can hold a value on a time entry. */
async function fetchTimeEntryFields(workspaceId: string): Promise<any[]> {
  const response = await customFieldsService.fetchAll(workspaceId);
  return filterTimeEntryFields(response.data ?? []);
}

function buildFieldInfo(fields: readonly any[]): Map<string, CustomFieldInfo> {
  return new Map(
    fields.map((field: any) => [
      field.id,
      { id: field.id, name: field.name, type: field.type },
    ])
  );
}

function fieldNameList(fields: readonly any[]): string {
  return fields.map((field: any) => field.name).join(", ") || "(none)";
}

function countByStatus(items: readonly BulkItemResult[]) {
  const count = (status: BulkItemResult["status"]) =>
    items.filter((item) => item.status === status).length;
  return {
    updated: count("updated"),
    planned: count("planned"),
    unchanged: count("unchanged"),
    failed: count("failed"),
  };
}

function emptyManifest(dryRun: boolean): BulkManifest {
  return {
    dryRun,
    total: 0,
    succeeded: 0,
    failed: 0,
    createdTasks: [],
    items: [],
  };
}

function resolveEditFieldId(
  field: { customFieldId?: string; customFieldName?: string },
  workspaceFields: readonly any[]
): string {
  if (field.customFieldId) return field.customFieldId;
  if (!field.customFieldName) {
    throw new Error("Either customFieldId or customFieldName is required");
  }

  const { fields } = resolveCustomFieldRefs(
    [field.customFieldName],
    workspaceFields
  );
  if (!fields.length) {
    throw new Error(
      `No time entry custom field named "${field.customFieldName}" on this workspace, or the name is shared by more than one field (give customFieldId instead). Available: ${fieldNameList(workspaceFields)}`
    );
  }
  return fields[0].id;
}

/**
 * Two edits for the same entry would both read the same state and the second
 * full-replace PUT would silently drop the first one's fields, so they are
 * rejected rather than quietly merged.
 */
function assertUniqueEntryIds(edits: readonly { timeEntryId: string }[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const edit of edits) {
    if (seen.has(edit.timeEntryId)) duplicates.add(edit.timeEntryId);
    seen.add(edit.timeEntryId);
  }
  if (duplicates.size) {
    throw new Error(
      `Each time entry may appear only once per call; combine the fields into one edit. Duplicated: ${[...duplicates].join(", ")}`
    );
  }
}

export const setEntryCustomFieldsTool: McpToolConfig = {
  name: TOOLS_CONFIG.entries.setCustomFields.name,
  description: TOOLS_CONFIG.entries.setCustomFields.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace the entries belong to"),
    edits: z
      .array(
        z.object({
          timeEntryId: z.string().describe("The id of the entry to write to"),
          customFields: z
            .array(EntryCustomFieldEditSchema)
            .min(1)
            .describe(
              "Values to write, each identified by customFieldId or customFieldName. A value of null clears the field"
            ),
        })
      )
      .min(1)
      .max(BULK_MAX_ITEMS)
      .describe(
        `Per-entry custom field writes (max ${BULK_MAX_ITEMS} per call, each entry at most once). Fields not named here keep their current value`
      ),
    dryRun: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to TRUE: returns before/after for every entry without writing. Set to false explicitly to execute"
      ),
  },
  handler: async (params: TSetEntryCustomFieldsSchema): Promise<McpResponse> => {
    try {
      const dryRun = params.dryRun ?? true;
      assertUniqueEntryIds(params.edits);

      const workspaceFields = await fetchTimeEntryFields(params.workspaceId);
      const fieldInfoById = buildFieldInfo(workspaceFields);

      const edits: EntryCustomFieldEdit[] = params.edits.map((edit) => ({
        timeEntryId: edit.timeEntryId,
        customFields: edit.customFields.map((field) => ({
          customFieldId: resolveEditFieldId(field, workspaceFields),
          value: field.value,
        })),
      }));

      const unknownCustomFieldIds = [
        ...new Set(
          edits.flatMap((edit) =>
            edit.customFields.map((field) => field.customFieldId)
          )
        ),
      ].filter((id) => !fieldInfoById.has(id));

      // A dry run may report an id this workspace doesn't list, but a real
      // write must not gamble on it: at best Clockify rejects the entry, at
      // worst it stores a stray cell nothing can find again
      if (!dryRun && unknownCustomFieldIds.length) {
        throw new Error(
          `These customFieldIds are not time entry custom fields on this workspace: ${unknownCustomFieldIds.join(", ")}. Available: ${fieldNameList(workspaceFields)}`
        );
      }

      const manifest = await setEntryCustomFields({
        workspaceId: params.workspaceId,
        edits,
        dryRun,
        fieldInfoById,
      });

      return jsonResponse({
        ...manifest,
        ...countByStatus(manifest.items),
        unknownCustomFieldIds: unknownCustomFieldIds.length
          ? unknownCustomFieldIds
          : undefined,
        note: manifest.dryRun ? DRY_RUN_NOTE : undefined,
      });
    } catch (error: any) {
      throw new Error(
        `Failed to set time entry custom fields: ${errorMessage(error)}`
      );
    }
  },
};

async function firstProjectId(workspaceId: string): Promise<string> {
  const response = await projectsService.fetchAll(workspaceId, {
    archived: "both",
  });
  const first = (response.data ?? [])[0];
  if (!first) {
    throw new Error(
      "This workspace has no projects, so there are no project defaults to copy"
    );
  }
  return first.id;
}

/**
 * One call to the project custom fields endpoint returns every workspace
 * field together with its defaults for ALL projects, so the whole
 * project x field matrix arrives in a single request.
 */
async function loadFieldsAndDefaults(params: TBackfillEntryCustomFieldsSchema) {
  const seedProjectId =
    params.projectIds?.[0] ?? (await firstProjectId(params.workspaceId));

  const response = await customFieldsService.fetchForProject(
    params.workspaceId,
    seedProjectId
  );
  const workspaceFields = filterTimeEntryFields(response.data ?? []);

  return {
    workspaceFields,
    allDefaults: buildProjectDefaults(workspaceFields),
  };
}

/** Projects worth scanning: in scope, and holding a default we would copy. */
function selectProjects(
  allDefaults: ReadonlyMap<string, ReadonlyMap<string, unknown>>,
  fields: readonly CustomFieldInfo[],
  projectIds?: readonly string[]
) {
  const selectedFieldIds = new Set(fields.map((field) => field.id));
  const requested = projectIds?.length ? new Set(projectIds) : undefined;

  return new Map(
    [...allDefaults].filter(
      ([projectId, byField]) =>
        (!requested || requested.has(projectId)) &&
        [...byField.keys()].some((id) => selectedFieldIds.has(id))
    )
  );
}

async function fetchEntries(
  params: TBackfillEntryCustomFieldsSchema,
  projectIds: readonly string[]
): Promise<any[]> {
  return reportsService.detailedAllPages({
    workspaceId: params.workspaceId,
    start: params.start ?? DEFAULT_WINDOW_START,
    end: params.end ?? new Date(Date.now() + ONE_YEAR_MS),
    projectIds:
      projectIds.length <= MAX_PROJECT_FILTER_IDS ? [...projectIds] : undefined,
  });
}

/**
 * Move the manifest to disk. A write failure after a live run must not throw
 * away the record of what was just changed, so the body comes back inline
 * with the error attached instead.
 */
async function offloadManifest(
  outputFile: string,
  outputFormat: ManifestFormat | undefined,
  body: Record<string, unknown> & { items: BulkItemResult[] }
) {
  try {
    const format = resolveManifestFormat(outputFile, outputFormat);
    const manifestFile = await writeManifestFile(outputFile, format, body);
    const { items, ...rest } = body;
    const failedItems = items.filter((item) => item.status === "failed");
    return {
      ...rest,
      manifestFile,
      // Failures stay in the response: they are what the caller must act on
      failedItems: failedItems.length ? failedItems : undefined,
    };
  } catch (error: any) {
    return { ...body, manifestFileError: errorMessage(error) };
  }
}

function backfillNote(
  dryRun: boolean,
  remainingEntries: number,
  totalToChange: number,
  plannedCount: number
): string | undefined {
  const moreToDo =
    remainingEntries > 0
      ? `Only ${plannedCount} of ${totalToChange} entries are covered per call; repeat until remainingEntries is 0`
      : "";

  if (dryRun) return moreToDo ? `${DRY_RUN_NOTE}. ${moreToDo}` : DRY_RUN_NOTE;
  return moreToDo || undefined;
}

/**
 * Locked, approved and invoiced entries are rejected by the API on every
 * attempt. Left in the plan they would occupy the per-call cap forever and
 * the "repeat until remainingEntries is 0" loop would never converge, so
 * they are held back and reported instead.
 */
function partitionBlocked(
  plan: readonly BackfillPlanItem[],
  entries: readonly any[],
  skipBlocked: boolean
) {
  if (!skipBlocked) return { writablePlan: plan, skippedBlockedEntries: 0 };

  const blocked = blockedEntryIds(entries);
  const writablePlan = plan.filter((item) => !blocked.has(item.timeEntryId));
  return {
    writablePlan,
    skippedBlockedEntries: plan.length - writablePlan.length,
  };
}

/**
 * Resolve which fields to copy and which projects hold a default for them.
 * Throws when nothing resolves, so a typo never silently backfills nothing.
 */
async function resolveBackfillTargets(
  params: TBackfillEntryCustomFieldsSchema
) {
  const { workspaceFields, allDefaults } = await loadFieldsAndDefaults(params);

  const refs = params.fields ?? DEFAULT_BACKFILL_FIELDS;
  const { fields, unresolved } = resolveCustomFieldRefs(refs, workspaceFields);
  if (!fields.length) {
    throw new Error(
      `None of the requested fields exist on this workspace: ${refs.join(", ")}. Available: ${fieldNameList(workspaceFields)}`
    );
  }

  return {
    fieldInfoById: buildFieldInfo(workspaceFields),
    fields,
    unresolved,
    defaultsByProject: selectProjects(allDefaults, fields, params.projectIds),
  };
}

interface BackfillOutcome {
  entries: readonly any[];
  plan: readonly BackfillPlanItem[];
  planned: readonly BackfillPlanItem[];
  writablePlanSize: number;
  skippedBlockedEntries: number;
  remainingEntries: number;
  manifest: BulkManifest;
}

/** Plan the writes, hold back what can't be written, and execute the batch. */
async function executeBackfill(
  params: TBackfillEntryCustomFieldsSchema,
  targets: Awaited<ReturnType<typeof resolveBackfillTargets>>,
  mode: "fill-empty" | "overwrite",
  dryRun: boolean
): Promise<BackfillOutcome> {
  const entries = await fetchEntries(params, [
    ...targets.defaultsByProject.keys(),
  ]);
  const plan = planBackfill({
    entries,
    defaultsByProject: targets.defaultsByProject,
    fields: targets.fields,
    mode,
  });

  const { writablePlan, skippedBlockedEntries } = partitionBlocked(
    plan,
    entries,
    params.skipBlocked ?? true
  );
  const planned = writablePlan.slice(0, params.maxEntries ?? BULK_MAX_ITEMS);

  const manifest = planned.length
    ? await setEntryCustomFields({
        workspaceId: params.workspaceId,
        edits: planned.map((item) => ({
          timeEntryId: item.timeEntryId,
          customFields: item.customFields,
          // The plan came from a report snapshot; re-check against the live
          // entry so fill-empty can never clobber a hand-entered value
          onlyIfEmpty: mode === "fill-empty",
        })),
        dryRun,
        fieldInfoById: targets.fieldInfoById,
      })
    : emptyManifest(dryRun);

  return {
    entries,
    plan,
    planned,
    writablePlanSize: writablePlan.length,
    skippedBlockedEntries,
    remainingEntries: writablePlan.length - planned.length,
    manifest,
  };
}

function buildBackfillBody(
  outcome: BackfillOutcome,
  summary: Record<string, unknown>,
  fields: readonly CustomFieldInfo[],
  dryRun: boolean
) {
  const { createdTasks, ...manifestBody } = outcome.manifest;
  // Every candidate, so the report covers both the entries this call wrote
  // and the blocked ones it held back
  const candidateIds = new Set(
    outcome.plan.map((item) => item.timeEntryId)
  );

  return {
    ...manifestBody,
    ...summary,
    ...countByStatus(outcome.manifest.items),
    entriesScanned: outcome.entries.length,
    entriesToChange: outcome.plan.length,
    skippedBlockedEntries: outcome.skippedBlockedEntries,
    remainingEntries: outcome.remainingEntries,
    cellsToChangeByField: tallyCellsByField(outcome.plan, fields),
    likelyBlockedEntries: findBlockedEntries(
      outcome.entries.filter((entry: any) =>
        candidateIds.has(entry._id ?? entry.id)
      )
    ),
    note: backfillNote(
      dryRun,
      outcome.remainingEntries,
      outcome.writablePlanSize,
      outcome.planned.length
    ),
  };
}

async function runBackfill(
  params: TBackfillEntryCustomFieldsSchema
): Promise<McpResponse> {
  const dryRun = params.dryRun ?? true;
  const mode = params.mode ?? "fill-empty";

  // Fail on an unusable destination before anything is written, not after
  if (params.outputFile) assertWritableManifestPath(params.outputFile);

  const targets = await resolveBackfillTargets(params);
  const summary = {
    dryRun,
    mode,
    fields: targets.fields,
    unresolvedFields: targets.unresolved.length
      ? targets.unresolved
      : undefined,
    projectsWithDefaults: targets.defaultsByProject.size,
  };

  if (!targets.defaultsByProject.size) {
    const { createdTasks, ...manifest } = emptyManifest(dryRun);
    return jsonResponse({
      ...manifest,
      ...summary,
      entriesScanned: 0,
      entriesToChange: 0,
      remainingEntries: 0,
      cellsToChangeByField: {},
      note: "No project has a default value for any of the selected fields, so there is nothing to copy",
    });
  }

  const outcome = await executeBackfill(params, targets, mode, dryRun);
  const body = buildBackfillBody(outcome, summary, targets.fields, dryRun);

  return params.outputFile
    ? jsonResponse(
        await offloadManifest(params.outputFile, params.outputFormat, body)
      )
    : jsonResponse(body);
}

// Clockify stamps a project's default custom field values onto an entry only
// at creation time; changing a default never reaches entries that already
// exist. This copies the current defaults onto those entries.
export const backfillEntryCustomFieldsTool: McpToolConfig = {
  name: TOOLS_CONFIG.customFields.backfillEntries.name,
  description: TOOLS_CONFIG.customFields.backfillEntries.description,
  parameters: {
    workspaceId: z.string().describe("The id of the workspace"),
    projectIds: z
      .array(z.string())
      .optional()
      .describe(
        "Limit the backfill to these projects. Omit to cover every project that has a default for any selected field"
      ),
    fields: z
      .array(z.string())
      .min(1)
      .optional()
      .describe(
        `Custom field names or ids to copy. Defaults to: ${DEFAULT_BACKFILL_FIELDS.join(", ")}. "Monday Status" is excluded by default because it is a point-in-time snapshot that must not be overwritten with the project's current status`
      ),
    mode: z
      .enum(["fill-empty", "overwrite"])
      .optional()
      .default("fill-empty")
      .describe(
        "fill-empty (default) only writes cells that are null or empty, re-checked against the live entry at write time; overwrite also replaces values that differ from the project default"
      ),
    start: z.coerce
      .date()
      .optional()
      .describe("Start of the entry window. Defaults to 2010-01-01"),
    end: z.coerce
      .date()
      .optional()
      .describe("End of the entry window. Defaults to now + 1 year"),
    dryRun: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to TRUE: returns the full plan without writing. Set to false explicitly to execute"
      ),
    maxEntries: z
      .number()
      .int()
      .min(1)
      .max(BULK_MAX_ITEMS)
      .optional()
      .default(BULK_MAX_ITEMS)
      .describe(
        `Entries to process per call (max ${BULK_MAX_ITEMS}). Re-run the same call until remainingEntries is 0`
      ),
    skipBlocked: z
      .boolean()
      .optional()
      .default(true)
      .describe(
        "Defaults to TRUE: leave out locked, approved and invoiced entries, which the API rejects every time and which would otherwise occupy the per-call cap forever. Set to false to attempt them anyway"
      ),
    outputFile: z
      .string()
      .optional()
      .describe(
        "Write the per-entry manifest to this local .json or .csv path instead of returning it inline — use it for large runs. Parent directories are created and an existing file is replaced"
      ),
    outputFormat: z
      .enum(["json", "csv"])
      .optional()
      .describe(
        "Manifest file format. Defaults to csv for a .csv path, json otherwise"
      ),
  },
  handler: async (
    params: TBackfillEntryCustomFieldsSchema
  ): Promise<McpResponse> => {
    try {
      return await runBackfill(params);
    } catch (error: any) {
      throw new Error(
        `Failed to backfill entry custom fields: ${errorMessage(error)}`
      );
    }
  },
};
