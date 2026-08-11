import { z } from "zod";

export const DetailedReportSchema = z.object({
  workspaceId: z.string(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  userIds: z.array(z.string()).optional(),
  projectIds: z.array(z.string()).optional(),
  clientIds: z.array(z.string()).optional(),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(1000).optional().default(200),
});
