import { z } from "zod";
import { CreateEntrySchema } from "../validation/entries/create-entry-schema";
import { FindEntrySchema } from "../validation/entries/find-entry-schema";
import { DeleteEntrySchema } from "../validation/entries/delete-entry-schema";
import { EditEntrySchema } from "../validation/entries/edit-entry-schema";
import {
  ReadResourceTemplateCallback,
  ResourceMetadata,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { FindProjectSchema } from "../validation/projects/find-project-schema";
import { EditProjectSchema } from "../validation/projects/edit-project-schema";
import { EditTagSchema } from "../validation/tags/edit-tag-schema";
import { EditTaskSchema } from "../validation/tasks/edit-task-schema";
import { CreateTaskSchema } from "../validation/tasks/create-task-schema";
import { DeleteTaskSchema } from "../validation/tasks/delete-task-schema";
import { SummaryReportSchema } from "../validation/reports/summary-report-schema";
import { DetailedReportSchema } from "../validation/reports/detailed-report-schema";
import { ListProjectsSchema } from "../validation/projects/list-projects-schema";
import { SetProjectCustomFieldSchema } from "../validation/custom-fields/set-project-custom-field-schema";
import { BulkEditEntriesSchema } from "../validation/entries/bulk-edit-entries-schema";
import { MoveEntriesSchema } from "../validation/entries/move-entries-schema";
import { MergeProjectsSchema } from "../validation/projects/merge-projects-schema";

export type TCreateEntrySchema = z.infer<typeof CreateEntrySchema>;

export type TFindEntrySchema = z.infer<typeof FindEntrySchema>;

export type TDeleteEntrySchema = z.infer<typeof DeleteEntrySchema>;

export type TEditEntrySchema = z.infer<typeof EditEntrySchema>;

export type TFindProjectSchema = z.infer<typeof FindProjectSchema>;

export type TEditProjectSchema = z.infer<typeof EditProjectSchema>;

export type TEditTagSchema = z.infer<typeof EditTagSchema>;

export type TEditTaskSchema = z.infer<typeof EditTaskSchema>;

export type TCreateTaskSchema = z.infer<typeof CreateTaskSchema>;

export type TDeleteTaskSchema = z.infer<typeof DeleteTaskSchema>;

export type TSummaryReportSchema = z.infer<typeof SummaryReportSchema>;

export type TDetailedReportSchema = z.infer<typeof DetailedReportSchema>;

export type TListProjectsSchema = z.infer<typeof ListProjectsSchema>;

export type TSetProjectCustomFieldSchema = z.infer<
  typeof SetProjectCustomFieldSchema
>;

export type TBulkEditEntriesSchema = z.infer<typeof BulkEditEntriesSchema>;

export type TMoveEntriesSchema = z.infer<typeof MoveEntriesSchema>;

export type TMergeProjectsSchema = z.infer<typeof MergeProjectsSchema>;

export interface ClockifyWorkspace {
  id: string;
  name: string;
}

export interface ClockifyUser {
  id: string;
  name: string;
  email: string;
}

export interface McpToolConfig {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (params: any) => Promise<McpResponse>;
}

export type McpToolConfigWithoutParameters = Omit<McpToolConfig, "parameters">;

export interface McpTextContent {
  type: "text";
  text: string;
  [key: string]: unknown;
}

export interface McpImageContent {
  type: "image";
  data: string;
  mimeType: string;
  [key: string]: unknown;
}

export interface McpResourceConfig {
  name: string;
  template: ResourceTemplate;
  metadata: ResourceMetadata;
  handler: ReadResourceTemplateCallback;
}

export interface McpResourceContent {
  type: "resource";
  resource:
    | {
        text: string;
        uri: string;
        mimeType?: string;
        [key: string]: unknown;
      }
    | {
        uri: string;
        blob: string;
        mimeType?: string;
        [key: string]: unknown;
      };
  [key: string]: unknown;
}

export type McpContent = McpTextContent | McpImageContent | McpResourceContent;

export interface McpResponse {
  content: McpContent[];
  _meta?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}
