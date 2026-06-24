#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import crypto from "crypto";
import { execSync } from "child_process";
import {
  getFileMetadata,
  getComments,
  postComment,
  deleteComment,
  getVersionHistory,
  getVariables,
  setVariable,
  getTeamComponents,
  getDevResources,
  postDevResource,
  getDesignContext,
  getProjectStructure,
  listWebhooks,
  createWebhook,
  deleteWebhook,
} from "./figma-api.js";

// ── Configuration ──

const WS_PORT = 3002;
const REQUEST_TIMEOUT_MS = 30_000;

// ── Kill any existing process on the port ──

try {
  const output = execSync(`lsof -ti :${WS_PORT}`, { encoding: "utf-8" }).trim();
  if (output) {
    for (const pid of output.split("\n")) {
      if (pid && pid !== String(process.pid)) {
        console.error(`[figma-bridge] Killing existing process on port ${WS_PORT} (PID ${pid})`);
        process.kill(Number(pid), "SIGTERM");
      }
    }
    // Brief pause to let the port free up
    execSync("sleep 0.5");
  }
} catch {
  // No process on port — that's fine
}

// ── WebSocket bridge to Figma plugin ──

let pluginSocket: WebSocket | null = null;
const pendingRequests = new Map<
  string,
  { resolve: (value: any) => void; reject: (error: Error) => void }
>();

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  pluginSocket = ws;
  // Use stderr — stdout is reserved for MCP stdio transport
  console.error(`[figma-bridge] Plugin connected (ws://localhost:${WS_PORT})`);

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "BRIDGE_RESPONSE" && msg.id) {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          pendingRequests.delete(msg.id);
          if (msg.error) {
            pending.reject(new Error(msg.error));
          } else {
            pending.resolve(msg.result);
          }
        }
      }
    } catch (e) {
      console.error("[figma-bridge] Failed to parse message:", e);
    }
  });

  ws.on("close", () => {
    pluginSocket = null;
    console.error("[figma-bridge] Plugin disconnected");
    // Reject all pending requests
    for (const [id, pending] of pendingRequests) {
      pending.reject(new Error("Plugin disconnected"));
      pendingRequests.delete(id);
    }
  });
});

wss.on("listening", () => {
  console.error(`[figma-bridge] WebSocket server listening on ws://localhost:${WS_PORT}`);
});

/**
 * Send a request to the Figma plugin and wait for a response.
 * Uses request IDs for correlation since WebSocket is async.
 */
function sendToPlugin(action: string, params?: Record<string, any>): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!pluginSocket || pluginSocket.readyState !== WebSocket.OPEN) {
      reject(new Error("Figma plugin not connected. Open the Claude-Figma Bridge plugin in Figma."));
      return;
    }

    const id = crypto.randomUUID();
    pendingRequests.set(id, { resolve, reject });

    pluginSocket.send(JSON.stringify({ type: "BRIDGE_REQUEST", id, action, params }));

    // Timeout — don't let requests hang forever
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
      }
    }, REQUEST_TIMEOUT_MS);
  });
}

// ── MCP Server ──

const server = new McpServer({
  name: "figma-bridge",
  version: "1.0.0",
});

// Resolve file key from argument or FIGMA_FILE_KEY env var
function resolveFileKey(file_key?: string): string {
  const key = file_key ?? process.env.FIGMA_FILE_KEY;
  if (!key) throw new Error("No file_key provided and FIGMA_FILE_KEY environment variable is not set.");
  return key;
}

// Resolve team ID from argument or FIGMA_TEAM_ID env var
function resolveTeamId(team_id?: string): string {
  const id = team_id ?? process.env.FIGMA_TEAM_ID;
  if (!id) throw new Error("No team_id provided and FIGMA_TEAM_ID environment variable is not set.");
  return id;
}

