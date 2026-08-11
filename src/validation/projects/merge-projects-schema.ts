import { z } from "zod";
import { TaskMappingStrategySchema } from "../entries/move-entries-schema";

export const MergeProjectsSchema = z
  .object({
    workspaceId: z.string(),
    sourceProjectId: z.string(),
    targetProjectId: z.string(),
    taskMappingStrategy:
      TaskMappingStrategySchema.optional().default("match-by-name"),
    archiveSource: z.boolean().optional().default(false),
    dryRun: z.boolean().optional().default(true),
    start: z.coerce.date().optional(),
    end: z.coerce.date().optional(),
  })
  .refine((data) => data.sourceProjectId !== data.targetProjectId, {
    message: "sourceProjectId and targetProjectId must differ",
  });
