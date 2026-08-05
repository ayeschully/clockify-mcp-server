import { z } from "zod";

export const EditTagSchema = z.object({
  workspaceId: z.string(),
  tagId: z.string(),
  name: z.string(),
  archived: z.boolean().optional(),
});
