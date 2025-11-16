/**
 * Tools for interacting with web pages: click, type, hover, drag, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection } from "../utils/bridge.js";
import type { Tool } from "./tool.js";

const ElementSchema = z.object({
  ref: z.string().describe("Exact target element reference from the browser snapshot"),
});

const ClickSchema = ElementSchema;

const RefSchema = ElementSchema;

export const browserClick: Tool = {
  schema: {
    name: "browser_click",
    description: "Perform click on a web page",
    inputSchema: zodToJsonSchema(ClickSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_click", params);
  },
};

export const browserRef: Tool = {
  schema: {
    name: "browser_ref",
    description: "Resolve an element reference from a snapshot and return its details",
    inputSchema: zodToJsonSchema(RefSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_ref", params);
  },
};

const TypeSchema = ElementSchema.extend({
  text: z.string().describe("Text to type into the element"),
  submit: z.boolean().optional().describe("Whether to submit entered text (press Enter after)"),
});

export const browserType: Tool = {
  schema: {
    name: "browser_type",
    description: "Type text into editable element",
    inputSchema: zodToJsonSchema(TypeSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_type", { ...params, pressEnter: params.submit === true });
  },
};

const HoverSchema = ElementSchema;

export const browserHover: Tool = {
  schema: {
    name: "browser_hover",
    description: "Hover over element on page",
    inputSchema: zodToJsonSchema(HoverSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_hover", params);
  },
};

const SelectOptionSchema = ElementSchema.extend({
  values: z.array(z.string()).min(1).describe("Array of values to select in the dropdown"),
});

export const browserSelectOption: Tool = {
  schema: {
    name: "browser_select_option",
    description: "Select an option in a dropdown",
    inputSchema: zodToJsonSchema(SelectOptionSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_select_option", params);
  },
};

const FillFormFieldSchema = z.object({
  ref: z.string().describe("Element reference from browser_snapshot"),
  value: z.string().describe("Value to set (use 'true'/'false' for checkboxes)"),
});

const FillFormSchema = z.object({
  fields: z.array(FillFormFieldSchema).min(1).describe("Array of fields to fill"),
});

export const browserFillForm: Tool = {
  schema: {
    name: "browser_fill_form",
    description: "Fill multiple form fields (inputs, selects, checkboxes, radios) by selector/value.",
    inputSchema: zodToJsonSchema(FillFormSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_fill_form", params);
  },
};

const PressKeySchema = z.object({
  key: z.string().describe("Name of the key to press or character to generate (e.g., 'Enter', 'ArrowLeft', 'a')"),
});

export const browserPressKey: Tool = {
  schema: {
    name: "browser_press_key",
    description: "Press a key on the keyboard",
    inputSchema: zodToJsonSchema(PressKeySchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_press_key", params);
  },
};

const DragSchema = z.object({
  startRef: z.string().describe("Source element reference from browser_snapshot"),
  endRef: z.string().describe("Target element reference from browser_snapshot"),
});

export const browserDrag: Tool = {
  schema: {
    name: "browser_drag",
    description: "Perform drag and drop between two elements",
    inputSchema: zodToJsonSchema(DragSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return await callExtension("browser_drag", params);
  },
};
