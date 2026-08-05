import { z } from "zod";

export const EditTaskSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
  name: z.string().optional(),
  status: z.enum(["ACTIVE", "DONE"]).optional(),
  assigneeIds: z.array(z.string()).optional(),
});
