/**
 * WebSocket bridge utilities for communicating with the browser extension
 */
import { WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { appendFileSync } from "fs";

const LOG_FILE = process.env.MCP_LOG_FILE;
const MAX_BRIDGE_RETRIES = 10;

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

const pendingCalls = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void }>();
let activeTabId: number | null = null;

interface ProfileConnection {
  id: string;
  label: string;
  socket: WebSocket;
  ready: boolean;
  lastPongTime: number;
  pingInterval: NodeJS.Timeout | null;
  pongTimeout: NodeJS.Timeout | null;
}

const connections = new Map<string, ProfileConnection>();
let activeProfileId: string | null = null;
let shuttingDown = false;

// Ping/Pong heartbeat configuration
const PING_INTERVAL_MS = 15000; // Send ping every 15 seconds
const PONG_TIMEOUT_MS = 5000; // Expect pong within 5 seconds

// Exponential backoff retry configuration
const INITIAL_RETRY_DELAY_MS = 1000; // Start with 1s delay
const MAX_RETRY_DELAY_MS = 10000; // Cap at 10s delay

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

function stopHeartbeat(connection: ProfileConnection) {
  if (connection.pingInterval) {
    clearInterval(connection.pingInterval);
    connection.pingInterval = null;
  }
  if (connection.pongTimeout) {
    clearTimeout(connection.pongTimeout);
    connection.pongTimeout = null;
  }
  logToFile(`Heartbeat: Stopped for profile ${connection.id}`);
}

function closeConnection(connection: ProfileConnection, code = 1001, reason = "Shutting down") {
  stopHeartbeat(connection);
  try {
    if (
      connection.socket.readyState === WebSocket.OPEN ||
      connection.socket.readyState === WebSocket.CONNECTING
    ) {
      connection.socket.close(code, reason);
    }
  } catch (error) {
    logError(`Error closing socket for profile ${connection.id}`, error);
  }
}

function startHeartbeat(profileId: string) {
  const connection = connections.get(profileId);
  if (!connection) return;

  stopHeartbeat(connection);
  connection.lastPongTime = Date.now();

  connection.pingInterval = setInterval(() => {
    if (!connections.has(profileId)) {
      stopHeartbeat(connection);
      return;
    }

    if (connection.socket.readyState !== WebSocket.OPEN) {
      logToFile(`Heartbeat: Socket not open for profile ${profileId}, stopping`);
      stopHeartbeat(connection);
      return;
    }

    const timeSinceLastPong = Date.now() - connection.lastPongTime;
    if (timeSinceLastPong > PING_INTERVAL_MS + PONG_TIMEOUT_MS) {
      logToFile(
        `Heartbeat: No pong received for ${timeSinceLastPong}ms on profile ${profileId}, connection may be stale`,
      );
      try {
        connection.socket.close();
      } catch (e) {
        logToFile(`Heartbeat: Error closing stale socket for profile ${profileId}: ${e}`);
      }
      stopHeartbeat(connection);
      return;
    }

    try {
      logToFile(`Heartbeat: Sending ping to profile ${profileId}`);
      connection.socket.send(JSON.stringify({ kind: "ping" }));

      if (connection.pongTimeout) clearTimeout(connection.pongTimeout);
      connection.pongTimeout = setTimeout(() => {
        logToFile(`Heartbeat: Pong timeout for profile ${profileId}, connection may be unhealthy`);
      }, PONG_TIMEOUT_MS);
    } catch (e) {
      logToFile(`Heartbeat: Error sending ping to profile ${profileId}: ${e}`);
      stopHeartbeat(connection);
    }
  }, PING_INTERVAL_MS);

  logToFile(`Heartbeat: Started for profile ${profileId}`);
}

