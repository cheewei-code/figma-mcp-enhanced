## Project overview
This is figma-mcp-enhanced, a fork of witxhhaven/figma-mcp.
It is a local MCP server that bridges Claude Code with Figma via
a WebSocket plugin. We are enhancing it with Official Figma MCP features.

## Architecture
- server/index.ts — MCP server + WebSocket server (main entry point)
- server/figma-api.ts — NEW: Figma REST API module (do not confuse with plugin bridge)
- plugin/ — Figma plugin files (DO NOT MODIFY)
- dist/ — compiled output (DO NOT EDIT DIRECTLY)
- .mcp.json — Claude Code auto-detection config

## How the two systems work
1. Plugin bridge — WebSocket on port 3002, communicates with Figma desktop app
   via the installed plugin. Used for canvas read/write.
2. REST API — calls api.figma.com using FIGMA_API_TOKEN env variable.
   Used for comments, variables, team libraries, webhooks, projects.

## Existing tools (DO NOT BREAK)
- get_scene, get_selection, execute_code, export_image, connection_status
- All route through the WebSocket plugin bridge

## New tools being added
- Phase 1: get_file_metadata, get_comments, post_comment,
  delete_comment, get_version_history
- Phase 2: get_variables, set_variable, get_team_components,
  get_dev_resources, post_dev_resource, get_design_context
- Phase 3: get_project_structure, list_webhooks,
  create_webhook, delete_webhook

## Environment variables needed
- FIGMA_API_TOKEN — Figma personal access token
- FIGMA_TEAM_ID — your Figma team ID (for library and webhook tools)

## Build commands
- npm install — install dependencies
- npm run build — compile TypeScript
- npm run build:plugin — build the Figma plugin
- npm run dev — run both together

## Rules for Claude Code
- Always read server/index.ts before making changes
- Never modify anything inside plugin/ folder
- Never edit dist/ directly
- Always run npm run build after changes to verify no TypeScript errors
- Keep existing tools working — test connection_status after any server changes
- Use async/await for all Figma API calls
- Handle API errors gracefully with clear error messages
