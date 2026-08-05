import { AxiosInstance } from "axios";
import { reportsApi } from "../config/api";
import { TSummaryReportSchema } from "../types";

function ReportsService(reportsApi: AxiosInstance) {
  async function summary(params: TSummaryReportSchema) {
    const body: Record<string, unknown> = {
      dateRangeStart: params.start.toISOString(),
      dateRangeEnd: params.end.toISOString(),
      summaryFilter: { groups: ["PROJECT", "USER"] },
    };

    if (params.projectIds?.length) {
      body.projects = { ids: params.projectIds, contains: "CONTAINS" };
    }

    return reportsApi.post(
      `workspaces/${params.workspaceId}/reports/summary`,
      body
    );
  }

  return { summary };
}

export const reportsService = ReportsService(reportsApi);
