import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { setApiToken, SERVER_CONFIG } from "./config/api";
import {
  createEntryTool,
  deleteEntryTool,
  editEntryTool,
  listEntriesTool,
} from "./tools/entries";
import {
  editProjectTool,
  findProjectTool,
  mergeProjectsTool,
} from "./tools/projects";
import { getCurrentUserTool, listUsersTool } from "./tools/users";
import {
  detailedReportTool,
  getHoursByClientTool,
  summaryReportTool,
} from "./tools/reports";
import { bulkEditEntriesTool, moveEntriesTool } from "./tools/bulk-entries";
import {
  listCustomFieldsTool,
  setProjectCustomFieldTool,
} from "./tools/custom-fields";
import { findWorkspacesTool } from "./tools/workspaces";
import { createTagTool, editTagTool, getTagsTool } from "./tools/tags";
import {
  createTaskTool,
  deleteTaskTool,
  editTaskTool,
  listTasksTool,
} from "./tools/tasks";
import { McpToolConfig, McpToolConfigWithoutParameters } from "./types";
import { z } from "zod";
import { argv, env } from "process";

export const configSchema = z.object({
  clockifyApiToken: z.string().describe("Clockify API Token"),
});

const TOOLS: (McpToolConfig | McpToolConfigWithoutParameters)[] = [
  getCurrentUserTool,
  listUsersTool,
  findWorkspacesTool,
  summaryReportTool,
  getHoursByClientTool,
  detailedReportTool,
  findProjectTool,
  editProjectTool,
  mergeProjectsTool,
  createEntryTool,
  listEntriesTool,
  editEntryTool,
  deleteEntryTool,
  bulkEditEntriesTool,
  moveEntriesTool,
  listCustomFieldsTool,
  setProjectCustomFieldTool,
  getTagsTool,
  createTagTool,
  editTagTool,
  listTasksTool,
  createTaskTool,
  editTaskTool,
  deleteTaskTool,
];

const server = new McpServer(SERVER_CONFIG);

export default function createStatelessServer({
  config,
}: {
  config: z.infer<typeof configSchema>;
}) {
  setApiToken(config.clockifyApiToken);

  for (const tool of TOOLS) {
    if ("parameters" in tool) {
      server.tool(tool.name, tool.description, tool.parameters, tool.handler);
    } else {
      server.tool(tool.name, tool.description, tool.handler);
    }
  }

  return server.server;
}

(() => {
  if (argv.find((flag) => flag === "--local")) {
    if (!env.CLOCKIFY_API_TOKEN) {
      console.error("CLOCKIFY_API_TOKEN environment variable is required");
      process.exit(1);
    }

    createStatelessServer({
      config: {
        clockifyApiToken: env.CLOCKIFY_API_TOKEN,
      },
    });
    const transport = new StdioServerTransport();
    server.connect(transport);
  }
})();
