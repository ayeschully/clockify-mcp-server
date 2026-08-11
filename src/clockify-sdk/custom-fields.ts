import { AxiosInstance } from "axios";
import { api } from "../config/api";

function CustomFieldsService(api: AxiosInstance) {
  async function fetchAll(workspaceId: string) {
    return api.get(`workspaces/${workspaceId}/custom-fields`);
  }

  // Sets the field's default value FOR THAT PROJECT — this is how Clockify
  // stores project-level custom field data ("additional fields" in the UI)
  async function setProjectDefault(
    workspaceId: string,
    projectId: string,
    customFieldId: string,
    value: unknown
  ) {
    return api.patch(
      `workspaces/${workspaceId}/projects/${projectId}/custom-fields/${customFieldId}`,
      { defaultValue: value }
    );
  }

  return { fetchAll, setProjectDefault };
}

export const customFieldsService = CustomFieldsService(api);
