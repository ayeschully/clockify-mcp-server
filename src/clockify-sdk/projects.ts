import { AxiosInstance } from "axios";
import { api } from "../config/api";
import { fetchAllPages } from "../config/pagination";
import { TEditProjectSchema } from "../types";
import { omitUndefined } from "../config/object-utils";

export interface FetchProjectsOptions {
  archived?: "active" | "archived" | "both";
  hydrated?: boolean;
}

function ProjectsService(api: AxiosInstance) {
  async function fetchAll(
    workspaceId: string,
    options: FetchProjectsOptions = {}
  ) {
    const params = new URLSearchParams();

    const archived = options.archived ?? "active";
    // "both" omits the filter so Clockify returns active + archived
    if (archived !== "both") {
      params.set("archived", archived === "archived" ? "true" : "false");
    }
    if (options.hydrated) params.set("hydrated", "true");

    const data = await fetchAllPages<any>(
      `workspaces/${workspaceId}/projects`,
      params
    );
    return { data };
  }

  async function getById(workspaceId: string, projectId: string) {
    return api.get(`workspaces/${workspaceId}/projects/${projectId}`);
  }

  async function update(params: TEditProjectSchema) {
    const { workspaceId, projectId, ...rest } = params;

    return api.put(
      `workspaces/${workspaceId}/projects/${projectId}`,
      omitUndefined(rest)
    );
  }

  return { fetchAll, getById, update };
}

export const projectsService = ProjectsService(api);
