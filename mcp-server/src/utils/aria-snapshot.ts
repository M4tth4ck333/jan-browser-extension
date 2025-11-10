/**
 * Captures accessibility tree information for LLM understanding
 */
import { callExtension, setActiveTabId } from "./bridge.js";
import type { ToolResult } from "../tools/tool.js";

export async function captureAriaSnapshot(targetUrl?: string): Promise<ToolResult> {
  try {
    const response = await callExtension("snapshot", targetUrl ? { url: targetUrl } : {});
    const snapshot = response?.data;

    if (!snapshot) {
      console.error("[aria-snapshot] No data returned from extension", { response });
      return {
        content: [
          {
            type: "text",
            text: "Failed to capture snapshot: No data returned from extension",
          },
        ],
        isError: true,
      };
    }

    if (!snapshot.url && !snapshot.title) {
      console.error("[aria-snapshot] Snapshot data missing required fields", { snapshot });
      return {
        content: [
          {
            type: "text",
            text: "Failed to capture snapshot: Snapshot data is incomplete (missing url and title)",
          },
        ],
        isError: true,
      };
    }

    if (typeof snapshot.tabId === "number") {
      setActiveTabId(snapshot.tabId);
    }

    const pageUrl = snapshot.url || targetUrl || "unknown";
    const pageTitle = snapshot.title || "Untitled";
    const yaml = formatSnapshotAsYAML(snapshot);
    const text = `- Page URL: ${pageUrl}
- Page Title: ${pageTitle}
- Page Snapshot
\`\`\`yaml
${yaml}
\`\`\`
`;

    const meta: Record<string, unknown> = {};
    if (pageUrl && pageUrl !== "unknown") {
      meta.urls = [pageUrl];
    }
    if (typeof snapshot.tabId === "number") {
      meta.tabId = snapshot.tabId;
    }

    return {
      content: [
        {
          type: "text",
          text,
        },
      ],
      _meta: Object.keys(meta).length ? (meta as { urls?: string[]; tabId?: number }) : undefined,
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to capture snapshot: ${err?.message || err}`,
        },
      ],
      isError: true,
    };
  }
}

/**
 * Format snapshot data as YAML-like structure for better LLM readability
 */
function formatSnapshotAsYAML(data: any): string {
  if (!data) {
    return "error: No snapshot data available";
  }

  const tree = data.aria?.tree;
  if (tree) {
    return renderTree(tree).join("\n");
  }

  // Fallback to minimal metadata when tree is unavailable
  const fallback: string[] = [];
  fallback.push(`url: ${data.url || "unknown"}`);
  fallback.push(`title: ${data.title || "Untitled"}`);
  if (data.description) fallback.push(`description: ${data.description}`);
  return fallback.join("\n");
}

function renderTree(node: any, depth = 0): string[] {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);
  const parts: string[] = [];
  const role = (node?.role || node?.tag || "node").toString();
  parts.push(role);

  if (node?.name) {
    parts.push(`"${String(node.name)}"`);
  }

  const stateFlags: string[] = [];
  const state = node?.state || {};
  if (state.expanded) stateFlags.push("[expanded]");
  if (state.selected) stateFlags.push("[selected]");
  if (state.checked) stateFlags.push("[checked]");
  if (state.focused) stateFlags.push("[focused]");
  if (state.disabled) stateFlags.push("[disabled]");

  const ref = node?.ref || node?.id || node?.backendNodeId || node?.domNodeId;

  const headerParts = [...parts, ...stateFlags];
  if (ref) {
    headerParts.push(`[ref=${ref}]`);
  }

  const children: any[] = Array.isArray(node?.children) ? node.children : [];
  const detailLines = buildDetailLines(node, depth + 1);
  const needsColon = children.length > 0 || detailLines.length > 0;

  const header = `${indent}- ${headerParts.join(" ")}`.replace(/\s+/g, " ").trim() + (needsColon ? ":" : "");
  lines.push(header);
  lines.push(...detailLines);

  for (const child of children) {
    lines.push(...renderTree(child, depth + 1));
  }

  return lines;
}

function buildDetailLines(node: any, depth: number): string[] {
  const lines: string[] = [];
  const indent = "  ".repeat(depth);

  const url = node?.properties?.url || node?.href;
  if (url) {
    lines.push(`${indent}- /url: ${url}`);
  }

  const textValue = node?.value || node?.text || node?.description;
  if (textValue) {
    lines.push(`${indent}- text: ${String(textValue).slice(0, 400)}`);
  }

  return lines;
}
