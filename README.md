# Clockify MCP Server

[![smithery badge](https://smithery.ai/badge/@https-eduardo/clockify-mcp-server)](https://smithery.ai/server/@https-eduardo/clockify-mcp-server)

This MCP Server integrates with AI Tools to manage your time entries in Clockify, so you can register your time entries just sending a prompt to the LLM.

## Available Tools

| Tool | Description |
| --- | --- |
| `get-current-user` | Get the current user id, name and email |
| `list-users` | List all members of a workspace |
| `get-workspaces` | List available workspaces |
| `get-summary-report` | Total tracked time per project across ALL workspace members |
| `get-projects` | List projects in a workspace |
| `edit-project` | Edit a project (name, client, color, note, billable, visibility, archived) |
| `create-time-entry` | Register a new time entry |
| `list-time-entries` | Search time entries for one user (defaults to current user) |
| `edit-time-entry` | Edit an existing time entry |
| `delete-time-entry` | Delete a time entry |
| `get-tags` | List tags in a workspace |
| `create-tag` | Create a new tag |
| `edit-tag` | Rename or archive a tag |
| `list-tasks` | List tasks (activities) within a project |
| `edit-task` | Rename a task or mark it ACTIVE/DONE |

## Using in Claude Desktop

### Installing via Smithery

To install clockify-mcp-server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/@https-eduardo/clockify-mcp-server):

```bash
npx -y @smithery/cli install @https-eduardo/clockify-mcp-server --client claude
```

### Installing Manually

First, install tsx globally

`npm i -g tsx`

Then insert the MCP server in `claude_desktop_config`

```json
{
  "mcpServers": {
    "clockify-time-entries": {
      "command": "tsx",
      "args": ["ABSOLUTE_PATH/src/index.ts", "--local"],
      "env": {
        "CLOCKIFY_API_URL": "https://api.clockify.me/api/v1",
        "CLOCKIFY_API_TOKEN": "YOUR_CLOCKIFY_API_TOKEN_HERE"
      }
    }
  }
}
```

## Development

```bash
npm install
npm run typecheck   # TypeScript check, no emit
npm run test:unit   # unit tests only (no Clockify account needed)
npm test            # full suite, requires a configured .env
```

The full test suite spawns the server over stdio and calls the real Clockify API. Copy `.env.example` to `.env` and fill in `CLOCKIFY_API_TOKEN`, `TEST_WORKSPACE_ID`, `TEST_USER_ID` and `TEST_PROJECT_ID` before running it.
