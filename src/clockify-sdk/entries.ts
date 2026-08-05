import { AxiosInstance } from "axios";
import { api } from "../config/api";
import {
  TCreateEntrySchema,
  TFindEntrySchema,
  TDeleteEntrySchema,
  TEditEntrySchema,
} from "../types";
import { URLSearchParams } from "node:url";
import { fetchAllPages } from "../config/pagination";
import { omitUndefined } from "../config/object-utils";

function EntriesService(api: AxiosInstance) {
  async function create(entry: TCreateEntrySchema) {
    const { workspaceId, ...rest } = entry;

    return api.post(
      `workspaces/${workspaceId}/time-entries`,
      omitUndefined(rest)
    );
  }

  async function find(filters: TFindEntrySchema & { userId: string }) {
    const searchParams = new URLSearchParams();

    if (filters.description)
      searchParams.append("description", filters.description);

    if (filters.start)
      searchParams.append("start", filters.start.toISOString());

    if (filters.end) searchParams.append("end", filters.end.toISOString());

    if (filters.project) searchParams.append("project", filters.project);

    const data = await fetchAllPages<any>(
      `workspaces/${filters.workspaceId}/user/${filters.userId}/time-entries`,
      searchParams
    );

    return { data };
  }

  async function deleteEntry(params: TDeleteEntrySchema) {
    return api.delete(
      `workspaces/${params.workspaceId}/time-entries/${params.timeEntryId}`
    );
  }

  async function update(params: TEditEntrySchema) {
    const { workspaceId, timeEntryId, ...rest } = params;

    return api.put(
      `workspaces/${workspaceId}/time-entries/${timeEntryId}`,
      omitUndefined(rest)
    );
  }

  async function getById(workspaceId: string, timeEntryId: string) {
    return api.get(`workspaces/${workspaceId}/time-entries/${timeEntryId}`);
  }

  return { create, find, deleteEntry, update, getById };
}

export const entriesService = EntriesService(api);
