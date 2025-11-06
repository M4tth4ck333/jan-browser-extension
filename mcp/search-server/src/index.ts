/**
 * Jan Browser MCP Server
 * Modular architecture inspired by browsermcp
 * Provides browser automation tools via WebSocket bridge to Chrome extension
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, WebSocket } from "ws";
import { appendFileSync } from "node:fs";
import type { RawData } from "ws";

// Bridge utilities
import {
  setExtensionSocket,
  handleExtensionMessage,
  cleanupPendingCalls,
} from "./utils/bridge.js";

// Tool imports - organized by category
import * as automation from "./tools/automation.js";
import * as navigation from "./tools/navigation.js";
import * as observation from "./tools/observation.js";
import type { Tool } from "./tools/tool.js";

// Configuration
const BRIDGE_HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 17389);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || undefined;
const SERVER_VERSION = "0.12.2";

// Optional file logging
const LOG_FILE = process.env.MCP_LOG_FILE;

// Helper to log without interfering with stdio transport
function logToFile(message: string) {
  if (LOG_FILE) {
    try {
      appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
    } catch (e) {}
  }
}

// Log startup
logToFile(`jan-browser-mcp v${SERVER_VERSION} starting; bridge ws://${BRIDGE_HOST}:${BRIDGE_PORT}`);

// Create MCP server using the old API like browsermcp
const server = new Server(
  {
    name: "jan-browser-mcp",
    version: SERVER_VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Collect all tools
const allTools: Tool[] = [
  // Automation tools
  automation.click,
  automation.type,
  automation.hover,
  automation.selectOption,
  automation.fillForm,
  automation.executeScript,

  // Navigation tools
  navigation.navigate,
  navigation.goBack,
  navigation.goForward,
  navigation.scroll,
  navigation.wait,

  // Observation tools
  observation.snapshot,
  observation.screenshot,
  observation.webSearch,
  observation.bridgeStatus,
];

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: allTools.map((tool) => tool.schema) };
});

// Register tool execution handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = allTools.find((t) => t.schema.name === request.params.name);
  if (!tool) {
    return {
      content: [
        { type: "text", text: `Tool "${request.params.name}" not found` },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.handle(request.params.arguments || {});
    return result;
  } catch (error) {
    return {
      content: [{ type: "text", text: String(error) }],
      isError: true,
    };
  }
});

// WebSocket bridge setup
const wss = new WebSocketServer({ host: BRIDGE_HOST, port: BRIDGE_PORT });

wss.on("listening", () => {
  logToFile(`Bridge listening on ws://${BRIDGE_HOST}:${BRIDGE_PORT}`);
});

wss.on("connection", (ws: WebSocket, req) => {
  // Token authentication
  if (BRIDGE_TOKEN) {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    const token = url.searchParams.get("t");
    if (token !== BRIDGE_TOKEN) {
      logToFile("Bridge rejected connection: invalid token");
      ws.close(1008, "Invalid token");
      return;
    }
  }

  logToFile("Browser extension connected");
  setExtensionSocket(ws);

  ws.on("message", (data: RawData) => {
    handleExtensionMessage(data);
  });

  ws.on("close", () => {
    logToFile("Browser extension disconnected");
    setExtensionSocket(null);
    cleanupPendingCalls();
  });

  ws.on("error", (err) => {
    logToFile(`WebSocket error: ${err.message}`);
  });
});

wss.on("error", (err) => {
  logToFile(`Failed to start WebSocket server: ${err.message}`);
  process.exit(1);
});

// Main function
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logToFile("MCP server ready, exposing tools via stdio");
}

// Run
main().catch((err) => {
  logToFile(`MCP server failed to start: ${err.message}`);
  process.exit(1);
});
