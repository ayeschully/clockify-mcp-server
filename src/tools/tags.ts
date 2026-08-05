import { z } from "zod";
import { TOOLS_CONFIG } from "../config/api";
import { tagsService } from "../clockify-sdk/tags";
import { McpResponse, McpToolConfig, TEditTagSchema } from "../types";

export const createTagTool: McpToolConfig = {
  name: TOOLS_CONFIG.tags.create.name,
  description: TOOLS_CONFIG.tags.create.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The ID of the workspace to create the tag in"),
    name: z.string().describe("The name of the tag to create"),
  },
  handler: async ({
    workspaceId,
    name,
  }: {
    workspaceId: string;
    name: string;
  }): Promise<McpResponse> => {
    try {
      const response = await tagsService.create(workspaceId, name);

      return {
        content: [
          {
            type: "text",
            text: `Tag created successfully. ID: ${response.data.id} Name: ${response.data.name}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to create tag: ${error.message}`);
    }
  },
};

export const getTagsTool: McpToolConfig = {
  name: TOOLS_CONFIG.tags.list.name,
  description: TOOLS_CONFIG.tags.list.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The ID of the workspace to get tags from"),
  },
  handler: async ({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<McpResponse> => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("Workspace ID required to fetch tags");
    }

    try {
      const response = await tagsService.fetchAll(workspaceId);
      const tags = response.data.map((tag: any) => ({
        id: tag.id,
        name: tag.name,
        workspaceId: tag.workspaceId,
        archived: tag.archived,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tags),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve tags: ${error.message}`);
    }
  },
};

export const editTagTool: McpToolConfig = {
  name: TOOLS_CONFIG.tags.edit.name,
  description: TOOLS_CONFIG.tags.edit.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace where the tag is located"),
    tagId: z.string().describe("The id of the tag to be edited"),
    name: z
      .string()
      .describe(
        "The name of the tag. Required by the Clockify API even when only archiving, so pass the current name to keep it unchanged"
      ),
    archived: z
      .boolean()
      .optional()
      .describe("Set to true to archive the tag, false to restore it"),
  },
  handler: async (params: TEditTagSchema): Promise<McpResponse> => {
    try {
      const result = await tagsService.update(params);

      return {
        content: [
          {
            type: "text",
            text: `Tag updated successfully. ID: ${result.data.id} Name: ${result.data.name}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to edit tag: ${error.message}`);
    }
  },
};
