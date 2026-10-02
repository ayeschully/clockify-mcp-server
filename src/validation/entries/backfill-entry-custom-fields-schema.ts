import { z } from "zod";
import { BULK_MAX_ITEMS } from "./bulk-edit-entries-schema";

/**
 * The Monday-sourced fields worth backfilling by default. "Monday Status" is
 * deliberately excluded: it is a point-in-time snapshot kept for analytics,
 * so stamping the project's current status onto historic entries would
 * destroy the history it exists to record. Name it in `fields` to include it.
 */
export const DEFAULT_BACKFILL_FIELDS: readonly string[] = [
  "Project ID",
  "PS-Product",
  "PS Revenue",
  "PS-Hours",
  "Customer Netsuite ID",
];

export const BackfillModeSchema = z.enum(["fill-empty", "overwrite"]);

export const ManifestFormatSchema = z.enum(["json", "csv"]);

export const BackfillEntryCustomFieldsSchema = z.object({
  workspaceId: z.string(),
  projectIds: z.array(z.string()).optional(),
  fields: z.array(z.string()).min(1).optional(),
  mode: BackfillModeSchema.optional().default("fill-empty"),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  dryRun: z.boolean().optional().default(true),
  maxEntries: z
    .number()
    .int()
    .min(1)
    .max(BULK_MAX_ITEMS)
    .optional()
    .default(BULK_MAX_ITEMS),
  skipBlocked: z.boolean().optional().default(true),
  outputFile: z.string().optional(),
  outputFormat: ManifestFormatSchema.optional(),
});
