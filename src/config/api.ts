import "dotenv/config";
import axios from "axios";

export const api = axios.create({
  baseURL: process.env.CLOCKIFY_API_URL || "https://api.clockify.me/api/v1",
});

// The Reports API lives on its own host and provides workspace-wide
// aggregations that the base API can't (e.g. time per project across users)
export const reportsApi = axios.create({
  baseURL:
    process.env.CLOCKIFY_REPORTS_API_URL || "https://reports.api.clockify.me/v1",
});

// Clockify only accepts API keys via the X-Api-Key header. Sending the key
// as an Authorization Bearer token is rejected with a 401
export function setApiToken(token: string) {
  api.defaults.headers.common["X-Api-Key"] = token;
  reportsApi.defaults.headers.common["X-Api-Key"] = token;
}

export const SERVER_CONFIG = {
  name: "Clockify MCP Server",
  version: "1.3.1",
  description:
    "A service that integrates with Clockify API to manage time entries",
};

export const TOOLS_CONFIG = {
  workspaces: {
    list: {
      name: "get-workspaces",
      description:
        "Get user available workspaces id and name, a workspace is required to manage time entries",
    },
  },
  projects: {
    list: {
      name: "get-projects",
      description:
        "Get workspace projects. Fetches ALL pages (never truncated). By default returns active projects with id, name and clientName; set full=true for complete objects including customFields, archived, clientId, billable, note, color, public and estimates. Use archived to include archived projects",
    },
    edit: {
      name: "edit-project",
      description:
        "Edit an existing project in a workspace (name, client, color, note, billable, visibility or archived state)",
    },
    merge: {
      name: "merge-projects",
      description:
        "Merge one project into another: moves ALL time entries (across every workspace member) from the source project to the target, remaps or clears project-scoped tasks, optionally archives the source, and returns a full manifest. Processes up to 500 entries per call — re-run the same call until remainingEntries is 0. Runs as a dry-run plan by default; set dryRun=false explicitly to execute. Requires a workspace admin API token",
    },
  },
  users: {
    current: {
      name: "get-current-user",
      description:
        "Get the current user id and name, to search for entries is required to have the user id",
    },
    list: {
      name: "list-users",
      description:
        "List all members of a workspace with their id, name, email and status",
    },
  },
  reports: {
    summary: {
      name: "get-summary-report",
      description:
        "Get total tracked time grouped by project across ALL workspace members, optionally filtered to specific projects. Use this to check whether time has been logged to a project, since list-time-entries only covers a single user",
    },
    hoursByClient: {
      name: "get-hours-by-client",
      description:
        "Get total hours worked per client for a date range in a workspace, aggregated on the server. Returns a compact summary (hours per client + total) instead of raw time entries. Note: projects are grouped by their Clockify client name.",
    },
    detailed: {
      name: "get-detailed-report",
      description:
        "Get individual time entries WITH their ids across ALL workspace members in one paginated call, optionally filtered by users, projects or clients. Each entry includes id, user, project, task, description, times, duration, billable, tags, custom field values (with names) and the mutability flags (isLocked, approvalRequestId, invoiced) needed before attempting edits. Use this instead of list-time-entries for workspace-wide auditing or to drive bulk corrections. Viewing other members' entries requires admin/manager permissions",
    },
  },
  customFields: {
    list: {
      name: "list-custom-fields",
      description:
        "List the custom fields ('additional fields') defined on a workspace with their id, name, type, status and allowed values, so callers can discover field ids for filtering or writing values. Pass projectId to also get each field's default value for that project (projectValue) — this is where project-level custom field data lives",
    },
    setProjectValue: {
      name: "set-project-custom-field",
      description:
        "Set the default value of a workspace custom field on a specific project (by field id or name). This is how project-level custom field data is stored in Clockify. Requires a workspace admin API token",
    },
  },
  entries: {
    create: {
      name: "create-time-entry",
      description:
        "Register a new time entry of a task or break in a workspace",
    },
    list: {
      name: "list-time-entries",
      description:
        "Get registered time entries from a workspace, including each entry's custom field values (name, type, value)",
    },
    delete: {
      name: "delete-time-entry",
      description: "Delete a specific time entry from a workspace",
    },
    edit: {
      name: "edit-time-entry",
      description:
        "Edit an existing time entry in a workspace. Only the supplied fields change; everything else (project, task, tags, billable, custom field values) is preserved",
    },
    bulkEdit: {
      name: "bulk-edit-time-entries",
      description:
        "Edit up to 500 time entries in one call, each with its own field changes. Runs as a dry-run plan by default (returns before/after for every entry without writing); set dryRun=false to execute. Returns a per-entry success/failure manifest usable as an undo file. Editing other members' entries requires a workspace admin API token",
    },
    move: {
      name: "move-time-entries-to-project",
      description:
        "Move up to 500 time entries to a different project with task remapping (clear, match-by-name or fail-if-task-present, since tasks are project-scoped). Runs as a dry-run plan by default; set dryRun=false to execute. Returns a per-entry manifest with before/after state. Moving other members' entries requires a workspace admin API token",
    },
  },
  tags: {
    list: {
      name: "get-tags",
      description: "Get all tags in a workspace",
    },
    create: {
      name: "create-tag",
      description: "Create a new tag in a workspace",
    },
    edit: {
      name: "edit-tag",
      description: "Rename or archive an existing tag in a workspace",
    },
  },
  tasks: {
    list: {
      name: "list-tasks",
      description:
        "List tasks (activities) within a project. Tasks can be associated with time entries.",
    },
    create: {
      name: "create-task",
      description:
        "Create a new task (activity) within a project. The created task can be associated with time entries.",
    },
    edit: {
      name: "edit-task",
      description:
        "Edit an existing task (activity) in a project, renaming it, marking it as active/done or reassigning it",
    },
    delete: {
      name: "delete-task",
      description:
        "Permanently delete a task (activity) from a project. Requires an admin API token — Clockify returns 403 for non-admins regardless of the task's status. To close a task without deleting it, use edit-task with status DONE.",
    },
  },
};
