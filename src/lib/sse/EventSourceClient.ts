/**
 * EventSourceClient - SSE Client with JWT Authentication
 * 
 * Features:
 * - JWT token injection in headers (via query param fallback for EventSource limitations)
 * - Connection lifecycle management (connect, reconnect, close)
 * - Event type routing (task.created, task.updated, etc.)
 * - Error handling with exponential backoff
 * - Automatic heartbeat/ping handling
 */

import {
  SSEEventType,
  SSEEventData,
  SSEConnectionStatus,
  SSEConnectionState,
  SSEClientOptions,
  SSESubscription,
  SSEEventHandler,
} from '../../types/sse';

/**
 * Generate unique ID for subscriptions
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Default SSE client options
 */
const DEFAULT_OPTIONS: Partial<SSEClientOptions> = {
  authMethod: 'query',
  reconnect: true,
  maxReconnectAttempts: 10,
  reconnectDelay: 1000, // 1 second
  maxReconnectDelay: 30000, // 30 seconds
  reconnectBackoffMultiplier: 2,
  heartbeatInterval: 30000, // 30 seconds
};

/**
 * EventSourceClient - Wrapper for EventSource with advanced features
 */
export class EventSourceClient {
  private options: SSEClientOptions;
  private eventSource: EventSource | null = null;
  private state: SSEConnectionState;
  private subscriptions: Map<string, SSESubscription> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastEventId: string = '';
  private isManualClose: boolean = false;

  constructor(options: SSEClientOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.state = {
      status: 'disconnected',
      reconnectAttempt: 0,
    };
  }

  /**
   * Get current connection state
   */
  getState(): SSEConnectionState {
    return { ...this.state };
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return this.state.status === 'connected';
  }

