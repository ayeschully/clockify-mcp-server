import { entriesService } from "./entries";
import {
  BulkItemResult,
  BulkManifest,
  errorMessage,
  snapshotEntry,
  summarize,
} from "./entry-admin";
import { mergeEntryUpdate } from "../config/entry-merge";
import { mapWithConcurrency, withRateLimitRetry } from "../config/concurrency";
import {
  CustomFieldInfo,
  CustomFieldValue,
  describeCustomFieldChanges,
  isEmptyCustomFieldValue,
  mergeCustomFieldValues,
} from "../config/custom-field-merge";

export interface EntryCustomFieldEdit {
  timeEntryId: string;
  customFields: CustomFieldValue[];
  /**
   * Write a field only while the entry's LIVE value is still blank. The
   * backfill plan is computed from a detailed report that may be minutes
   * old, so without this guard a fill-empty run could overwrite a value
   * someone typed in between the report and the write.
   */
  onlyIfEmpty?: boolean;
}

export interface SetEntryCustomFieldsParams {
  workspaceId: string;
  edits: readonly EntryCustomFieldEdit[];
  dryRun: boolean;
  /** Field id -> name/type, used only to label the manifest */
  fieldInfoById?: ReadonlyMap<string, CustomFieldInfo>;
}

/**
 * Split an edit against the entry's live values into the fields that may be
 * written and the ones the onlyIfEmpty guard holds back.
 */
function applyEmptyGuard(
  edit: EntryCustomFieldEdit,
  currentValues: readonly CustomFieldValue[],
  fieldInfoById?: ReadonlyMap<string, CustomFieldInfo>
) {
  if (!edit.onlyIfEmpty) {
    return { writable: edit.customFields, skippedFields: [] };
  }

  const liveById = new Map(
    currentValues.map((field) => [field.customFieldId, field.value])
  );
  const writable: CustomFieldValue[] = [];
  const skippedFields: BulkItemResult["skippedFields"] = [];

  for (const field of edit.customFields) {
    const liveValue = liveById.get(field.customFieldId);
    if (isEmptyCustomFieldValue(liveValue)) {
      writable.push(field);
      continue;
    }
    skippedFields.push({
      customFieldId: field.customFieldId,
      name: fieldInfoById?.get(field.customFieldId)?.name,
      value: liveValue,
    });
  }

  return { writable, skippedFields };
}

/**
 * Write custom field values on specific time entries, touching nothing else.
 *
 * Clockify has no per-entry custom field endpoint: values are written
 * through PUT /time-entries/{id}, which is a full replace. Each entry is
 * therefore GET first and the merged body is built from that live copy, so
 * description, times, project, task, tags, billable and every custom field
 * the caller did not name survive the write unchanged.
 *
 * Entries already holding the requested values are reported as `unchanged`
 * and never written — a backfill re-run costs reads, not writes.
 */
export async function setEntryCustomFields(
  params: SetEntryCustomFieldsParams
): Promise<BulkManifest> {
  const { workspaceId, dryRun, fieldInfoById } = params;

  const items = await mapWithConcurrency(params.edits, async (edit) => {
    const result: BulkItemResult = {
      timeEntryId: edit.timeEntryId,
      status: "planned",
    };

    try {
      await writeOneEntry(workspaceId, edit, dryRun, result, fieldInfoById);
    } catch (error: any) {
      // Keep whatever was already resolved (before snapshot, planned
      // changes) so a failed row still says which entry and which cells
      result.status = "failed";
      result.error = errorMessage(error);
    }
    return result;
  });

  return summarize(dryRun, items, []);
}

/**
 * GET the entry, work out what actually changes, and PUT it back. Fills
 * `result` in place so a throw partway through still leaves the caller with
 * the before snapshot and the planned changes.
 */
async function writeOneEntry(
  workspaceId: string,
  edit: EntryCustomFieldEdit,
  dryRun: boolean,
  result: BulkItemResult,
  fieldInfoById?: ReadonlyMap<string, CustomFieldInfo>
): Promise<void> {
  const current = await withRateLimitRetry(() =>
    entriesService.getById(workspaceId, edit.timeEntryId)
  );
  const entry = current.data;
  result.before = snapshotEntry(entry);

  const currentValues: CustomFieldValue[] = (entry.customFieldValues ?? []).map(
    (cf: any) => ({ customFieldId: cf.customFieldId, value: cf.value })
  );

  const { writable, skippedFields } = applyEmptyGuard(
    edit,
    currentValues,
    fieldInfoById
  );
  if (skippedFields.length) result.skippedFields = skippedFields;

  result.changes = describeCustomFieldChanges(
    currentValues,
    writable,
    fieldInfoById
  );
  if (!result.changes.length) {
    result.status = "unchanged";
    return;
  }

  const body = mergeEntryUpdate(entry, {
    customFields: mergeCustomFieldValues(currentValues, writable),
  });
  result.after = body;

  if (!dryRun) {
    await withRateLimitRetry(() =>
      entriesService.update(workspaceId, edit.timeEntryId, body)
    );
    result.status = "updated";
  }
}

/** Entries that Clockify is likely to reject, flagged before the write. */
export function findBlockedEntries(entries: readonly any[]) {
  return entries
    .filter((entry) => blockedReason(entry) !== undefined)
    .map((entry) => ({
      id: entry._id ?? entry.id,
      isLocked: Boolean(entry.isLocked),
      approvalRequestId: entry.approvalRequestId ?? null,
      invoiced: isInvoiced(entry),
    }));
}

function isInvoiced(entry: any): boolean {
  return Boolean(
    entry.invoicingInfo?.invoiceId ??
      entry.invoicingInfo?.manuallyInvoiced ??
      entry.invoiced
  );
}

function blockedReason(entry: any): string | undefined {
  if (entry.isLocked) return "locked";
  if (entry.approvalRequestId) return "approval";
  if (isInvoiced(entry)) return "invoiced";
  return undefined;
}

/** Ids of the entries Clockify is likely to reject an edit on. */
export function blockedEntryIds(entries: readonly any[]): Set<string> {
  return new Set(
    entries
      .filter((entry) => blockedReason(entry) !== undefined)
      .map((entry) => entry._id ?? entry.id)
      .filter(Boolean)
  );
}
