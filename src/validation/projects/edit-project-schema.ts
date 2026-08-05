import { z } from "zod";

export const EditProjectSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  name: z.string().optional(),
  clientId: z.string().optional(),
  color: z.string().optional(),
  note: z.string().optional(),
  billable: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  archived: z.boolean().optional(),
});
