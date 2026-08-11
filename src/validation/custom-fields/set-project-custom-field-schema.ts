import { z } from "zod";

export const SetProjectCustomFieldSchema = z
  .object({
    workspaceId: z.string(),
    projectId: z.string(),
    customFieldId: z.string().optional(),
    customFieldName: z.string().optional(),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  })
  .refine((data) => data.customFieldId || data.customFieldName, {
    message: "Either customFieldId or customFieldName is required",
  });
