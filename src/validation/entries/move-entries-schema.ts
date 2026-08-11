import { z } from "zod";
import { BULK_MAX_ITEMS } from "./bulk-edit-entries-schema";

export const TaskMappingStrategySchema = z.enum([
  "clear",
  "match-by-name",
  "fail-if-task-present",
]);

export const MoveEntriesSchema = z.object({
  workspaceId: z.string(),
  timeEntryIds: z.array(z.string()).min(1).max(BULK_MAX_ITEMS),
  targetProjectId: z.string(),
  taskMappingStrategy: TaskMappingStrategySchema.optional().default("clear"),
  dryRun: z.boolean().optional().default(true),
});
