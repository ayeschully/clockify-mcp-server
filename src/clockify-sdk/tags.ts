import { AxiosInstance } from "axios";
import { api } from "../config/api";
import { fetchAllPages } from "../config/pagination";
import { TEditTagSchema } from "../types";
import { omitUndefined } from "../config/object-utils";

function TagsService(api: AxiosInstance) {
  async function fetchAll(workspaceId: string) {
    const data = await fetchAllPages<any>(`workspaces/${workspaceId}/tags`);
    return { data };
  }

  async function create(workspaceId: string, name: string) {
    return api.post(`workspaces/${workspaceId}/tags`, { name });
  }

  async function update(params: TEditTagSchema) {
    const { workspaceId, tagId, ...rest } = params;

    return api.put(
      `workspaces/${workspaceId}/tags/${tagId}`,
      omitUndefined(rest)
    );
  }

  return { fetchAll, create, update };
}

export const tagsService = TagsService(api);
