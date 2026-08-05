import { z } from "zod";

export const FindEntrySchema = z.object({
  workspaceId: z.string(),
  userId: z.string().optional(),
  description: z.string().optional(),
  start: z.coerce.date().optional(),
  end: z.coerce.date().optional(),
  project: z.string().optional(),
});
