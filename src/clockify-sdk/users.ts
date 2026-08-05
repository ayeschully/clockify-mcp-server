import { AxiosInstance } from "axios";
import { api } from "../config/api";
import { fetchAllPages } from "../config/pagination";

function UsersService(api: AxiosInstance) {
  async function getCurrent() {
    return api.get("user");
  }

  async function fetchAll(workspaceId: string) {
    const data = await fetchAllPages<any>(`workspaces/${workspaceId}/users`);
    return { data };
  }

  return { getCurrent, fetchAll };
}

export const usersService = UsersService(api);
