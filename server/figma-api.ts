// Figma REST API module — Phase 1 & 2
// All calls require FIGMA_API_TOKEN env variable.

const BASE = "https://api.figma.com";

function token(): string {
  const t = process.env.FIGMA_API_TOKEN;
  if (!t) throw new Error("FIGMA_API_TOKEN environment variable is not set.");
  return t;
}

async function figmaFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "X-Figma-Token": token(),
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = (body as any)?.err ?? (body as any)?.message ?? res.statusText;
    throw new Error(`Figma API error ${res.status}: ${msg}`);
  }
  return body;
}

export async function getFileMetadata(fileKey: string): Promise<any> {
  return figmaFetch(`/v1/files/${fileKey}?depth=1`);
}

export async function getComments(fileKey: string): Promise<any> {
  return figmaFetch(`/v1/files/${fileKey}/comments`);
}

export async function postComment(
  fileKey: string,
  message: string,
  nodeId?: string
): Promise<any> {
  const body: Record<string, any> = { message };
  if (nodeId) {
    body.client_meta = { node_id: nodeId, node_offset: { x: 0, y: 0 } };
  }
  return figmaFetch(`/v1/files/${fileKey}/comments`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function deleteComment(
  fileKey: string,
  commentId: string
): Promise<any> {
  return figmaFetch(`/v1/files/${fileKey}/comments/${commentId}`, {
    method: "DELETE",
  });
}

export async function getVersionHistory(fileKey: string): Promise<any> {
  return figmaFetch(`/v1/files/${fileKey}/versions`);
}

// ── Phase 2 ──

export async function getVariables(fileKey: string): Promise<any> {
  return figmaFetch(`/v1/files/${fileKey}/variables/local`);
}

export async function setVariable(
  fileKey: string,
  variableId: string,
  modeId: string,
  value: unknown
): Promise<any> {
  return figmaFetch(`/v1/files/${fileKey}/variables`, {
    method: "POST",
    body: JSON.stringify({
      variableModeValues: [{ variableId, modeId, value }],
    }),
  });
}

export async function getTeamComponents(teamId: string): Promise<any> {
  return figmaFetch(`/v1/teams/${teamId}/components`);
}

export async function getDevResources(fileKey: string, nodeIds: string[]): Promise<any> {
  const ids = nodeIds.join(",");
  return figmaFetch(`/v1/files/${fileKey}/dev_resources?node_ids=${encodeURIComponent(ids)}`);
}

export async function postDevResource(
  fileKey: string,
  nodeId: string,
  name: string,
  url: string
): Promise<any> {
  return figmaFetch(`/v1/dev_resources`, {
    method: "POST",
    body: JSON.stringify({
      dev_resources: [{ name, url, file_key: fileKey, node_id: nodeId }],
    }),
  });
}

export async function getDesignContext(fileKey: string, nodeIds: string[]): Promise<any> {
  const ids = nodeIds.join(",");
  return figmaFetch(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}&geometry=paths`);
}

// ── Phase 3 ──

export async function getProjectStructure(teamId: string): Promise<any> {
  const { projects } = await figmaFetch(`/v1/teams/${teamId}/projects`);
  const withFiles = await Promise.all(
    (projects as any[]).map(async (project: any) => ({
      ...project,
      files: (await figmaFetch(`/v1/projects/${project.id}/files`)).files,
    }))
  );
  return { projects: withFiles };
}

export async function listWebhooks(teamId: string): Promise<any> {
  return figmaFetch(`/v2/teams/${encodeURIComponent(teamId)}/webhooks`);
}

export async function createWebhook(
  teamId: string,
  eventType: string,
  endpoint: string,
  passcode: string,
  description?: string
): Promise<any> {
  return figmaFetch(`/v2/webhooks`, {
    method: "POST",
    body: JSON.stringify({ team_id: teamId, event_type: eventType, endpoint, passcode, description }),
  });
}

export async function deleteWebhook(webhookId: string): Promise<any> {
  return figmaFetch(`/v2/webhooks/${webhookId}`, { method: "DELETE" });
}
