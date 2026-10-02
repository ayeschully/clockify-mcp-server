import { z } from "zod";

export const BULK_MAX_ITEMS = 500;

export const BulkEntryEditSchema = z
  .object({
    timeEntryId: z.string(),
    description: z.string().optional(),
    billable: z.boolean().optional(),
    start: z.coerce.date().optional(),
    end: z.coerce.date().optional(),
    projectId: z.string().optional(),
    // null clears the task; omission preserves it (matches EntryEdits)
    taskId: z.string().nullable().optional(),
    tagIds: z.array(z.string()).optional(),
  })
  // This tool does NOT write custom fields; an unknown key is an error
  // rather than something to strip and ignore
  .strict("bulk-edit-time-entries cannot change custom fields. Use set-time-entry-custom-fields, which merges per field and verifies clears");

export const BulkEditEntriesSchema = z.object({
  workspaceId: z.string(),
  edits: z.array(BulkEntryEditSchema).min(1).max(BULK_MAX_ITEMS),
  dryRun: z.boolean().optional().default(true),
});
