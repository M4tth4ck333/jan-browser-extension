/**
 * WebSocket bridge utilities for communicating with the browser extension
 */
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { appendFileSync } from "fs";

const LOG_FILE = process.env.MCP_LOG_FILE;
const MAX_BRIDGE_RETRIES = 10;
const BRIDGE_RETRY_DELAY_MS = 100;

function logToFile(message: string) {
  if (LOG_FILE) {
    try {
      appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
    } catch (e) {}
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? `\n${error.stack}` : "";
    return `${error.name}: ${error.message}${stack}`;
  }
  if (typeof error === "string") {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch (e) {
    return String(error);
  }
}

function logError(message: string, error?: unknown) {
  if (error !== undefined) {
    logToFile(`ERROR: ${message}\n${formatError(error)}`);
  } else {
    logToFile(`ERROR: ${message}`);
  }
}

let extSocket: WebSocket | null = null;
const pendingCalls = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
let activeTabId: number | null = null;

export function setActiveTabId(tabId: number | null) {
  activeTabId = tabId;
  logToFile(`Active tab set to: ${tabId}`);
}

export function getActiveTabId(): number | null {
  return activeTabId;
}

export function hasActiveTab(): boolean {
  return activeTabId !== null;
}

export function setExtensionSocket(socket: WebSocket | null) {
  extSocket = socket;
}

export function getExtensionSocket(): WebSocket | null {
  return extSocket;
}

export function hasExtensionConnection(): boolean {
  return extSocket !== null && extSocket.readyState === WebSocket.OPEN;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(typeof error === "string" ? error : String(error));
}

function isRetriableBridgeError(error: Error): boolean {
  const message = error.message || "";
  return (
    message.includes("not connected") ||
    message.includes("disconnected") ||
    message.includes("WebSocket is not open") ||
    message.includes("closed")
  );
}

/**
 * Wait for the browser extension to connect to the bridge
 */
export async function waitForBridgeConnection(timeoutMs: number = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (hasExtensionConnection()) {
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - startTime > timeoutMs) {
        clearInterval(checkInterval);
        reject(new Error("Browser extension not connected to bridge"));
      }
    }, 100);
  });
}

/**
 * Call a tool on the browser extension via WebSocket bridge
 */
export async function callExtension(tool: string, params: any): Promise<any> {
  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < MAX_BRIDGE_RETRIES) {
    if (!hasExtensionConnection()) {
      attempts++;
      lastError = new Error("Browser extension not connected to bridge");
      await delay(BRIDGE_RETRY_DELAY_MS);
      continue;
    }

    try {
      return await sendToolCall(tool, params);
    } catch (error) {
      const normalized = normalizeError(error);
      lastError = normalized;
      if (!isRetriableBridgeError(normalized)) {
        logError(
          `Bridge call failed without retry for tool "${tool}"`,
          normalized,
        );
        throw normalized;
      }

      attempts++;
      await delay(BRIDGE_RETRY_DELAY_MS);
    }
  }

  const finalError =
    lastError || new Error("Browser extension not connected to bridge");
  logError(
    `Failed to call extension tool "${tool}" after ${attempts} attempts`,
    finalError,
  );
  throw finalError;
}

function sendToolCall(tool: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    if (!hasExtensionConnection()) {
      reject(new Error("Browser extension not connected to bridge"));
      return;
    }

    const callId = uuidv4();
    const timeoutMs = tool === "screenshot" ? 10000 : 30000;
    const timeout = setTimeout(() => {
      pendingCalls.delete(callId);
      const msg = `Tool call timeout after ${timeoutMs}ms: ${tool}`;
      logToFile(msg);
      reject(new Error(msg));
    }, timeoutMs);

    pendingCalls.set(callId, {
      resolve: (val) => {
        clearTimeout(timeout);
        logToFile(`Tool call resolved: ${tool} (${callId})`);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeout);
        logToFile(`Tool call rejected: ${tool} (${callId}) - ${err}`);
        reject(err);
      },
    });

    const message = {
      kind: "call",
      id: callId,
      tool: tool,
      params: params,
    };

    logToFile(`Sending to extension: ${tool} (${callId})`);

    try {
      extSocket!.send(JSON.stringify(message));
    } catch (error) {
      pendingCalls.delete(callId);
      const normalized = normalizeError(error);
      logError("Failed to send message to extension", normalized);
      reject(normalized);
    }
  });
}

/**
 * Handle incoming message from browser extension
 * Extension sends: {id, kind: "result", ok, data?, error?}
 */
export function handleExtensionMessage(data: any) {
  try {
    let msg: any;
    if (data && data.type === "Buffer" && Array.isArray(data.data)) {
      const buffer = Buffer.from(data.data);
      msg = JSON.parse(buffer.toString());
    } else if (typeof data === "string") {
      msg = JSON.parse(data);
    } else if (Buffer.isBuffer(data)) {
      msg = JSON.parse(data.toString());
    } else {
      msg = data;
    }
    logToFile(`Received from extension: ${JSON.stringify(msg)}`);

    if (msg.id && pendingCalls.has(msg.id)) {
      const { resolve, reject } = pendingCalls.get(msg.id)!;
      pendingCalls.delete(msg.id);

      if (msg.kind === "result") {
        if (msg.ok) {
          logToFile(`Extension call succeeded: ${msg.id}`);
          resolve(msg);
        } else {
          logError("Extension call returned failure", msg.error);
          reject(new Error(msg.error || "Extension call failed"));
        }
      } else {
        if (msg.error) {
          reject(new Error(msg.error.message || String(msg.error)));
        } else {
          resolve(msg.result || msg);
        }
      }
    }
  } catch (err) {
    logError("Error handling extension message", err);
  }
}

/**
 * Clean up pending calls when extension disconnects
 */
export function cleanupPendingCalls() {
  for (const [id, { reject }] of pendingCalls.entries()) {
    reject(new Error("Browser extension disconnected"));
  }
  pendingCalls.clear();
}
