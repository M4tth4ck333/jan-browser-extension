/**
 * Shared Zod schemas for browser automation tools
 * Used by both mcp-server and mcp-web-client
 */
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolSchema } from '../types/index.js';

// Common schemas
const TargetSchema = z
  .string()
  .min(1)
  .describe(
    'Element target: snapshot ref such as "s1e1" for main frame or "s1f2e5" for iframe elements (coordinates are also accepted).'
  );

// Tool Zod schemas
export const ClickSchema = z.object({
  target: TargetSchema,
});

export const TypeSchema = z
  .object({
    target: TargetSchema,
    text: z
      .string()
      .optional()
      .describe(
        'Text to type. Embed key presses with <kbd>…</kbd> (e.g., "Hello <kbd>Enter</kbd>" or "<kbd>Ctrl+S</kbd>").'
      ),
    clear: z
      .boolean()
      .optional()
      .describe('Whether to clear the existing value before typing. Default: true'),
    submit: z
      .boolean()
      .optional()
      .describe('Convenience flag to press Enter after typing'),
  })
  .superRefine((value, ctx) => {
    const rawText = typeof value.text === 'string' ? value.text : '';
    const strippedText = rawText.replace(/<kbd>.*?<\/kbd>/gi, '').trim();
    const hasText = strippedText.length > 0;
    const hasKeyTokens = /<kbd>.*?<\/kbd>/i.test(rawText);

    if (!hasText && !hasKeyTokens && value.submit !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide text to type or embed key presses in <kbd>…</kbd>',
      });
    }
  });

export const DragSchema = z.object({
  start: TargetSchema.describe(
    'Drag starting point (snapshot ref such as "s1e5" for main frame or "s1f2e10" for iframe elements; coordinates accepted).'
  ),
  end: TargetSchema.describe(
    'Drop target (snapshot ref such as "s1e5" for main frame or "s1f2e10" for iframe elements; coordinates accepted).'
  ),
});

export const NavigateSchema = z.object({
  target: z
    .string()
    .describe(
      'Where to go: full URL, bare domain (we add https://), or "back"/"forward" for history navigation'
    ),
});

export const ScrollSchema = z.object({
  direction: z
    .enum(['up', 'down', 'top', 'bottom'])
    .describe('Scroll direction/position for the current page or element'),
  amount: z
    .number()
    .optional()
    .describe('Pixels to scroll for up/down (default 500). Ignored for top/bottom.'),
  target: z
    .string()
    .optional()
    .describe(
      "Optional snapshot ref (e.g., 's1e5' for main frame or 's1f2e10' for iframe elements) to scroll a specific element instead of the page"
    ),
});

export const SnapshotSchema = z.object({
  fullPage: z
    .boolean()
    .optional()
    .describe(
      'Capture full page (true) or only viewport-visible content (false). Default: true'
    ),
  detail: z
    .enum(['shallow', 'medium', 'deep'])
    .optional()
    .describe('Snapshot detail level (depth/limits). Default: deep'),
});

export const ScreenshotSchema = z.object({
  includeRefs: z
    .boolean()
    .optional()
    .describe(
      'Whether to show snapshot refs inline before capturing the screenshot. Default: false'
    ),
  detail: z
    .enum(['shallow', 'medium', 'deep'])
    .optional()
    .describe('Snapshot detail for ref overlay depth/limits. Default: deep'),
});

// Tool definitions with schemas
export const TOOL_DEFINITIONS = {
  browser_click: {
    name: 'browser_click',
    description:
      "Click an element by snapshot ref (e.g., 's1e5' for main frame or 's1f2e10' for iframe elements).",
    schema: ClickSchema,
  },
  browser_type: {
    name: 'browser_type',
    description:
      "Focus an element by snapshot ref (e.g., 's1e5' for main frame or 's1f2e10' for iframe elements), type text, and press keys in <kbd>…</kbd>. submit=true appends Enter.",
    schema: TypeSchema,
  },
  browser_drag: {
    name: 'browser_drag',
    description: 'Drag from start to end targets identified by snapshot refs.',
    schema: DragSchema,
  },
  browser_navigate: {
    name: 'browser_navigate',
    description:
      'Navigate the active tab: open a URL or move browser history. Pass "target" as a URL/domain (https added if missing) or "back"/"forward".',
    schema: NavigateSchema,
  },
  browser_scroll: {
    name: 'browser_scroll',
    description:
      'Scroll the current page or a referenced element; directions: up/down/top/bottom. amount controls pixel distance for up/down.',
    schema: ScrollSchema,
  },
  browser_snapshot: {
    name: 'browser_snapshot',
    description:
      'Capture an accessibility snapshot of the current tab. Use fullPage=false for viewport-only.',
    schema: SnapshotSchema,
  },
  browser_screenshot: {
    name: 'browser_screenshot',
    description:
      'Screenshot the current tab; optionally overlay snapshot refs when includeRefs=true.',
    schema: ScreenshotSchema,
  },
} as const;

/**
 * Get tool schema with JSON Schema inputSchema
 */
export function getToolSchema(
  name: keyof typeof TOOL_DEFINITIONS
): ToolSchema {
  const def = TOOL_DEFINITIONS[name];
  return {
    name: def.name,
    description: def.description,
    inputSchema: zodToJsonSchema(def.schema) as Record<string, unknown>,
  };
}

/**
 * Get all exposed tool schemas (excludes disabled tools like browser_drag)
 */
export function getToolSchemas(): ToolSchema[] {
  return [
    getToolSchema('browser_click'),
    getToolSchema('browser_type'),
    getToolSchema('browser_navigate'),
    getToolSchema('browser_scroll'),
    getToolSchema('browser_snapshot'),
    getToolSchema('browser_screenshot'),
  ];
}

/**
 * Get all tool schemas including disabled ones
 */
export function getAllToolSchemas(): ToolSchema[] {
  return Object.keys(TOOL_DEFINITIONS).map((name) =>
    getToolSchema(name as keyof typeof TOOL_DEFINITIONS)
  );
}

// Pre-computed for convenience (lazy evaluation)
let _toolSchemas: ToolSchema[] | null = null;
export function TOOL_SCHEMAS(): ToolSchema[] {
  if (!_toolSchemas) {
    _toolSchemas = getToolSchemas();
  }
  return _toolSchemas;
}
