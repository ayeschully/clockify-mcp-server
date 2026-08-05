import { AxiosInstance } from "axios";
import { api } from "../config/api";
import { fetchAllPages } from "../config/pagination";
import { TCreateTaskSchema, TEditTaskSchema } from "../types";
import { omitUndefined } from "../config/object-utils";

function TasksService(api: AxiosInstance) {
  async function fetchAll(workspaceId: string, projectId: string) {
    const data = await fetchAllPages<any>(
      `workspaces/${workspaceId}/projects/${projectId}/tasks`
    );
    return { data };
  }

  async function getById(
    workspaceId: string,
    projectId: string,
    taskId: string
  ) {
    return api.get(
      `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
    );
  }

  async function create(params: TCreateTaskSchema) {
    const { workspaceId, projectId, ...rest } = params;

    return api.post(
      `workspaces/${workspaceId}/projects/${projectId}/tasks`,
      omitUndefined(rest)
    );
  }

  async function update(params: TEditTaskSchema) {
    const { workspaceId, projectId, taskId, ...rest } = params;

    return api.put(
      `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`,
      omitUndefined(rest)
    );
  }

  async function remove(workspaceId: string, projectId: string, taskId: string) {
    return api.delete(
      `workspaces/${workspaceId}/projects/${projectId}/tasks/${taskId}`
    );
  }

  return { fetchAll, getById, create, update, remove };
}

export const tasksService = TasksService(api);
