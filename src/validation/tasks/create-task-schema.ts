import { z } from "zod";

export const CreateTaskSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  name: z.string(),
  assigneeIds: z.array(z.string()).optional(),
  status: z.enum(["ACTIVE", "DONE"]).optional(),
});
