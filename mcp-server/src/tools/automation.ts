/**
 * Tools for interacting with web pages: click, type, hover, drag, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection } from "../utils/bridge.js";
import {
  sanitizeClickParams,
  sanitizeTypeParams,
  sanitizeInputParams,
  sanitizeDragParams,
} from "./sanitize.js";
import type { Tool } from "./tool.js";

const TargetSchema = z
  .string()
  .min(1)
  .describe('Element target: snapshot ref such as "s1e1" (coordinates are also accepted).');

const ClickSchema = z.object({
  target: TargetSchema,
});

export const browserClick: Tool = {
  schema: {
    name: "browser_click",
    description: "Click an element by snapshot ref (for example, 's1e1').",
    inputSchema: zodToJsonSchema(ClickSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_click", sanitizeClickParams(params));
  },
};

const TypeSchema = z
  .object({
    target: TargetSchema,
    text: z
      .string()
      .optional()
      .describe(
        'Text to type. Embed key presses with <kbd>…</kbd> (e.g., "Hello <kbd>Enter</kbd>" or "<kbd>Ctrl+S</kbd>").'
      ),
    clear: z.boolean().optional().describe("Whether to clear the existing value before typing. Default: true"),
    submit: z.boolean().optional().describe("Convenience flag to press Enter after typing"),
  })
  .superRefine((value, ctx) => {
    const rawText = typeof value.text === "string" ? value.text : "";
    const strippedText = rawText.replace(/<kbd>.*?<\/kbd>/gi, "").trim();
    const hasText = strippedText.length > 0;
    const hasKeyTokens = /<kbd>.*?<\/kbd>/i.test(rawText);

    if (!hasText && !hasKeyTokens && value.submit !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide text to type or embed key presses in <kbd>…</kbd>",
      });
    }
  });

export const browserType: Tool = {
  schema: {
    name: "browser_type",
    description: "Focus an element by snapshot ref (e.g., 's1e1'), type text, and press keys in <kbd>…</kbd>. submit=true appends Enter.",
    inputSchema: zodToJsonSchema(TypeSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_type", sanitizeTypeParams(params));
  },
};


const InputValueSchema = z
  .object({
    target: TargetSchema,
    value: z.union([z.string(), z.number(), z.boolean()]).optional().describe("Value to set or select for the target element"),
    values: z.array(z.string()).min(1).optional().describe("Array of values to select when the target supports multiple selections"),
  })
  .superRefine((value, ctx) => {
    if (value.value === undefined && !value.values) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a value or values to apply to the target element",
      });
    }
  });

export const browserInput: Tool = {
  schema: {
    name: "browser_input",
    description: "Set value(s) on a form control by snapshot ref (e.g., 's1e1').",
    inputSchema: zodToJsonSchema(InputValueSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_input", sanitizeInputParams(params));
  },
};

const DragSchema = z
  .object({
    start: TargetSchema.describe('Drag starting point (snapshot ref such as "s1e1"; coordinates accepted).'),
    end: TargetSchema.describe('Drop target (snapshot ref such as "s1e1"; coordinates accepted).'),
  });

export const browserDrag: Tool = {
  schema: {
    name: "browser_drag",
    description: "Drag from start to end targets identified by snapshot refs.",
    inputSchema: zodToJsonSchema(DragSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_drag", sanitizeDragParams(params));
  },
};
