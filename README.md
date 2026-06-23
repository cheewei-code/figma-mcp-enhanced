# Claude-Figma Bridge

Create and edit Figma designs through natural language. This MCP server lets Claude Code read and modify your Figma files. A lightweight Figma plugin connects to a local Node.js server, and Claude Code handles the intelligence.

It works with Figma Design. In limited testing, it also works with FigJam and Figma Slides.

## What You Need

- [Node.js](https://nodejs.org/) v18+
- [Figma](https://www.figma.com/downloads/) desktop app
- **Claude Code** (CLI)
- A Figma personal access token (required for the REST API tools — see [Figma API Token](#figma-api-token))

## Setup

### 1. Install, Build, and Link

Navigate to the folder where you want to keep the repo, then run:

```bash
git clone https://github.com/witxhhaven/figma-mcp.git
cd figma-mcp
npm install
npm run build
npm run build:plugin
npm link
```

`npm link` creates a global `figma-mcp` command so other repos can use the server without knowing the path to this repo. You only need to do this once (and again after a fresh `npm run build` if you pull changes).

> **Note:** You do **not** need to manually start the MCP server. Claude Code launches it automatically when it connects. Just make sure the Figma plugin is running.

### 2. Load the Plugin in Figma

1. Open the Figma desktop app and open any file
2. Go to **Plugins → Development → Import plugin from manifest...**
3. Select `figma-mcp/plugin/manifest.json`

![Import plugin from manifest](screenshots/figma-plugin.png)

4. Run it: **Plugins → Development → Claude-Figma Bridge**
5. A small status window appears with a **red dot** (not connected yet)

![Plugin loaded](screenshots/plugin-loaded.png)

> You only need to import once. After that, just re-run the plugin from the Development menu whenever you open Figma.

### 3. Connect to Claude Code

Copy the `.mcp.json` from the `mcp-config/` folder into the root of the project you want to work in.

**Via terminal:**

```bash
cp /path/to/figma-mcp/mcp-config/.mcp.json /path/to/your-project/
```

**Manually:** `.mcp.json` is a hidden file — run `open .` inside the `mcp-config/` folder of this repo to reveal it in Finder (or press `Cmd + Shift + .` to toggle hidden files), then copy it to your project root.

**If you plan to use the REST API tools**, add your token to the copied `.mcp.json`:

```json
{
  "mcpServers": {
    "cc-figma-bridge": {
      "command": "figma-mcp",
      "env": {
        "FIGMA_API_TOKEN": "your-token-here",
        "FIGMA_FILE_KEY": "your-default-file-key",
        "FIGMA_TEAM_ID": "your-team-id-here"
      }
    }
  }
}
```

- `FIGMA_API_TOKEN` — required for all REST API tools
- `FIGMA_FILE_KEY` — optional default file key; tools will use it when no `file_key` argument is passed
- `FIGMA_TEAM_ID` — only needed for team-level tools (`get_team_components`, `get_project_structure`, webhooks)

See [Figma API Token](#figma-api-token) for how to get these values.

Once copied, open Claude Code from that project directory — it will detect the MCP server and prompt you to confirm:

![Claude Code MCP server detected](screenshots/cc-mcp-notify.png)

Select option 1 to enable the server for this project.

#### Adding globally

If you want the Figma tools available in every Claude Code session without copying `.mcp.json` into each project:

```bash
claude mcp add cc-figma-bridge -s user -- figma-mcp
```

To include env vars when adding globally:

```bash
claude mcp add cc-figma-bridge -s user \
  -e FIGMA_API_TOKEN=your-token-here \
  -e FIGMA_FILE_KEY=your-default-file-key \
  -e FIGMA_TEAM_ID=your-team-id-here \
  -- figma-mcp
```

<!-- #### Claude Desktop (not yet supported)

Add to your config file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS, `%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "cc-figma-bridge": {
      "command": "figma-mcp"
    }
  }
}
```

**Fully quit** Claude Desktop (Cmd+Q / Alt+F4) and reopen it. You should see an MCP tools icon in the chat input. -->

### 4. Verify It Works

If everything is connected, you'll see a **green dot** in the Figma plugin:

![Figma plugin connected](screenshots/figma-plugin-success.png)

And in Claude Code, run `/mcp` to confirm `cc-figma-bridge` shows as connected:

![MCP server connected in Claude Code](screenshots/mcp-added.png)

### 5. Start Using It

Ask Claude anything about your Figma file:

- *"What's on my current Figma page?"*
- *"Extract the color tokens from my codebase and create matching Figma variables"*
- *"Create hover, focus, and disabled states for this button component"*
- *"Apply the blue color variables defined in Figma to this component"*
- *"Sync the spacing and typography tokens from our Tailwind config into Figma variables"*
- *"Generate all the size variants (sm, md, lg) for the selected input component"*
- *"Create a card component with a title, description, and button"*
- and more

## Tools

### Plugin bridge tools

These tools communicate with Figma via the installed plugin. The plugin must be running.

| Tool | What it does |
|---|---|
| `get_scene` | Full scene dump — selected nodes, their properties, variables, text styles, page info |
| `get_selection` | Quick summary of selected nodes (IDs, names, types) |
| `execute_code` | Runs Figma Plugin API code in the sandbox (create nodes, modify properties, etc.) |
| `export_image` | Exports a node as PNG (by node ID or current selection) |
| `connection_status` | Checks if the Figma plugin is connected |

### REST API tools

These tools call the Figma REST API directly — no plugin required. `FIGMA_API_TOKEN` must be set.

The **file key** is the alphanumeric ID in any Figma file URL: `figma.com/file/<file_key>/...`

#### Comments & versions

| Tool | What it does |
|---|---|
| `get_file_metadata` | File name, last modified date, thumbnail URL, version |
| `get_comments` | All comments on a file |
| `post_comment` | Post a comment, optionally pinned to a node |
| `delete_comment` | Delete a comment by ID |
| `get_version_history` | Full version history of a file |

#### Variables & components

| Tool | What it does |
|---|---|
| `get_variables` | All local variables (design tokens) in a file |
| `set_variable` | Update a variable's value for a specific mode |
| `get_team_components` | All published components in a team library — requires `FIGMA_TEAM_ID` |

#### Dev resources

| Tool | What it does |
|---|---|
| `get_dev_resources` | External links attached to specific nodes |
| `post_dev_resource` | Attach an external link to a node |
| `get_design_context` | Full properties and geometry for specific nodes |

#### Projects & webhooks

These tools require `FIGMA_TEAM_ID`.

| Tool | What it does |
|---|---|
| `get_project_structure` | All projects and files in a team |
| `list_webhooks` | All webhooks registered for a team |
| `create_webhook` | Subscribe to a Figma event (`FILE_UPDATE`, `FILE_VERSION_UPDATE`, `FILE_DELETE`, `LIBRARY_PUBLISH`, `FILE_COMMENT`) |
| `delete_webhook` | Remove a webhook by ID |


## Figma API Token

### Getting a personal access token

1. Open Figma (browser or desktop)
2. Click your profile picture → **Settings** → **Security**
3. Under **Personal access tokens**, click **Generate new token**
4. Give it a name, set expiry if desired, and copy the token — it won't be shown again

### Finding your Team ID

1. Open Figma in a **browser**
2. Click your team name in the left sidebar
3. The URL will be: `figma.com/files/team/123456789/Your-Team-Name`
4. The number is your Team ID

> If you're on the free plan with no team workspace, you won't have a Team ID. The three team-level tools won't apply, but all other REST API tools work fine with just the token.

## Uninstall

```bash
npm unlink -g figma-mcp
```

If you added the MCP server globally, remove it:

```bash
claude mcp remove cc-figma-bridge -s user
```

If you copied `.mcp.json` into any project directories, delete those files too.

## Troubleshooting

**Plugin shows red dot (not connected)**
- Make sure the Figma plugin is running and Claude Code is open
- Check port 3002 isn't in use: `lsof -i :3002`
- The plugin auto-reconnects every 3 seconds — wait a moment after starting the server

**Claude doesn't show Figma tools**
- Make sure you're in a directory with `.mcp.json`, or you've added it globally

**"Font not loaded" errors**
- `execute_code` auto-retries with font loading up to 3 times
- If it still fails, load fonts explicitly:
  ```javascript
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  textNode.characters = "Hello";
  ```

**Port 3002 already in use**
- Find what's using the port: `lsof -i :3002`
- Kill it: `kill $(lsof -t -i :3002)`
- Or just ask Claude Code: *"kill whatever is running on port 3002"*

**Plugin disappears after restarting Figma**
- Re-run it from **Plugins → Development → Claude-Figma Bridge** (the import persists, you just need to launch it each session)

**REST API tools return "FIGMA_API_TOKEN environment variable is not set"**
- Make sure you've added the `env` block to your `.mcp.json` (see step 3)
- If you added the server globally, re-add it with the `-e` flags

**REST API tools return "FIGMA_TEAM_ID environment variable is not set"**
- Add `FIGMA_TEAM_ID` to the `env` block in `.mcp.json`, or pass the `team_id` argument directly to the tool
