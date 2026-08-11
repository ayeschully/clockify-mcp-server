import { z } from "zod";

export const ListProjectsSchema = z.object({
  workspaceId: z.string(),
  archived: z.enum(["active", "archived", "both"]).optional().default("active"),
  full: z.boolean().optional().default(false),
});
