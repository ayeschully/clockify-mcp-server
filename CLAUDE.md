# CLAUDE.md — Clockify MCP Server

MCP server exposing Clockify time-tracking as tools, built on the Clockify REST API v1
(https://docs.clockify.me/). Runs two ways:

- **Local (stdio)**: `tsx src/index.ts --local`, auth from `CLOCKIFY_API_TOKEN` env var. This is how Claude Desktop / Claude Code launch it.
- **Hosted (Smithery)**: the default export `createStatelessServer({ config })` is the entrypoint; auth comes from the `configSchema` (`clockifyApiToken`).

## Commands

```bash
npm run typecheck   # tsc --noEmit — run after every change
npm run test:unit   # pagination tests, no credentials needed
npm test            # full integration suite — needs .env with real Clockify creds
npm run dev|build   # Smithery CLI
```

Integration tests hit the **real Clockify API** (they create, edit and delete a time entry in `TEST_WORKSPACE_ID`). Never run `npm test` without a configured `.env`; use `test:unit` otherwise.

## Architecture

```
src/
├── index.ts              # server bootstrap; TOOLS array is the single registration point
├── config/
│   ├── api.ts            # axios instance, setApiToken(), SERVER_CONFIG, TOOLS_CONFIG (all tool names/descriptions)
│   ├── pagination.ts     # fetchAllPages() — Clockify pages at 200 items
│   └── object-utils.ts   # omitUndefined() — strip undefined before sending bodies
├── clockify-sdk/         # one service per resource; ONLY place that calls the API
├── tools/                # MCP tool definitions: zod params + handler; delegates to the sdk
├── validation/           # zod schemas per resource; types inferred in types/index.ts
└── types/index.ts        # T*Schema types + Mcp* interfaces
```

## Conventions (follow these when adding tools)

1. **One layer each**: zod schema in `validation/<resource>/`, inferred `T<Name>Schema` type in `types/index.ts`, API call in `clockify-sdk/<resource>.ts`, tool object in `tools/<resource>.ts`, name/description in `TOOLS_CONFIG` (`config/api.ts`), then append to the `TOOLS` array in `index.ts`.
2. Tool names are kebab-case verbs: `create-*`, `get-*`/`list-*`, `edit-*`, `delete-*`.
3. Handlers return `McpResponse` with a single text content item — human sentence for mutations, `JSON.stringify` of a trimmed object list for reads.
4. Wrap every handler body in try/catch and rethrow as `Failed to <verb> <resource>: ${error.message}`.
5. Use `fetchAllPages` for every list endpoint; use `omitUndefined` for every request body with optional fields.
6. Services are factory functions taking `AxiosInstance` (see `EntriesService`) so tests can inject a mock.

## Clockify API gotchas

- Auth header is `X-Api-Key` ONLY (set via `setApiToken`, never at module load — the token isn't available until config/env is read). Sending the API key as `Authorization: Bearer` is rejected with 401 "Multiple or none auth tokens present".
- `PUT /time-entries/{id}` is a FULL REPLACE: omitted fields (project, task, tags, billable, custom field values) are cleared, not preserved. Every entry update MUST go through `mergeEntryUpdate()` (`config/entry-merge.ts`), which GETs the entry and merges edits over it. Never call `entriesService.update` with a partial body.
- Locked (`isLocked`), approval-pending/approved (`approvalRequestId`) and invoiced entries reject edits at the API. The detailed report exposes these flags; bulk tools report such failures per item instead of aborting.
- The detailed report (`POST reports/detailed`, Reports API host) is the only way to enumerate time entries with ids across ALL workspace members; the base API's entry list is per-user. Entry ids come back as `_id`, times/duration under `timeInterval`.
- Project-level custom field values are stored as per-project DEFAULTS of workspace custom fields (`PATCH /projects/{id}/custom-fields/{fieldId}` with `defaultValue`). Custom fields require a paid Clockify plan.
- A valid key whose account has no workspace membership gets 404 `"WORKSPACE with ID 'null' not found"` on `/user` and `[]` from `/workspaces` — that means the key was generated under the wrong Clockify account, not that the code is broken.
- The Reports API is a separate host (`reports.api.clockify.me/v1`, `reportsApi` axios instance) and is the only way to aggregate time across all workspace members; the base API's time-entry list is always scoped to one user.
- `PUT` endpoints are **full replaces**, not patches. For partial edits, GET the current resource and merge (see `editEntryTool` and `editTaskTool`). Project update is the exception: its fields are optional, so it patches cleanly.
- Tag update (`PUT /tags/{id}`) requires `name` in the body even when only archiving — that's why `edit-tag` makes `name` required.
- Task status is the enum `ACTIVE | DONE`.
- `DELETE /tasks/{id}` is admin-only — Clockify returns 403 for non-admin tokens regardless of task status. `delete-task` surfaces this with an actionable message.
- Time entries come back with times under `timeInterval.start/end`.

## Current tool coverage / roadmap

| Resource | create | read | edit | delete |
| --- | --- | --- | --- | --- |
| Time entries | ✅ | ✅ (per-user list + workspace-wide detailed report) | ✅ (single + bulk + move) | ✅ |
| Projects | ❌ | ✅ (full objects incl. custom fields) | ✅ (+ merge-projects composite) | ❌ |
| Tags | ✅ | ✅ | ✅ | ❌ |
| Tasks | ✅ | ✅ | ✅ | ✅ |
| Users | — | ✅ (current + list) | — | — |
| Reports | — | ✅ (summary, detailed w/ entry ids, hours by client) | — | — |
| Custom fields | — | ✅ (list) | ✅ (set project value) | — |
| Clients | ❌ | ❌ | ❌ | ❌ |

Natural next additions: `create-project`, `delete-tag`, client tools, and a timer (start/stop running entry via `PATCH /time-entries` with no `end`).

## Bulk / admin conventions

- Bulk and composite tools (`bulk-edit-time-entries`, `move-time-entries-to-project`, `merge-projects`) default to `dryRun=true` and only write when `dryRun=false` is passed explicitly. Keep this default for any new bulk tool — the cost of an accidental bulk write far exceeds one extra call.
- Bulk tools return per-item manifests with `before` snapshots (usable as undo files) and never abort the batch on one failure. Shared machinery: `clockify-sdk/entry-admin.ts` (move/bulk core), `config/concurrency.ts` (4-wide concurrency + 429 retry), `config/task-mapping.ts` (project-scoped task remapping: clear / match-by-name / fail-if-task-present).
- Batches are capped at 500 items per call (`BULK_MAX_ITEMS`).
- Clockify has NO native project-merge endpoint (checked Aug 2026); `merge-projects` is a composite over the detailed report + per-entry moves.

## Required permissions

- Workspace admin token: `merge-projects`, `set-project-custom-field`, `edit-project`, tag/task mutations, and any entry mutation on OTHER members' entries.
- Manager or admin: `get-summary-report` / `get-detailed-report` across all members (regular members only see themselves).
- Paid plan: custom fields.
- 403s on entry edits usually mean locked/approved/invoiced time or a non-admin token — the error messages say which to check.

## Known constraints

- Deleting a project in Clockify requires archiving it first (`edit-project` with `archived: true`, then DELETE) — implement `delete-project` that way if added.
- `tsconfig` uses `moduleResolution: Bundler` + `noEmit`; tsx/Smithery do the actual building. Keep `.js` suffixes on `@modelcontextprotocol/sdk` subpath imports.
- Integration tests for edit-project/tag/task don't exist yet — they'd mutate real workspace data with no cleanup path (no delete tools), so add them together with the corresponding delete tools.
