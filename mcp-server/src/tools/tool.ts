/**
 * Tool interface definitions for MCP server
 * Following browsermcp pattern
 */

export type ToolSchema = {
  name: string;
  description: string;
  inputSchema: any; // JSON Schema object
};

export type ToolResult = {
  content: Array<{
    type: "text" | "image";
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
  _meta?: {
    urls?: string[];
    tabId?: number | null;
  };
};

export type ToolHandler = (params?: any) => Promise<ToolResult>;

export type Tool = {
  schema: ToolSchema;
  handle: ToolHandler;
};
