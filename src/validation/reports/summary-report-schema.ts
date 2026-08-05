import { z } from "zod";

export const SummaryReportSchema = z.object({
  workspaceId: z.string(),
  start: z.coerce.date(),
  end: z.coerce.date(),
  projectIds: z.array(z.string()).optional(),
});
