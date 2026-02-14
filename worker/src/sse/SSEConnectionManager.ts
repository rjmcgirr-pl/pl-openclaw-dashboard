/**
 * SSE Connection Manager Durable Object
 * Manages WebSocket-like SSE connections for real-time task updates
 * 
 * Ticket #20: SSE Infrastructure with Durable Objects
 */

export interface SSEConnection {
  id: string;
  controller: ReadableStreamDefaultController;
  userId: string;
  connectedAt: number;
}

export interface TaskEvent {
  type: 'task.created' | 'task.updated' | 'task.deleted' | 'task.status_changed';
  taskId: number;
  task?: Record<string, unknown>;
  previousStatus?: string;
  newStatus?: string;
  timestamp: string;
  userId?: string;
}

export class SSEConnectionManager {
  private connections: Map<string, SSEConnection> = new Map();
  private state: DurableObjectState;
  private env: Record<string, unknown>;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.state = state;
    this.env = env;
  }

  /**
   * Handle incoming HTTP requests
   * Supports:
   * - GET /sse/connect - Establish SSE connection with JWT validation
   * - POST /sse/broadcast - Broadcast event to all connected clients
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { 
        status: 204, 
        headers: this.getCorsHeaders(request) 
      });
    }

    try {
      // SSE connection endpoint
      if (path === '/sse/connect' && method === 'GET') {
        return await this.handleConnect(request);
      }

      // Broadcast endpoint (internal use)
      if (path === '/sse/broadcast' && method === 'POST') {
        return await this.handleBroadcast(request);
      }

      // Get connection stats
      if (path === '/sse/stats' && method === 'GET') {
        return this.handleStats(request);
      }

      return new Response('Not Found', { 
        status: 404, 
        headers: this.getCorsHeaders(request) 
      });
    } catch (error) {
      console.error('[SSEConnectionManager] Error:', error);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }), 
        { 
          status: 500, 
          headers: { 
            ...this.getCorsHeaders(request),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }
  }

  /**
   * Handle SSE connection request
   * Validates JWT token and establishes SSE stream
   */
  private async handleConnect(request: Request): Promise<Response> {
    // Extract and validate JWT token from query param or Authorization header
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || this.extractBearerToken(request);
    
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Authentication required: Missing token' }), 
        { 
          status: 401, 
          headers: { 
            ...this.getCorsHeaders(request),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    // Validate JWT token
    const payload = await this.verifyJwtToken(token);
    if (!payload) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed: Invalid token' }), 
        { 
          status: 401, 
          headers: { 
            ...this.getCorsHeaders(request),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    const userId = payload.sub || payload.id || 'anonymous';
    const connectionId = this.generateConnectionId();

    // Create SSE stream
    const stream = new ReadableStream({
      start: (controller) => {
        // Store connection
        const connection: SSEConnection = {
          id: connectionId,
          controller,
          userId: String(userId),
          connectedAt: Date.now(),
        };
        this.connections.set(connectionId, connection);

        // Send initial connection event
        this.sendEvent(connectionId, {
          type: 'connection.established',
          connectionId,
          userId: String(userId),
          timestamp: new Date().toISOString(),
        });

        console.log(`[SSE] Connection established: ${connectionId} for user: ${userId}`);
      },
      cancel: () => {
        // Clean up connection when client disconnects
        this.connections.delete(connectionId);
        console.log(`[SSE] Connection closed: ${connectionId}`);
      },
    });

    return new Response(stream, {
      headers: {
        ...this.getCorsHeaders(request),
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  /**
   * Handle broadcast request from internal services
   */
  private async handleBroadcast(request: Request): Promise<Response> {
    // Verify internal API key for security
    const apiKey = request.headers.get('X-Internal-API-Key');
    const expectedKey = this.env.INTERNAL_API_KEY || this.env.AGENT_API_KEY;
    
    if (!apiKey || apiKey !== expectedKey) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }), 
        { 
          status: 403, 
          headers: { 
            ...this.getCorsHeaders(request),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    const body = await request.json() as { 
      event: TaskEvent; 
      targetUserIds?: string[];
    };

    if (!body.event) {
      return new Response(
        JSON.stringify({ error: 'Missing event data' }), 
        { 
          status: 400, 
          headers: { 
            ...this.getCorsHeaders(request),
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

    const { event, targetUserIds } = body;
    const broadcastCount = this.broadcastEvent(event, targetUserIds);

    return new Response(
      JSON.stringify({ 
        success: true, 
        broadcastCount,
        totalConnections: this.connections.size 
      }), 
      { 
        status: 200, 
        headers: { 
          ...this.getCorsHeaders(request),
          'Content-Type': 'application/json' 
        } 
      }
    );
  }

  /**
   * Get connection statistics
   */
  private handleStats(request: Request): Response {
    const stats = {
      totalConnections: this.connections.size,
      connections: Array.from(this.connections.values()).map(conn => ({
        id: conn.id,
        userId: conn.userId,
        connectedAt: conn.connectedAt,
        duration: Date.now() - conn.connectedAt,
      })),
    };

    return new Response(
      JSON.stringify(stats), 
      { 
        status: 200, 
        headers: { 
          ...this.getCorsHeaders(request),
          'Content-Type': 'application/json' 
        } 
      }
    );
  }

  /**
   * Broadcast event to all connected clients
   * If targetUserIds is provided, only send to those users
   * Returns number of clients that received the event
   */
  broadcastEvent(event: TaskEvent, targetUserIds?: string[]): number {
    let broadcastCount = 0;
    const eventData = `data: ${JSON.stringify(event)}\n\n`;

    for (const [connectionId, connection] of this.connections) {
      // User-scoped broadcasting: skip if targetUserIds specified and user not in list
      if (targetUserIds && !targetUserIds.includes(connection.userId)) {
        continue;
      }

      try {
        const encoder = new TextEncoder();
        connection.controller.enqueue(encoder.encode(eventData));
        broadcastCount++;
      } catch (error) {
        // Connection is dead, remove it
        console.error(`[SSE] Failed to send to ${connectionId}, removing:`, error);
        this.connections.delete(connectionId);
      }
    }

    console.log(`[SSE] Broadcasted event ${event.type} to ${broadcastCount} clients`);
    return broadcastCount;
  }

  /**
   * Send event to a specific connection
   */
  private sendEvent(connectionId: string, data: Record<string, unknown>): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const encoder = new TextEncoder();
      const eventData = `data: ${JSON.stringify(data)}\n\n`;
      connection.controller.enqueue(encoder.encode(eventData));
    } catch (error) {
      console.error(`[SSE] Failed to send to ${connectionId}:`, error);
      this.connections.delete(connectionId);
    }
  }

  /**
   * Extract Bearer token from Authorization header
   */
  private extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    return authHeader.substring(7);
  }

  /**
   * Verify JWT token
   * Supports both standard JWT and the custom format used in this project
   */
  private async verifyJwtToken(token: string): Promise<Record<string, unknown> | null> {
    try {
      // Split token
      const parts = token.split('.');
      if (parts.length !== 3) {
        return null;
      }

      // Decode payload
      const payloadB64 = parts[1];
      const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
      const payload = JSON.parse(payloadJson);

      // Check expiration
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        console.log('[SSE] Token expired');
        return null;
      }

      // Verify signature
      const secret = this.env.JWT_SECRET || this.env.SESSION_SECRET;
      if (!secret) {
        console.error('[SSE] No JWT secret configured');
        return null;
      }

      const encoder = new TextEncoder();
      const data = encoder.encode(`${parts[0]}.${parts[1]}`);
      
      const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(String(secret)),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const signature = await crypto.subtle.sign('HMAC', key, data);
      const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

      if (signatureB64 !== parts[2]) {
        console.log('[SSE] Invalid signature');
        return null;
      }

      return payload;
    } catch (error) {
      console.error('[SSE] Token verification failed:', error);
      return null;
    }
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get CORS headers for responses
   */
  private getCorsHeaders(request: Request): Record<string, string> {
    const origin = request.headers.get('Origin') || 'https://openclaw.propertyllama.com';
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Internal-API-Key',
      'Access-Control-Allow-Credentials': 'true',
    };
  }
}

export default SSEConnectionManager;
