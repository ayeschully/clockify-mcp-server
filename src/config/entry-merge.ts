import { omitUndefined } from "./object-utils";

export interface EntryEdits {
  description?: string;
  billable?: boolean;
  start?: Date;
  end?: Date;
  projectId?: string;
  taskId?: string | null;
  tagIds?: string[];
  customFields?: { customFieldId: string; value: unknown }[];
}

/**
 * Build the full PUT body for a time entry update.
 *
 * Clockify's PUT /time-entries/{id} is a full object replacement, not a
 * patch: any field missing from the body is CLEARED on the entry. This
 * merges the caller's edits over the current entry so a single-field edit
 * never wipes projectId, taskId, tagIds, billable or custom field values.
 *
 * `taskId: null` actively clears the task (used when moving an entry to a
 * project where its task doesn't exist); `taskId: undefined` preserves it.
 */
export function mergeEntryUpdate(
  current: any,
  edits: EntryEdits
): Record<string, unknown> {
  const currentCustomFields = (current?.customFieldValues ?? []).map(
    (cf: any) => ({
      customFieldId: cf.customFieldId,
      value: cf.value,
    })
  );

  const customFields = edits.customFields ?? currentCustomFields;

  return omitUndefined({
    start: edits.start?.toISOString() ?? current?.timeInterval?.start,
    // A running entry has no end; omit it rather than sending "Invalid Date"
    end: edits.end?.toISOString() ?? current?.timeInterval?.end ?? undefined,
    description: edits.description ?? current?.description,
    billable: edits.billable ?? current?.billable,
    projectId: edits.projectId ?? current?.projectId ?? undefined,
    taskId:
      edits.taskId === null
        ? undefined
        : edits.taskId ?? current?.taskId ?? undefined,
    tagIds: edits.tagIds ?? current?.tagIds ?? undefined,
    customFields: customFields.length ? customFields : undefined,
  });
}
