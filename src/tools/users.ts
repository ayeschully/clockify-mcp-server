import { z } from "zod";
import { TOOLS_CONFIG } from "../config/api";
import { usersService } from "../clockify-sdk/users";
import {
  ClockifyUser,
  McpResponse,
  McpToolConfig,
  McpToolConfigWithoutParameters,
} from "../types";

export const getCurrentUserTool: McpToolConfigWithoutParameters = {
  name: TOOLS_CONFIG.users.current.name,
  description: TOOLS_CONFIG.users.current.description,
  handler: async (): Promise<McpResponse> => {
    try {
      const response = await usersService.getCurrent();

      const user: ClockifyUser = {
        id: response.data.id,
        name: response.data.name,
        email: response.data.email,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(user),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve current user: ${error.message}`);
    }
  },
};

export const listUsersTool: McpToolConfig = {
  name: TOOLS_CONFIG.users.list.name,
  description: TOOLS_CONFIG.users.list.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The ID of the workspace to list the members of"),
  },
  handler: async ({
    workspaceId,
  }: {
    workspaceId: string;
  }): Promise<McpResponse> => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("Workspace ID required to list users");
    }

    try {
      const response = await usersService.fetchAll(workspaceId);
      const users = response.data.map((user: any) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        status: user.status,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(users),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to list users: ${error.message}`);
    }
  },
};
