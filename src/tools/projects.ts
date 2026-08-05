import { projectsService } from "../clockify-sdk/projects";
import { TOOLS_CONFIG } from "../config/api";
import { z } from "zod";
import {
  McpResponse,
  McpToolConfig,
  TEditProjectSchema,
  TFindProjectSchema,
} from "../types";

export const findProjectTool: McpToolConfig = {
  name: TOOLS_CONFIG.projects.list.name,
  description: TOOLS_CONFIG.projects.list.description,
  parameters: {
    workspaceId: z
      .string()
      .describe(
        "The ID of the workspace that you need to get the projects from"
      ),
  },
  handler: async ({
    workspaceId,
  }: TFindProjectSchema): Promise<McpResponse> => {
    if (!workspaceId || typeof workspaceId !== "string")
      throw new Error("Workspace ID required to fetch projects");

    try {
      const response = await projectsService.fetchAll(workspaceId);
      const projects = response.data.map((project: any) => ({
        name: project.name,
        clientName: project.clientName,
        id: project.id,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(projects),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve projects: ${error.message}`);
    }
  },
};

export const editProjectTool: McpToolConfig = {
  name: TOOLS_CONFIG.projects.edit.name,
  description: TOOLS_CONFIG.projects.edit.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace where the project is located"),
    projectId: z.string().describe("The id of the project to be edited"),
    name: z.string().optional().describe("The new name of the project"),
    clientId: z
      .string()
      .optional()
      .describe("The id of the client to associate with the project"),
    color: z
      .string()
      .optional()
      .describe("The project color as a hex value, e.g. #FF5733"),
    note: z.string().optional().describe("A note describing the project"),
    billable: z
      .boolean()
      .optional()
      .describe("If new time entries on the project default to billable"),
    isPublic: z
      .boolean()
      .optional()
      .describe("If the project is visible to all workspace members"),
    archived: z
      .boolean()
      .optional()
      .describe("Set to true to archive the project, false to restore it"),
  },
  handler: async (params: TEditProjectSchema): Promise<McpResponse> => {
    try {
      const result = await projectsService.update(params);

      return {
        content: [
          {
            type: "text",
            text: `Project updated successfully. ID: ${result.data.id} Name: ${result.data.name}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to edit project: ${error.message}`);
    }
  },
};