// Tool: get the full scene context
server.tool(
  "get_scene",
  "Get the current Figma scene context including selected nodes, variables, text styles, and page info. Returns a JSON representation of what's currently visible/selected in Figma.",
  {},
  async () => {
    const result = await sendToPlugin("get_scene");
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: get current selection summary
server.tool(
  "get_selection",
  "Get a summary of the currently selected nodes in Figma (IDs, names, types).",
  {},
  async () => {
    const result = await sendToPlugin("get_selection");
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  }
);

// Tool: execute Figma Plugin API code
server.tool(
  "execute_code",
  `Execute Figma Plugin API code in the plugin sandbox. The code runs inside an async IIFE and has full access to the Figma Plugin API.

IMPORTANT rules for the code:
- All Figma API calls MUST be async (e.g. figma.getNodeByIdAsync(), not figma.getNodeById())
- Load fonts before any text operation: await figma.loadFontAsync({ family, style })
- Colors are 0-1 floats, not 0-255
- Fills/strokes use {r,g,b} + opacity on paint; effects use {r,g,b,a}
- layoutSizingHorizontal/Vertical require layoutMode to be set first
- Always null-check results from getNodeByIdAsync(), findOne(), etc.`,
  {
    code: z.string().describe("Figma Plugin API code to execute"),
  },
  async ({ code }) => {
    const result = await sendToPlugin("execute_code", { code });
    if (result.success) {
      return {
        content: [{ type: "text", text: "Code executed successfully." }],
      };
    } else {
      return {
        content: [{ type: "text", text: `Execution error: ${result.error}` }],
        isError: true,
      };
    }
  }
);

// Tool: export a node as PNG
server.tool(
  "export_image",
  "Export a Figma node as a PNG image. If no nodeId is provided, exports the first selected node.",
  {
    nodeId: z.string().optional().describe("The Figma node ID to export. Omit to use current selection."),
  },
  async ({ nodeId }) => {
    const result = await sendToPlugin("export_image", { nodeId });
    if (result.base64) {
      return {
        content: [
          {
            type: "image",
            data: result.base64,
            mimeType: "image/png",
          },
        ],
      };
    }
    return {
      content: [{ type: "text", text: result.error || "No image could be exported" }],
      isError: true,
    };
  }
);

// Tool: check connection status
server.tool(
  "connection_status",
  "Check if the Figma plugin is connected to the bridge.",
  {},
  async () => {
    const connected = pluginSocket !== null && pluginSocket.readyState === WebSocket.OPEN;
    return {
      content: [
        {
          type: "text",
          text: connected
            ? "Figma plugin is connected and ready."
            : "Figma plugin is NOT connected. Please open the Claude-Figma Bridge plugin in Figma.",
        },
      ],
    };
  }
);

// ── Phase 1: Figma REST API tools ──

const FILE_KEY_DESC = "The Figma file key. Omit to use the FIGMA_FILE_KEY environment variable.";

// Tool: get file metadata
server.tool(
  "get_file_metadata",
  "Get metadata for a Figma file (name, last modified, thumbnail URL, version, etc.) using the Figma REST API. Requires FIGMA_API_TOKEN.",
  {
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key }) => {
    const result = await getFileMetadata(resolveFileKey(file_key));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: get comments on a file
server.tool(
  "get_comments",
  "Get all comments on a Figma file. Requires FIGMA_API_TOKEN.",
  {
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key }) => {
    const result = await getComments(resolveFileKey(file_key));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: post a comment on a file
server.tool(
  "post_comment",
  "Post a comment on a Figma file. Optionally pin it to a specific node. Requires FIGMA_API_TOKEN.",
  {
    message: z.string().describe("The comment text"),
    node_id: z.string().optional().describe("Optional node ID to attach the comment to"),
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key, message, node_id }) => {
    const result = await postComment(resolveFileKey(file_key), message, node_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: delete a comment
server.tool(
  "delete_comment",
  "Delete a comment from a Figma file. Requires FIGMA_API_TOKEN.",
  {
    comment_id: z.string().describe("The comment ID to delete"),
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key, comment_id }) => {
    const result = await deleteComment(resolveFileKey(file_key), comment_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: get version history
server.tool(
  "get_version_history",
  "Get the version history of a Figma file. Requires FIGMA_API_TOKEN.",
  {
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key }) => {
    const result = await getVersionHistory(resolveFileKey(file_key));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Phase 2: Variables, components, dev resources ──

// Tool: get local variables
server.tool(
  "get_variables",
  "Get all local variables defined in a Figma file (design tokens, etc.). Requires FIGMA_API_TOKEN.",
  {
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key }) => {
    const result = await getVariables(resolveFileKey(file_key));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: set a variable value
server.tool(
  "set_variable",
  "Update the value of a Figma variable for a specific mode. Use get_variables first to find variable IDs and mode IDs. Requires FIGMA_API_TOKEN.",
  {
    variable_id: z.string().describe("The variable ID (from get_variables)"),
    mode_id: z.string().describe("The mode ID to update (from get_variables)"),
    value: z.union([z.string(), z.number(), z.boolean(), z.record(z.unknown())]).describe("The new value for the variable"),
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key, variable_id, mode_id, value }) => {
    const result = await setVariable(resolveFileKey(file_key), variable_id, mode_id, value);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: get team components
server.tool(
  "get_team_components",
  "List all published components in a Figma team library. Requires FIGMA_API_TOKEN.",
  {
    team_id: z.string().optional().describe("Figma team ID. Defaults to FIGMA_TEAM_ID env variable."),
  },
  async ({ team_id }) => {
    const result = await getTeamComponents(resolveTeamId(team_id));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: get dev resources
server.tool(
  "get_dev_resources",
  "Get dev resources (external links, documentation) attached to specific nodes in a Figma file. Requires FIGMA_API_TOKEN.",
  {
    node_ids: z.array(z.string()).describe("List of node IDs to fetch dev resources for"),
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key, node_ids }) => {
    const result = await getDevResources(resolveFileKey(file_key), node_ids);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: post a dev resource
server.tool(
  "post_dev_resource",
  "Attach a dev resource (external link) to a node in a Figma file. Requires FIGMA_API_TOKEN.",
  {
    node_id: z.string().describe("The node ID to attach the resource to"),
    name: z.string().describe("Display name for the resource"),
    url: z.string().describe("URL of the resource"),
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key, node_id, name, url }) => {
    const result = await postDevResource(resolveFileKey(file_key), node_id, name, url);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: get design context for specific nodes
server.tool(
  "get_design_context",
  "Get full design context (properties, styles, geometry) for specific nodes in a Figma file. Useful for inspecting components or extracting design tokens. Requires FIGMA_API_TOKEN.",
  {
    node_ids: z.array(z.string()).describe("List of node IDs to fetch design context for"),
    file_key: z.string().optional().describe(FILE_KEY_DESC),
  },
  async ({ file_key, node_ids }) => {
    const result = await getDesignContext(resolveFileKey(file_key), node_ids);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Phase 3: Project structure and webhooks ──

const WEBHOOK_EVENT_TYPES = [
  "FILE_UPDATE",
  "FILE_VERSION_UPDATE",
  "FILE_DELETE",
  "LIBRARY_PUBLISH",
  "FILE_COMMENT",
] as const;

// Tool: get project structure
server.tool(
  "get_project_structure",
  "Get all projects and their files for a Figma team. Requires FIGMA_API_TOKEN.",
  {
    team_id: z.string().optional().describe("Figma team ID. Defaults to FIGMA_TEAM_ID env variable."),
  },
  async ({ team_id }) => {
    const result = await getProjectStructure(resolveTeamId(team_id));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: list webhooks
server.tool(
  "list_webhooks",
  "List all webhooks for a Figma team. Requires FIGMA_API_TOKEN.",
  {
    team_id: z.string().optional().describe("Figma team ID. Defaults to FIGMA_TEAM_ID env variable."),
  },
  async ({ team_id }) => {
    const result = await listWebhooks(resolveTeamId(team_id));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: create webhook
server.tool(
  "create_webhook",
  `Create a webhook for a Figma team. Requires FIGMA_API_TOKEN.
Valid event_type values: ${WEBHOOK_EVENT_TYPES.join(", ")}.`,
  {
    endpoint: z.string().describe("The HTTPS URL that will receive webhook POST requests"),
    event_type: z.enum(WEBHOOK_EVENT_TYPES).describe("The event type to subscribe to"),
    passcode: z.string().describe("A passcode included in every webhook payload for verification"),
    description: z.string().optional().describe("Optional description for the webhook"),
    team_id: z.string().optional().describe("Figma team ID. Defaults to FIGMA_TEAM_ID env variable."),
  },
  async ({ endpoint, event_type, passcode, description, team_id }) => {
    const result = await createWebhook(resolveTeamId(team_id), event_type, endpoint, passcode, description);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// Tool: delete webhook
server.tool(
  "delete_webhook",
  "Delete a Figma webhook by ID. Use list_webhooks to find webhook IDs. Requires FIGMA_API_TOKEN.",
  {
    webhook_id: z.string().describe("The webhook ID to delete"),
  },
  async ({ webhook_id }) => {
    const result = await deleteWebhook(webhook_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Start ──

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[figma-bridge] MCP server started (stdio transport)");
}

main().catch((e) => {
  console.error("[figma-bridge] Fatal error:", e);
  process.exit(1);
});
