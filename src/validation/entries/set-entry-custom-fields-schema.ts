import { z } from "zod";
import { BULK_MAX_ITEMS } from "./bulk-edit-entries-schema";

/** Clockify custom field values are scalars, or a list for multi-select */
export const CustomFieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.null(),
]);

export const EntryCustomFieldEditSchema = z
  .object({
    customFieldId: z.string().optional(),
    customFieldName: z.string().optional(),
    value: CustomFieldValueSchema,
  })
  .refine((data) => data.customFieldId || data.customFieldName, {
    message: "Either customFieldId or customFieldName is required",
  });

export const SetEntryCustomFieldsSchema = z.object({
  workspaceId: z.string(),
  edits: z
    .array(
      z.object({
        timeEntryId: z.string(),
        customFields: z.array(EntryCustomFieldEditSchema).min(1),
      })
    )
    .min(1)
    .max(BULK_MAX_ITEMS),
  dryRun: z.boolean().optional().default(true),
});
