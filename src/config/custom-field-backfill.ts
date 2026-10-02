import {
  CustomFieldChange,
  CustomFieldInfo,
  CustomFieldValue,
  isEmptyCustomFieldValue,
  sameCustomFieldValue,
} from "./custom-field-merge";

export type BackfillMode = "fill-empty" | "overwrite";

export interface BackfillPlanItem {
  timeEntryId: string;
  projectId: string;
  projectName?: string;
  customFields: CustomFieldValue[];
  changes: CustomFieldChange[];
}

/**
 * Build `projectId -> (fieldId -> default value)` from a project custom
 * fields response.
 *
 * `GET /workspaces/{ws}/projects/{id}/custom-fields` returns each workspace
 * field with a projectDefaultValues[] covering EVERY project, not just the
 * one in the path, so a single call maps the whole workspace.
 *
 * Defaults a project has switched off are skipped: Clockify only stamps a
 * default onto a new entry while the field is active on that project, and
 * copying an inactive default onto old entries would invent data the UI
 * never would have written.
 */
export function buildProjectDefaults(
  workspaceFields: readonly any[]
): Map<string, Map<string, unknown>> {
  const defaults = new Map<string, Map<string, unknown>>();

  for (const field of workspaceFields) {
    for (const projectDefault of field.projectDefaultValues ?? []) {
      const { projectId, value, status } = projectDefault;
      if (!projectId || status === "INACTIVE") continue;
      if (isEmptyCustomFieldValue(value)) continue;

      let byField = defaults.get(projectId);
      if (!byField) {
        byField = new Map<string, unknown>();
        defaults.set(projectId, byField);
      }
      byField.set(field.id, value);
    }
  }

  return defaults;
}

export interface PlanBackfillParams {
  /** Raw detailed-report entries (ids under `_id`, values under `customFields`) */
  entries: readonly any[];
  defaultsByProject: ReadonlyMap<string, ReadonlyMap<string, unknown>>;
  fields: readonly CustomFieldInfo[];
  mode: BackfillMode;
}

/**
 * Decide, per entry, which custom field cells the project's current defaults
 * should fill in. Entries whose project has no default for any selected
 * field, and entries already carrying the default, produce no plan item.
 */
export function planBackfill(params: PlanBackfillParams): BackfillPlanItem[] {
  const plan: BackfillPlanItem[] = [];

  for (const entry of params.entries) {
    const projectId: string | undefined = entry.projectId;
    const defaults = projectId
      ? params.defaultsByProject.get(projectId)
      : undefined;
    if (!projectId || !defaults) continue;

    // An entry the report returned without an id cannot be written to;
    // skipping beats sending a PUT to /time-entries/undefined
    const timeEntryId: string | undefined = entry._id ?? entry.id;
    if (!timeEntryId) continue;

    const changes = planEntryChanges(entry, defaults, params);
    if (!changes.length) continue;

    plan.push({
      timeEntryId,
      projectId,
      projectName: entry.projectName,
      customFields: changes.map((change) => ({
        customFieldId: change.customFieldId,
        value: change.to,
      })),
      changes,
    });
  }

  return plan;
}

function planEntryChanges(
  entry: any,
  defaults: ReadonlyMap<string, unknown>,
  params: PlanBackfillParams
): CustomFieldChange[] {
  const reported = Array.isArray(entry.customFields) ? entry.customFields : [];
  const entryValues = new Map<string, unknown>(
    reported.map((cf: any) => [cf.customFieldId, cf.value])
  );

  const changes: CustomFieldChange[] = [];
  for (const field of params.fields) {
    const target = defaults.get(field.id);
    if (target === undefined) continue; // project has no default to copy

    const currentValue = entryValues.get(field.id);
    const isEmpty = isEmptyCustomFieldValue(currentValue);
    const shouldWrite =
      params.mode === "overwrite"
        ? isEmpty || !sameCustomFieldValue(currentValue, target)
        : isEmpty;
    if (!shouldWrite) continue;

    changes.push({
      customFieldId: field.id,
      name: field.name,
      from: currentValue ?? null,
      to: target,
    });
  }

  return changes;
}

/**
 * Cell counts per field name, so a dry run says "540 Project ID, 538
 * PS-Product" instead of only a total.
 */
export function tallyCellsByField(
  plan: readonly BackfillPlanItem[],
  fields: readonly CustomFieldInfo[]
): Record<string, number> {
  const labelById = new Map(
    fields.map((field) => [field.id, field.name ?? field.id])
  );
  const tally: Record<string, number> = {};

  for (const item of plan) {
    for (const change of item.changes) {
      const label = labelById.get(change.customFieldId) ?? change.customFieldId;
      tally[label] = (tally[label] ?? 0) + 1;
    }
  }

  return tally;
}
