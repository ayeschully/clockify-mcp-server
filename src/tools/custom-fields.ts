import { z } from "zod";
import { TOOLS_CONFIG } from "../config/api";
import { customFieldsService } from "../clockify-sdk/custom-fields";
import {
  McpResponse,
  McpToolConfig,
  TSetProjectCustomFieldSchema,
} from "../types";

export const listCustomFieldsTool: McpToolConfig = {
  name: TOOLS_CONFIG.customFields.list.name,
  description: TOOLS_CONFIG.customFields.list.description,
  parameters: {
    workspaceId: z
      .string()
      .describe("The id of the workspace to list custom fields for"),
    projectId: z
      .string()
      .optional()
      .describe(
        "Optional: also resolve each field's default value FOR THIS PROJECT (projectValue). This is where project-level custom field data lives"
      ),
  },
  handler: async ({
    workspaceId,
    projectId,
  }: {
    workspaceId: string;
    projectId?: string;
  }): Promise<McpResponse> => {
    try {
      const response = projectId
        ? await customFieldsService.fetchForProject(workspaceId, projectId)
        : await customFieldsService.fetchAll(workspaceId);

      const fields = (response.data ?? []).map((field: any) => ({
        id: field.id,
        name: field.name,
        type: field.type,
        status: field.status,
        entityType: field.entityType,
        required: field.required,
        placeholder: field.placeholder,
        allowedValues: field.allowedValues,
        onlyAdminCanEdit: field.onlyAdminCanEdit,
        workspaceDefaultValue: field.workspaceDefaultValue,
        ...(projectId
          ? {
              projectValue: (field.projectDefaultValues ?? []).find(
                (pd: any) => pd.projectId === projectId
              )?.value ?? null,
            }
          : {}),
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(fields),
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to list custom fields: ${error.message}`);
    }
  },
};

export const setProjectCustomFieldTool: McpToolConfig = {
  name: TOOLS_CONFIG.customFields.setProjectValue.name,
  description: TOOLS_CONFIG.customFields.setProjectValue.description,
  parameters: {
    workspaceId: z.string().describe("The id of the workspace"),
    projectId: z
      .string()
      .describe("The id of the project to set the field value on"),
    customFieldId: z
      .string()
      .optional()
      .describe(
        "The id of the custom field. Provide this or customFieldName"
      ),
    customFieldName: z
      .string()
      .optional()
      .describe(
        "The name of the custom field (resolved via list-custom-fields). Provide this or customFieldId"
      ),
    value: z
      .union([z.string(), z.number(), z.boolean(), z.null()])
      .describe("The value to set. Use null to clear the field"),
  },
  handler: async (
    params: TSetProjectCustomFieldSchema
  ): Promise<McpResponse> => {
    try {
      let fieldId = params.customFieldId;
      let fieldName = params.customFieldName;

      if (!fieldId) {
        if (!fieldName) {
          throw new Error("Either customFieldId or customFieldName is required");
        }
        const response = await customFieldsService.fetchAll(params.workspaceId);
        const wanted = fieldName.toLowerCase();
        const match = (response.data ?? []).find(
          (field: any) => String(field.name).toLowerCase() === wanted
        );
        if (!match) {
          const available = (response.data ?? [])
            .map((field: any) => field.name)
            .join(", ");
          throw new Error(
            `No custom field named "${fieldName}" on this workspace. Available: ${available || "(none)"}`
          );
        }
        fieldId = match.id;
        fieldName = match.name;
      }

      await customFieldsService.setProjectDefault(
        params.workspaceId,
        params.projectId,
        fieldId!,
        params.value
      );

      return {
        content: [
          {
            type: "text",
            text: `Custom field ${fieldName ?? fieldId} set to ${JSON.stringify(
              params.value
            )} on project ${params.projectId}`,
          },
        ],
      };
    } catch (error: any) {
      throw new Error(`Failed to set project custom field: ${error.message}`);
    }
  },
};
