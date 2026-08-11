import { AxiosInstance } from "axios";
import { reportsApi } from "../config/api";
import { TDetailedReportSchema, TSummaryReportSchema } from "../types";

/**
 * Map a raw detailed-report entry to a stable shape with the fields an
 * admin workflow needs, including the mutability flags (locked, approval,
 * invoiced) so bulk jobs can preflight instead of failing one entry at a
 * time.
 */
export function mapDetailedEntry(entry: any): Record<string, unknown> {
  return {
    id: entry._id,
    userId: entry.userId,
    userName: entry.userName,
    userEmail: entry.userEmail,
    projectId: entry.projectId,
    projectName: entry.projectName,
    clientId: entry.clientId,
    clientName: entry.clientName,
    taskId: entry.taskId,
    taskName: entry.taskName,
    description: entry.description,
    start: entry.timeInterval?.start,
    end: entry.timeInterval?.end,
    durationSeconds: entry.timeInterval?.duration,
    billable: entry.billable,
    tags: (entry.tags ?? []).map((tag: any) => ({
      id: tag._id,
      name: tag.name,
    })),
    isLocked: entry.isLocked ?? false,
    approvalRequestId: entry.approvalRequestId ?? null,
    invoiced: Boolean(
      entry.invoicingInfo?.invoiceId ?? entry.invoicingInfo?.manuallyInvoiced
    ),
  };
}

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

  async function detailed(params: TDetailedReportSchema) {
    const body: Record<string, unknown> = {
      dateRangeStart: params.start.toISOString(),
      dateRangeEnd: params.end.toISOString(),
      detailedFilter: {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 200,
        sortColumn: "DATE",
      },
    };

    if (params.userIds?.length) {
      body.users = { ids: params.userIds, contains: "CONTAINS", status: "ALL" };
    }
    if (params.projectIds?.length) {
      body.projects = { ids: params.projectIds, contains: "CONTAINS" };
    }
    if (params.clientIds?.length) {
      body.clients = { ids: params.clientIds, contains: "CONTAINS" };
    }

    return reportsApi.post(
      `workspaces/${params.workspaceId}/reports/detailed`,
      body
    );
  }

  /**
   * Fetch every page of a detailed report. Used by bulk operations that
   * need the complete entry set (e.g. merge-projects) rather than one page.
   */
  async function detailedAllPages(
    params: Omit<TDetailedReportSchema, "page" | "pageSize">
  ) {
    const pageSize = 1000;
    const entries: any[] = [];
    let page = 1;

    while (true) {
      const response = await detailed({ ...params, page, pageSize });
      const batch = response.data?.timeentries ?? [];
      entries.push(...batch);
      if (batch.length < pageSize) break;
      page++;
    }

    return entries;
  }

  return { summary, detailed, detailedAllPages };
}

export const reportsService = ReportsService(reportsApi);
