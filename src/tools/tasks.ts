import { z } from "zod";
import { TOOLS_CONFIG } from "../config/api";
import { tasksService } from "../clockify-sdk/tasks";
import {
  McpResponse,
  McpToolConfig,
  TCreateTaskSchema,
  TDeleteTaskSchema,
  TEditTaskSchema,
} from "../types";

export const listTasksTool: McpToolConfig = {
  name: TOOLS_CONFIG.tasks.list.name,
  description: TOOLS_CONFIG.tasks.list.description,
  parameters: {
    workspaceId: z.string().describe("The ID of the workspace"),
    projectId: z.string().describe("The ID of the project to get tasks from"),
  },
  handler: async ({
    workspaceId,
    projectId,
  }: {
    workspaceId: string;
    projectId: string;
  }): Promise<McpResponse> => {
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new Error("Workspace ID required to fetch tasks");
    }
    if (!projectId || typeof projectId !== "string") {
      throw new Error("Project ID required to fetch tasks");
    }

    try {
      const response = await tasksService.fetchAll(workspaceId, projectId);
      const tasks = response.data.map((task: any) => ({
        id: task.id,
        name: task.name,
        projectId: task.projectId,
        status: task.status,
        assigneeIds: task.assigneeIds,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(tasks),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to retrieve tasks: ${error.message}`);
    }
  },
};

export const createTaskTool: McpToolConfig = {
  name: TOOLS_CONFIG.tasks.create.name,
  description: TOOLS_CONFIG.tasks.create.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The ID of the workspace that contains the project"),
    projectId: z
      .string()
      .describe("The ID of the project to create the task in"),
    name: z.string().describe("The name of the task to create"),
    assigneeIds: z
      .array(z.string())
      .optional()
      .describe("Optional array of user IDs to assign to the task"),
    status: z
      .enum(["ACTIVE", "DONE"])
      .optional()
      .describe("Optional status of the task (defaults to ACTIVE)"),
  },
  handler: async (params: TCreateTaskSchema): Promise<McpResponse> => {
    try {
      const result = await tasksService.create(params);

      const task = result.data;
      return {
        content: [
          {
            type: "text",
            text: `Task created successfully. ID: ${task.id} Name: ${task.name} Status: ${task.status}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to create task: ${error.message}`);
    }
  },
};

export const editTaskTool: McpToolConfig = {
  name: TOOLS_CONFIG.tasks.edit.name,
  description: TOOLS_CONFIG.tasks.edit.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace where the task is located"),
    projectId: z
      .string()
      .describe("The id of the project the task belongs to"),
    taskId: z.string().describe("The id of the task to be edited"),
    name: z.string().optional().describe("The new name of the task"),
    status: z
      .enum(["ACTIVE", "DONE"])
      .optional()
      .describe("The status of the task, ACTIVE or DONE"),
    assigneeIds: z
      .array(z.string())
      .optional()
      .describe("Replacement array of assignee user IDs"),
  },
  handler: async (params: TEditTaskSchema): Promise<McpResponse> => {
    try {
      // The Clockify API requires a name on task updates, so fetch the
      // current task and merge it with the provided params
      const current = await tasksService.getById(
        params.workspaceId,
        params.projectId,
        params.taskId
      );

      const result = await tasksService.update({
        workspaceId: params.workspaceId,
        projectId: params.projectId,
        taskId: params.taskId,
        name: params.name ?? current.data.name,
        status: params.status ?? current.data.status,
        assigneeIds: params.assigneeIds ?? current.data.assigneeIds,
      });

      return {
        content: [
          {
            type: "text",
            text: `Task updated successfully. ID: ${result.data.id} Name: ${result.data.name} Status: ${result.data.status}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to edit task: ${error.message}`);
    }
  },
};

export const deleteTaskTool: McpToolConfig = {
  name: TOOLS_CONFIG.tasks.delete.name,
  description: TOOLS_CONFIG.tasks.delete.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The ID of the workspace that contains the project"),
    projectId: z
      .string()
      .describe("The ID of the project that contains the task"),
    taskId: z.string().describe("The ID of the task to delete"),
  },
  handler: async (params: TDeleteTaskSchema): Promise<McpResponse> => {
    try {
      await tasksService.remove(
        params.workspaceId,
        params.projectId,
        params.taskId
      );
    } catch (error: any) {
      if (error?.response?.status === 403) {
        // The task is left untouched — surface an actionable message so the
        // caller knows deletion is admin-only (not a task-status problem).
        throw new Error(
          "Delete failed: this Clockify token lacks admin permission to delete tasks " +
            "(Clockify 403). The task was NOT deleted. To close it instead, use edit-task " +
            "with status DONE, or have a workspace admin delete it in the Clockify UI."
        );
      }
      throw new Error(`Failed to delete task: ${error.message}`);
    }

    return {
      content: [
        {
          type: "text",
          text: `Task deleted successfully. ID: ${params.taskId}`,
        },
      ],
    };
  },
};
