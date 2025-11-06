/**
 * Tools for interacting with web pages: click, type, hover, drag, fill forms, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection } from "../utils/bridge.js";
import { captureAriaSnapshot } from "../utils/aria-snapshot.js";
import type { Tool } from "./tool.js";

/**
 * Click an element on the page by CSS selector
 */
const ClickSchema = z.object({
  url: z.string().describe("The URL of the page containing the element"),
  selector: z.string().describe("CSS selector for the element to click (e.g., '#submit-btn', '.nav-link', 'button[type=\"submit\"]')"),
  waitForNavigation: z.boolean().optional(),
});

export const click: Tool = {
  schema: {
    name: "click",
    description: "Click an element on the current web page using a CSS selector. Returns snapshot of the page after clicking.",
    inputSchema: zodToJsonSchema(ClickSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("click_element", params);

    // Return snapshot after clicking
    return captureAriaSnapshot(data.data.finalUrl, `Clicked "${params.selector}"`);
  },
};

/**
 * Type text into an element
 */
const TypeSchema = z.object({
  url: z.string().describe("The URL of the page containing the element"),
  selector: z.string().describe("CSS selector for the input element"),
  text: z.string().describe("Text to type into the element"),
  clear: z.boolean().optional(),
});

export const type: Tool = {
  schema: {
    name: "type",
    description: "Type text into a form field or input element. Use this for filling in text, search boxes, etc.",
    inputSchema: zodToJsonSchema(TypeSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("type_text", params);

    return captureAriaSnapshot(params.url, `Typed "${params.text}" into "${params.selector}"`);
  },
};

/**
 * Hover over an element
 */
const HoverSchema = z.object({
  url: z.string().describe("The URL of the page containing the element"),
  selector: z.string().describe("CSS selector for the element to hover over"),
});

export const hover: Tool = {
  schema: {
    name: "hover",
    description: "Hover the mouse over an element to trigger hover effects, tooltips, or dropdowns.",
    inputSchema: zodToJsonSchema(HoverSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("hover_element", params);

    return captureAriaSnapshot(params.url, `Hovered over "${params.selector}"`);
  },
};

/**
 * Select an option from a dropdown
 */
const SelectOptionSchema = z.object({
  url: z.string().describe("The URL of the page containing the select element"),
  selector: z.string().describe("CSS selector for the select element"),
  value: z.string().describe("The option value or visible text to select"),
});

export const selectOption: Tool = {
  schema: {
    name: "select_option",
    description: "Select an option from a dropdown/select element by value or visible text.",
    inputSchema: zodToJsonSchema(SelectOptionSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("select_option", params);

    return captureAriaSnapshot(params.url, `Selected option "${params.value}" in "${params.selector}"`);
  },
};

/**
 * Fill multiple form fields at once
 */
const FillFormFieldSchema = z.object({
  selector: z.string().describe("CSS selector for the form field"),
  value: z.string().describe("Value to set (use 'true'/'false' for checkboxes)"),
});

const FillFormSchema = z.object({
  url: z.string().describe("The URL of the page containing the form"),
  fields: z.array(FillFormFieldSchema).min(1).describe("Array of fields to fill"),
});

export const fillForm: Tool = {
  schema: {
    name: "fill_form",
    description: "Fill multiple form fields at once. Supports text inputs, selects, checkboxes, and radio buttons.",
    inputSchema: zodToJsonSchema(FillFormSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("fill_form", params);

    const fieldCount = data.data.successfulFields || 0;
    return captureAriaSnapshot(params.url, `Filled ${fieldCount} form fields`);
  },
};

/**
 * Execute custom JavaScript on the page
 */
const ExecuteScriptSchema = z.object({
  url: z.string().describe("The URL of the page to execute the script on"),
  script: z.string().describe("The JavaScript code to execute. Should be a function body that returns a value."),
  args: z.array(z.any()).optional().describe("Optional array of arguments to pass to the script"),
});

export const executeScript: Tool = {
  schema: {
    name: "execute_script",
    description: "Execute custom JavaScript code on a web page and return the result. Use with caution.",
    inputSchema: zodToJsonSchema(ExecuteScriptSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("execute_script", params);

    return {
      content: [
        {
          type: "text",
          text: `Script executed successfully. Result:\n\`\`\`json\n${JSON.stringify(data.data.result, null, 2)}\n\`\`\``,
        },
      ],
      _meta: { urls: [params.url] },
    };
  },
};
