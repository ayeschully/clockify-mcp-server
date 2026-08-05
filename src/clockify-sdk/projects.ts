import { AxiosInstance } from "axios";
import { api } from "../config/api";
import { fetchAllPages } from "../config/pagination";
import { TEditProjectSchema } from "../types";
import { omitUndefined } from "../config/object-utils";

function ProjectsService(api: AxiosInstance) {
  async function fetchAll(workspaceId: string) {
    const params = new URLSearchParams({ archived: "false" });
    const data = await fetchAllPages<any>(
      `workspaces/${workspaceId}/projects`,
      params
    );
    return { data };
  }

  async function update(params: TEditProjectSchema) {
    const { workspaceId, projectId, ...rest } = params;

    return api.put(
      `workspaces/${workspaceId}/projects/${projectId}`,
      omitUndefined(rest)
    );
  }

  return { fetchAll, update };
}

export const projectsService = ProjectsService(api);
