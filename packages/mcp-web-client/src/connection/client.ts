import type {
  McpWebClientConfig,
  ToolCallRequest,
  ToolCallResponse,
  ExtensionMessage,
  ConnectionState,
  EventName,
  EventHandler,
} from '../types/index.js';
import {
  ConnectionError,
  NotConnectedError,
  ToolCallError,
  TimeoutError,
} from '../utils/errors.js';
import { hasChromeRuntime } from '../utils/detect.js';
import {
  createAllTools,
  toErrorResult,
  type Tool,
  type ToolResult,
} from '@janhq/mcp-shared';

const DEFAULT_TIMEOUT = 30000;

/**
 * Generate a unique ID for tool calls
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Client for communicating with the Jan Browser MCP extension
 *
 * Uses chrome.runtime.connect() for direct communication.
 * No handshake needed - connection is immediate.
 */
export class McpWebClient {
  private readonly extensionId: string;
  private readonly timeout: number;
  private port: chrome.runtime.Port | null = null;
  private state: ConnectionState = 'disconnected';
  private pendingCalls: Map<
    string,
    {
      resolve: (value: ToolCallResponse) => void;
      reject: (error: Error) => void;
      timeoutId: ReturnType<typeof setTimeout>;
    }
  > = new Map();
  private eventHandlers: Map<EventName, Set<EventHandler<EventName>>> = new Map();
  private extensionVersion: string | null = null;
  private toolHandlers: Map<string, Tool> | null = null;

  constructor(config: McpWebClientConfig) {
    if (!config.extensionId) {
      throw new Error('extensionId is required');
    }
    this.extensionId = config.extensionId;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get extension version (available if extension sends it)
   */
  getExtensionVersion(): string | null {
    return this.extensionVersion;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.state === 'connected' && this.port !== null;
  }

  /**
   * Connect to the extension
   *
   * Connection is immediate via chrome.runtime.connect().
   * No handshake wait - we're connected as soon as the port is created.
   */
  connect(): void {
    if (this.isConnected()) {
      return;
    }

    if (!hasChromeRuntime()) {
      throw new ConnectionError('chrome.runtime API is not available');
    }

    try {
      // Connect to extension - this is synchronous
      this.port = chrome.runtime.connect(this.extensionId, {
        name: 'mcp-web-client',
      });

      // Handle incoming messages
      this.port.onMessage.addListener((message: ExtensionMessage) => {
        this.handleMessage(message);
      });

      // Handle disconnect
      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError?.message;
        this.handleDisconnect(error);
      });

      // Connected immediately - no handshake needed
      this.setState('connected');
      this.emit('connect');
    } catch (err) {
      this.setState('error');
      throw new ConnectionError(
        'Failed to connect to extension',
        err instanceof Error ? err.message : undefined
      );
    }
  }

  /**
   * Disconnect from the extension
   */
  disconnect(): void {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
    this.cleanupPendingCalls('Client disconnected');
    this.setState('disconnected');
  }

  /**
   * Call a tool on the extension using shared tool handlers.
   * This mirrors mcp-server behavior (sanitization + normalized ToolResult).
   */
  async call(tool: string, params: Record<string, unknown> = {}): Promise<ToolResult> {
    const handler = this.getToolHandler(tool);
    if (!handler) {
      return toErrorResult(`Tool "${tool}" not found`);
    }
    return handler.handle(params);
  }

  /**
   * Call the extension directly without shared sanitization/normalization.
   * Returns the raw ToolCallResponse from the extension.
   */
  async callRaw(tool: string, params: Record<string, unknown> = {}): Promise<ToolCallResponse> {
    return this.callExtension(tool, params);
  }

  /**
   * Subscribe to events
   */
  on<T extends EventName>(event: T, handler: EventHandler<T>): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler as EventHandler<EventName>);
  }

  /**
   * Unsubscribe from events
   */
  off<T extends EventName>(event: T, handler: EventHandler<T>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler<EventName>);
    }
  }

  /**
   * Handle incoming message from extension
   */
  private handleMessage(message: ExtensionMessage): void {
    // Handle pong (from ping request) - capture version if available
    if (message.kind === 'pong' && 'version' in message) {
      this.extensionVersion = (message as { version?: string }).version ?? null;
      return;
    }

    // Handle tool call results
    if (message.kind === 'result') {
      const pending = this.pendingCalls.get(message.id);
      if (pending) {
        clearTimeout(pending.timeoutId);
        this.pendingCalls.delete(message.id);

        if (message.ok) {
          pending.resolve(message);
        } else {
          pending.reject(new ToolCallError(message.id, message.error));
        }
      }
    }
  }

  /**
   * Handle disconnect from extension
   */
  private handleDisconnect(error?: string): void {
    this.port = null;
    this.cleanupPendingCalls(error || 'Connection closed');
    this.setState('disconnected');
    this.emit('disconnect', error);
  }

  /**
   * Clean up pending calls
   */
  private cleanupPendingCalls(reason: string): void {
    for (const [id, pending] of this.pendingCalls) {
      clearTimeout(pending.timeoutId);
      pending.reject(new ConnectionError(`Request ${id} cancelled: ${reason}`));
    }
    this.pendingCalls.clear();
  }

  /**
   * Set connection state
   */
  private setState(state: ConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.emit('stateChange', state);
    }
  }

  /**
   * Emit an event
   */
  private emit<T extends EventName>(event: T, ...args: Parameters<EventHandler<T>>): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          (handler as (...args: unknown[]) => void)(...args);
        } catch (err) {
          console.error(`Error in ${event} handler:`, err);
        }
      }
    }
  }

  /**
   * Lazily create shared tool handlers so behavior matches mcp-server.
   */
  private getToolHandler(tool: string): Tool | undefined {
    if (!this.toolHandlers) {
      const tools = createAllTools({
        call: this.callExtension.bind(this),
      });
      this.toolHandlers = new Map(tools.map((t) => [t.schema.name, t]));
    }
    return this.toolHandlers.get(tool);
  }

  /**
   * Raw call to the extension (legacy behavior used by shared tool handlers).
   */
  private async callExtension(tool: string, params: Record<string, unknown> = {}): Promise<ToolCallResponse> {
    if (!this.isConnected() || !this.port) {
      throw new NotConnectedError();
    }

    const id = generateId();
    const request: ToolCallRequest = {
      kind: 'call',
      id,
      tool,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCalls.delete(id);
        reject(new TimeoutError(tool, this.timeout));
      }, this.timeout);

      this.pendingCalls.set(id, { resolve, reject, timeoutId });
      this.port!.postMessage(request);
    });
  }
}
