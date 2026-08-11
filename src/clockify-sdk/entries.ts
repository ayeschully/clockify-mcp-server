import { AxiosInstance } from "axios";
import { api } from "../config/api";
import {
  TCreateEntrySchema,
  TFindEntrySchema,
  TDeleteEntrySchema,
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

  // PUT is a full replace — callers must send a complete body built with
  // mergeEntryUpdate() so omitted fields aren't cleared on the entry
  async function update(
    workspaceId: string,
    timeEntryId: string,
    body: Record<string, unknown>
  ) {
    return api.put(
      `workspaces/${workspaceId}/time-entries/${timeEntryId}`,
      body
    );
  }

  async function getById(workspaceId: string, timeEntryId: string) {
    return api.get(`workspaces/${workspaceId}/time-entries/${timeEntryId}`);
  }

  return { create, find, deleteEntry, update, getById };
}

export const entriesService = EntriesService(api);
