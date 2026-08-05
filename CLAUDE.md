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
| Time entries | ✅ | ✅ | ✅ | ✅ |
| Projects | ❌ | ✅ | ✅ | ❌ |
| Tags | ✅ | ✅ | ✅ | ❌ |
| Tasks | ✅ | ✅ | ✅ | ✅ |
| Users | — | ✅ (current + list) | — | — |
| Reports | — | ✅ (summary by project/user, hours by client) | — | — |
| Clients | ❌ | ❌ | ❌ | ❌ |

Natural next additions: `create-project`, `delete-tag`, client tools, and a timer (start/stop running entry via `PATCH /time-entries` with no `end`).

## Known constraints

- Deleting a project in Clockify requires archiving it first (`edit-project` with `archived: true`, then DELETE) — implement `delete-project` that way if added.
- `tsconfig` uses `moduleResolution: Bundler` + `noEmit`; tsx/Smithery do the actual building. Keep `.js` suffixes on `@modelcontextprotocol/sdk` subpath imports.
- Integration tests for edit-project/tag/task don't exist yet — they'd mutate real workspace data with no cleanup path (no delete tools), so add them together with the corresponding delete tools.
