/**
 * Captures accessibility tree information for LLM understanding
 */
import { callExtension } from "./bridge.js";
import type { ToolResult } from "../tools/tool.js";

export async function captureAriaSnapshot(url?: string, status: string = ""): Promise<ToolResult> {
  try {
    const data = await callExtension("snapshot", url ? { url } : {});

    const snapshot = formatSnapshotAsYAML(data.data);

    return {
      content: [
        {
          type: "text",
          text: `${status ? `${status}\n` : ""}
- Page URL: ${data.data.url}
- Page Title: ${data.data.title}
- Page Snapshot (ARIA Tree + Metadata)
\`\`\`yaml
${snapshot}
\`\`\`
`,
        },
      ],
      _meta: { urls: [data.data.url] },
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: "text",
          text: `Failed to capture snapshot: ${err.message || err}`,
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
  const lines: string[] = [];

  lines.push(`url: ${data.url}`);
  lines.push(`title: ${data.title}`);

  if (data.description) {
    lines.push(`description: ${data.description}`);
  }

  lines.push(`viewport:`);
  lines.push(`  width: ${data.viewport?.width || 0}`);
  lines.push(`  height: ${data.viewport?.height || 0}`);

  // ARIA Landmarks
  if (data.aria?.landmarks?.length > 0) {
    lines.push(`landmarks:`);
    for (const landmark of data.aria.landmarks.slice(0, 10)) {
      lines.push(`  - role: ${landmark.role}`);
      if (landmark.ariaLabel) lines.push(`    label: "${landmark.ariaLabel}"`);
      if (landmark.id) lines.push(`    id: ${landmark.id}`);
    }
  }

  // Interactive Elements (most important for automation)
  if (data.aria?.interactive?.length > 0) {
    lines.push(`interactive:`);
    for (const el of data.aria.interactive.slice(0, 20)) {
      lines.push(`  - [${el.index}] ${el.role}`);
      if (el.label) lines.push(`    label: "${el.label.slice(0, 80)}"`);
      if (el.id) lines.push(`    id: ${el.id}`);
      if (el.href) lines.push(`    href: ${el.href}`);
      if (el.type) lines.push(`    type: ${el.type}`);
    }
  }

  // Headings structure
  if (data.headings?.length > 0) {
    lines.push(`headings:`);
    for (const h of data.headings.slice(0, 10)) {
      lines.push(`  - ${h.level}: "${h.text.slice(0, 100)}"`);
    }
  }

  // Forms
  if (data.forms?.length > 0) {
    lines.push(`forms:`);
    for (const form of data.forms.slice(0, 3)) {
      lines.push(`  - action: ${form.action || "(none)"}`);
      lines.push(`    method: ${form.method || "get"}`);
      if (form.fields?.length > 0) {
        lines.push(`    fields:`);
        for (const field of form.fields.slice(0, 5)) {
          lines.push(`      - ${field.type}: ${field.name || field.id || "(unnamed)"}`);
        }
      }
    }
  }

  return lines.join("\n");
}
