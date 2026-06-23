// Figma REST API module — Phase 1 & 2
// All calls require FIGMA_API_TOKEN env variable.
const BASE = "https://api.figma.com";
function token() {
    const t = process.env.FIGMA_API_TOKEN;
    if (!t)
        throw new Error("FIGMA_API_TOKEN environment variable is not set.");
    return t;
}
async function figmaFetch(path, options) {
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
        const msg = body?.err ?? body?.message ?? res.statusText;
        throw new Error(`Figma API error ${res.status}: ${msg}`);
    }
    return body;
}
export async function getFileMetadata(fileKey) {
    return figmaFetch(`/v1/files/${fileKey}?depth=1`);
}
export async function getComments(fileKey) {
    return figmaFetch(`/v1/files/${fileKey}/comments`);
}
export async function postComment(fileKey, message, nodeId) {
    const body = { message };
    if (nodeId) {
        body.client_meta = { node_id: nodeId, node_offset: { x: 0, y: 0 } };
    }
    return figmaFetch(`/v1/files/${fileKey}/comments`, {
        method: "POST",
        body: JSON.stringify(body),
    });
}
export async function deleteComment(fileKey, commentId) {
    return figmaFetch(`/v1/files/${fileKey}/comments/${commentId}`, {
        method: "DELETE",
    });
}
export async function getVersionHistory(fileKey) {
    return figmaFetch(`/v1/files/${fileKey}/versions`);
}
// ── Phase 2 ──
export async function getVariables(fileKey) {
    return figmaFetch(`/v1/files/${fileKey}/variables/local`);
}
export async function setVariable(fileKey, variableId, modeId, value) {
    return figmaFetch(`/v1/files/${fileKey}/variables`, {
        method: "POST",
        body: JSON.stringify({
            variableModeValues: [{ variableId, modeId, value }],
        }),
    });
}
export async function getTeamComponents(teamId) {
    return figmaFetch(`/v1/teams/${teamId}/components`);
}
export async function getDevResources(fileKey, nodeIds) {
    const ids = nodeIds.join(",");
    return figmaFetch(`/v1/files/${fileKey}/dev_resources?node_ids=${encodeURIComponent(ids)}`);
}
export async function postDevResource(fileKey, nodeId, name, url) {
    return figmaFetch(`/v1/dev_resources`, {
        method: "POST",
        body: JSON.stringify({
            dev_resources: [{ name, url, file_key: fileKey, node_id: nodeId }],
        }),
    });
}
export async function getDesignContext(fileKey, nodeIds) {
    const ids = nodeIds.join(",");
    return figmaFetch(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(ids)}&geometry=paths`);
}
// ── Phase 3 ──
export async function getProjectStructure(teamId) {
    const { projects } = await figmaFetch(`/v1/teams/${teamId}/projects`);
    const withFiles = await Promise.all(projects.map(async (project) => ({
        ...project,
        files: (await figmaFetch(`/v1/projects/${project.id}/files`)).files,
    })));
    return { projects: withFiles };
}
export async function listWebhooks(teamId) {
    return figmaFetch(`/v2/teams/${encodeURIComponent(teamId)}/webhooks`);
}
export async function createWebhook(teamId, eventType, endpoint, passcode, description) {
    return figmaFetch(`/v2/webhooks`, {
        method: "POST",
        body: JSON.stringify({ team_id: teamId, event_type: eventType, endpoint, passcode, description }),
    });
}
export async function deleteWebhook(webhookId) {
    return figmaFetch(`/v2/webhooks/${webhookId}`, { method: "DELETE" });
}