  /**
   * Connect to SSE endpoint
   */
  connect(): void {
    if (this.eventSource) {
      console.warn('[SSE] Already connected or connecting');
      return;
    }

    this.isManualClose = false;
    this.updateState({ status: 'connecting' });

    try {
      const url = this.buildUrl();
      console.log(`[SSE] Connecting to ${url.replace(/token=[^&]+/, 'token=***')}`);

      this.eventSource = new EventSource(url);

      this.eventSource.onopen = this.handleOpen.bind(this);
      this.eventSource.onmessage = this.handleMessage.bind(this);
      this.eventSource.onerror = this.handleError.bind(this);

      // Setup event-specific listeners
      this.setupEventListeners();
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      this.updateState({
        status: 'error',
        lastError: error instanceof Error ? error : new Error(String(error)),
      });
      this.scheduleReconnect();
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    this.isManualClose = true;
    this.clearTimers();

    if (this.eventSource) {
      console.log('[SSE] Closing connection');
      this.eventSource.close();
      this.eventSource = null;
    }

    this.updateState({ status: 'disconnected', reconnectAttempt: 0 });
  }

  /**
   * Subscribe to specific event type
   * @returns Unsubscribe function
   */
  subscribe<T extends SSEEventData>(
    eventType: SSEEventType | '*',
    handler: SSEEventHandler<T>
  ): () => void {
    const id = generateId();
    this.subscriptions.set(id, {
      eventType,
      handler: handler as SSEEventHandler,
      id,
    });

    console.log(`[SSE] Subscribed to ${eventType} (${id})`);

    // Return unsubscribe function
    return () => {
      this.subscriptions.delete(id);
      console.log(`[SSE] Unsubscribed from ${eventType} (${id})`);
    };
  }

  /**
   * Subscribe to multiple event types at once
   * @returns Unsubscribe function
   */
  subscribeToMany<T extends SSEEventData>(
    eventTypes: SSEEventType[],
    handler: SSEEventHandler<T>
  ): () => void {
    const unsubscribers = eventTypes.map((type) => this.subscribe(type, handler));

    return () => {
      unsubscribers.forEach((unsub) => unsub());
    };
  }

  /**
   * Add one-time event listener
   */
  once<T extends SSEEventData>(
    eventType: SSEEventType,
    handler: SSEEventHandler<T>
  ): void {
    const unsubscribe = this.subscribe<T>(eventType, (event) => {
      handler(event);
      unsubscribe();
    });
  }

  /**
   * Wait for connection to be established
   */
  waitForConnection(timeoutMs: number = 5000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected()) {
        resolve();
        return;
      }

      const checkInterval = setInterval(() => {
        if (this.isConnected()) {
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          resolve();
        }
      }, 100);

      const timeoutTimer = setTimeout(() => {
        clearInterval(checkInterval);
        reject(new Error(`Connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Build SSE URL with authentication
   */
  private buildUrl(): string {
    const url = new URL(this.options.url);

    // EventSource doesn't support custom headers, so we pass token via query param
    // The server should validate this and immediately close if invalid
    if (this.options.authMethod === 'query') {
      url.searchParams.set('token', this.options.token);
    }

    // Include last event ID for resumable connections
    if (this.lastEventId) {
      url.searchParams.set('lastEventId', this.lastEventId);
    }

    return url.toString();
  }

  /**
   * Setup event-specific listeners on EventSource
   */
  private setupEventListeners(): void {
    if (!this.eventSource) return;

    // Listen for specific event types
    const eventTypes: SSEEventType[] = [
      'task.created',
      'task.updated',
      'task.deleted',
      'task.status_changed',
      'task.priority_changed',
      'task.assigned',
      'comment.created',
      'comment.updated',
      'comment.deleted',
      'cron_job.started',
      'cron_job.completed',
      'cron_job.failed',
      'ping',
      'connected',
    ];

    eventTypes.forEach((type) => {
      this.eventSource?.addEventListener(type, (event: MessageEvent) => {
        this.handleTypedEvent(type, event);
      });
    });
  }

  /**
   * Handle connection open
   */
  private handleOpen(): void {
    console.log('[SSE] Connection established');
    this.updateState({
      status: 'connected',
      reconnectAttempt: 0,
      lastError: undefined,
    });

    // Start heartbeat check
    this.startHeartbeat();

    // Call onConnect callback
    this.options.onConnect?.();
  }

  /**
   * Handle incoming generic message
   */
  private handleMessage(event: MessageEvent): void {
    try {
      // Store last event ID for resumable connections
      if (event.lastEventId) {
        this.lastEventId = event.lastEventId;
      }

      // Parse event data
      const data: SSEEventData = JSON.parse(event.data);
      console.debug('[SSE] Received message:', data.type);

      // Update last event time
      this.updateState({ lastEventTime: new Date() });

      // Route to registered handlers
      this.routeEvent(data);
    } catch (error) {
      console.error('[SSE] Failed to parse message:', error);
    }
  }

  /**
   * Handle typed events (specific event types)
   */
  private handleTypedEvent(eventType: string, event: MessageEvent): void {
    try {
      if (event.lastEventId) {
        this.lastEventId = event.lastEventId;
      }

      const data: SSEEventData = {
        type: eventType as SSEEventType,
        timestamp: new Date().toISOString(),
        id: event.lastEventId,
        data: JSON.parse(event.data),
      };

      this.updateState({ lastEventTime: new Date() });
      this.routeEvent(data);
    } catch (error) {
      console.error(`[SSE] Failed to handle ${eventType} event:`, error);
    }
  }

  /**
   * Route event to subscribed handlers
   */
  private routeEvent(event: SSEEventData): void {
    this.subscriptions.forEach((subscription) => {
      if (subscription.eventType === '*' || subscription.eventType === event.type) {
        try {
          subscription.handler(event);
        } catch (error) {
          console.error(`[SSE] Handler error for ${subscription.eventType}:`, error);
        }
      }
    });

    // Call global event handlers from options
    const globalHandler = this.options.eventHandlers?.[event.type];
    if (globalHandler) {
      try {
        globalHandler(event);
      } catch (error) {
        console.error(`[SSE] Global handler error for ${event.type}:`, error);
      }
    }
  }

  /**
   * Handle connection error
   */
  private handleError(event: Event): void {
    console.error('[SSE] Connection error:', event);

    const error = new Error('SSE connection error');
    this.updateState({
      status: 'error',
      lastError: error,
    });

    // Call onError callback
    this.options.onError?.(error);

    // Attempt reconnect if enabled and not manually closed
    if (!this.isManualClose && this.options.reconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return; // Already scheduled
    }

    const attempt = this.state.reconnectAttempt + 1;
    const maxAttempts = this.options.maxReconnectAttempts || 10;

    if (attempt > maxAttempts) {
      console.error(`[SSE] Max reconnect attempts (${maxAttempts}) reached`);
      this.updateState({ status: 'disconnected' });
      return;
    }

    // Calculate delay with exponential backoff
    const baseDelay = this.options.reconnectDelay || 1000;
    const multiplier = this.options.reconnectBackoffMultiplier || 2;
    const maxDelay = this.options.maxReconnectDelay || 30000;

    const delay = Math.min(baseDelay * Math.pow(multiplier, attempt - 1), maxDelay);

    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${attempt}/${maxAttempts})`);

    this.updateState({
      status: 'reconnecting',
      reconnectAttempt: attempt,
    });

    // Call onReconnect callback
    this.options.onReconnect?.(attempt);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.cleanup();
      this.connect();
    }, delay);
  }

  /**
   * Start heartbeat to detect stale connections
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    const interval = this.options.heartbeatInterval || 30000;

    this.heartbeatTimer = setInterval(() => {
      const lastEvent = this.state.lastEventTime;
      if (!lastEvent) return;

      const timeSinceLastEvent = Date.now() - lastEvent.getTime();
      const staleThreshold = interval * 2; // 2x heartbeat interval

      if (timeSinceLastEvent > staleThreshold) {
        console.warn('[SSE] Connection appears stale, reconnecting...');
        this.cleanup();
        this.scheduleReconnect();
      }
    }, interval);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Clear all timers
   */
  private clearTimers(): void {
    this.stopHeartbeat();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Cleanup connection resources
   */
  private cleanup(): void {
    this.stopHeartbeat();

    if (this.eventSource) {
      this.eventSource.onopen = null;
      this.eventSource.onmessage = null;
      this.eventSource.onerror = null;
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * Update connection state
   */
  private updateState(updates: Partial<SSEConnectionState>): void {
    this.state = { ...this.state, ...updates };
  }
}

/**
 * Create SSE client with convenience function
 */
export function createSSEClient(options: SSEClientOptions): EventSourceClient {
  return new EventSourceClient(options);
}

export default EventSourceClient;