function handlePong(profileId: string) {
  const connection = connections.get(profileId);
  if (!connection) return;

  connection.lastPongTime = Date.now();
  if (connection.pongTimeout) {
    clearTimeout(connection.pongTimeout);
    connection.pongTimeout = null;
  }
  logToFile(`Heartbeat: Received pong from profile ${profileId}`);
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

function getActiveConnection(): ProfileConnection | null {
  if (activeProfileId) {
    const connection = connections.get(activeProfileId);
    if (connection && connection.ready && connection.socket.readyState === WebSocket.OPEN) {
      return connection;
    }
  }

  for (const connection of connections.values()) {
    if (connection.ready && connection.socket.readyState === WebSocket.OPEN) {
      activeProfileId = connection.id;
      return connection;
    }
  }

  return null;
}

export function getProfileState() {
  return {
    activeProfileId,
    profileCount: connections.size,
    profiles: Array.from(connections.values()).map((connection) => ({
      id: connection.id,
      label: connection.label,
      ready: connection.ready,
    })),
  };
}

function broadcastProfileState() {
  const snapshot = getProfileState();
  const payload = JSON.stringify({
    kind: "profile_state",
    activeProfileId: snapshot.activeProfileId,
    profileCount: snapshot.profileCount,
    profiles: snapshot.profiles,
  });

  for (const connection of connections.values()) {
    if (connection.socket.readyState === WebSocket.OPEN) {
      try {
        connection.socket.send(payload);
      } catch (error) {
        logError(`Failed to broadcast profile state to profile ${connection.id}`, error);
      }
    }
  }
}

function setActiveProfile(profileId: string | null) {
  if (profileId && !connections.has(profileId)) {
    logToFile(`Attempted to activate unknown profile: ${profileId}`);
    return;
  }

  if (activeProfileId === profileId) {
    return;
  }

  activeProfileId = profileId;
  cleanupPendingCalls();
  logToFile(`Active profile set to: ${profileId ?? "none"}`);
  broadcastProfileState();
}

export function registerExtensionConnection(profileId: string, label: string | null, socket: WebSocket) {
  if (shuttingDown) {
    try {
      socket.close(1012, "Server restarting");
    } catch {}
    return;
  }

  const normalizedLabel = label?.trim() || `Profile ${profileId.slice(0, 8)}`;

  if (connections.has(profileId)) {
    try {
      connections.get(profileId)?.socket?.close();
    } catch (error) {
      logError(`Error closing existing socket for profile ${profileId}`, error);
    }
  }

  const connection: ProfileConnection = {
    id: profileId,
    label: normalizedLabel,
    socket,
    ready: false,
    lastPongTime: Date.now(),
    pingInterval: null,
    pongTimeout: null,
  };

  connections.set(profileId, connection);
  if (!activeProfileId) {
    activeProfileId = profileId;
  }

  startHeartbeat(profileId);
  broadcastProfileState();
}

export function removeExtensionConnection(profileId: string) {
  const connection = connections.get(profileId);
  if (!connection) return;

  closeConnection(connection, 1001, "Extension disconnected");
  connections.delete(profileId);

  if (activeProfileId === profileId) {
    const firstProfile = connections.values().next();
    setActiveProfile(firstProfile.done ? null : firstProfile.value.id);
  } else {
    broadcastProfileState();
  }
}

export function closeAllConnections() {
  shuttingDown = true;
  for (const connection of connections.values()) {
    closeConnection(connection, 1012, "Server shutting down");
  }
  connections.clear();
  activeProfileId = null;
  cleanupPendingCalls();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function hasExtensionConnection(): boolean {
  const connection = getActiveConnection();
  return connection !== null && connection.socket.readyState === WebSocket.OPEN && connection.ready;
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
 * Call a tool on the browser extension via WebSocket bridge with retry logic and exponential backoff
 */
export async function callExtension(tool: string, params: any): Promise<any> {
  let attempts = 0;
  let lastError: Error | null = null;

  while (attempts < MAX_BRIDGE_RETRIES) {
    if (!hasExtensionConnection()) {
      attempts++;
      lastError = new Error("Browser extension not connected to bridge");

      const delayMs = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1),
        MAX_RETRY_DELAY_MS,
      );
      logToFile(`Retry ${attempts}/${MAX_BRIDGE_RETRIES}: Bridge not connected, waiting ${delayMs}ms...`);
      await delay(delayMs);
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

      const delayMs = Math.min(
        INITIAL_RETRY_DELAY_MS * Math.pow(2, attempts - 1),
        MAX_RETRY_DELAY_MS,
      );
      logToFile(`Retry ${attempts}/${MAX_BRIDGE_RETRIES} for ${tool} after ${delayMs}ms (error: ${normalized.message})`);
      await delay(delayMs);
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
    const connection = getActiveConnection();
    if (!connection) {
      reject(new Error("Browser extension not connected to bridge"));
      return;
    }

    const callId = uuidv4();
    const timeoutMs = tool === "screenshot" ? 10000 : 60000; // Increased from 30s to 60s
    const timeout = setTimeout(() => {
      pendingCalls.delete(callId);
      const msg = `Tool call timeout after ${timeoutMs}ms: ${tool}`;
      logToFile(msg);
      reject(new Error(msg));
    }, timeoutMs);

    pendingCalls.set(callId, {
      resolve: (val) => {
        clearTimeout(timeout);
        logToFile(`Tool call resolved: ${tool} (${callId}) [profile ${connection.id}]`);
        resolve(val);
      },
      reject: (err) => {
        clearTimeout(timeout);
        logToFile(`Tool call rejected: ${tool} (${callId}) [profile ${connection.id}] - ${err}`);
        reject(err);
      },
    });

    const message = {
      kind: "call",
      id: callId,
      tool: tool,
      params: params,
    };

    logToFile(`Sending to extension: ${tool} (${callId}) [profile ${connection.id}]`);

    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      clearTimeout(timeout);
      pendingCalls.delete(callId);
      const normalized = normalizeError(error);
      logError("Failed to send message to extension", normalized);
      reject(normalized);
    }
  });
}

/**
 * Handle incoming message from browser extension
 * Extension sends: {id, kind: "result", ok, data?, error?} or {kind: "pong"} or {kind: "ready"}
 */
export function handleExtensionMessage(profileId: string, data: any) {
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
    logToFile(`Received from extension (${profileId}): ${JSON.stringify(msg)}`);

    if (msg.kind === "pong") {
      handlePong(profileId);
      return;
    }

    if (msg.kind === "ready") {
      const connection = connections.get(profileId);
      if (connection) {
        connection.ready = true;
        connection.lastPongTime = Date.now();
        if (!activeProfileId) {
          activeProfileId = profileId;
        }
      }
      broadcastProfileState();
      logToFile(`Extension handshake complete for profile ${profileId} - bridge is ready`);
      return;
    }

    if (msg.kind === "activate_profile") {
      const requestedProfileId = typeof msg.profileId === "string" ? msg.profileId : profileId;
      setActiveProfile(requestedProfileId);
      return;
    }

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
