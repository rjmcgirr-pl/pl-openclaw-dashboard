/**
 * SSE Routes
 * HTTP endpoint handlers for Server-Sent Events
 * 
 * Ticket #20: SSE Infrastructure with Durable Objects
 */

import type { Env } from '../types';

/**
 * Handle SSE connection requests
 * GET /sse/connect - Establish SSE connection with JWT validation
 */
export async function handleSSEConnect(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.SSE_CONNECTION_MANAGER) {
    return new Response(
      JSON.stringify({ error: 'SSE not configured' }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        },
      }
    );
  }

  // Forward request to Durable Object
  const id = env.SSE_CONNECTION_MANAGER.idFromName('global');
  const manager = env.SSE_CONNECTION_MANAGER.get(id);
  
  return manager.fetch(request);
}

/**
 * Handle SSE stats request (admin/debug use)
 * GET /sse/stats - Get connection statistics
 */
export async function handleSSEStats(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.SSE_CONNECTION_MANAGER) {
    return new Response(
      JSON.stringify({ error: 'SSE not configured' }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        },
      }
    );
  }

  // Verify admin/auth if needed
  const authHeader = request.headers.get('Authorization');
  const apiKey = request.headers.get('X-Agent-API-Key');
  
  const isAuthorized = 
    (authHeader && await verifyAdminToken(authHeader, env)) ||
    (apiKey && apiKey === env.AGENT_API_KEY);

  if (!isAuthorized) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': request.headers.get('Origin') || '*',
        },
      }
    );
  }

  // Forward request to Durable Object
  const id = env.SSE_CONNECTION_MANAGER.idFromName('global');
  const manager = env.SSE_CONNECTION_MANAGER.get(id);
  
  return manager.fetch(new Request('http://internal/sse/stats', {
    method: 'GET',
    headers: request.headers,
  }));
}

/**
 * Verify admin token (Bearer JWT)
 */
async function verifyAdminToken(authHeader: string, env: Env): Promise<boolean> {
  if (!authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.substring(7);
  
  try {
    // Basic JWT validation
    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    // Decode and check expiration
    const payloadB64 = parts[1];
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);

    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return false;
    }

    // For now, accept any valid JWT
    // In production, check for specific admin roles
    return true;
  } catch {
    return false;
  }
}
