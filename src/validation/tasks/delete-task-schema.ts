import { z } from "zod";

export const DeleteTaskSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  taskId: z.string(),
});
