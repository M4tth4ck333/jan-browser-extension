/**
 * WebSocket bridge utilities for communicating with the browser extension
 */
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { appendFileSync } from "fs";

const LOG_FILE = process.env.MCP_LOG_FILE;

function logToFile(message: string) {
  if (LOG_FILE) {
    try {
      appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${message}\n`);
    } catch (e) {}
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
  if (!hasExtensionConnection()) {
    throw new Error("Browser extension not connected to bridge");
  }

  return new Promise((resolve, reject) => {
    const callId = uuidv4();
    const timeout = setTimeout(() => {
      pendingCalls.delete(callId);
      reject(new Error(`Tool call timeout: ${tool}`));
    }, 30000);

    pendingCalls.set(callId, {
      resolve: (val) => {
        clearTimeout(timeout);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    const message = {
      kind: "call",
      id: callId,
      tool: tool,
      params: params,
    };
    logToFile(`Sending to extension: ${JSON.stringify(message)}`);
    extSocket!.send(JSON.stringify(message));
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
          logToFile(`Extension call failed: ${msg.error}`);
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
    logToFile(`Error handling extension message: ${err}`);
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
