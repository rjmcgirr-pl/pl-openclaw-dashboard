import type { Env, Task, CreateTaskRequest, UpdateTaskRequest, CronJob, CronJobRun, CreateCronJobRequest, UpdateCronJobRequest, EndCronJobRequest, CronJobStatus, GoogleTokenResponse, GoogleUserInfo, Session, Comment, CommentReaction, CommentNotification, CreateCommentRequest, CreateAgentCommentRequest, AddReactionRequest, ClaimTaskRequest, AuthorType, AgentCommentType } from './types';
import { SSEConnectionManager } from './sse/SSEConnectionManager';
import { handleSSEConnect, handleSSEStats } from './routes/sse';
import { emitTaskCreated, emitTaskUpdated, emitTaskDeleted } from './middleware/taskEvents';
import { broadcastNotification, broadcastCommentCreated } from './sse/broadcast';

// Dynamic CORS headers - origin must match the requesting site for credentials to work
function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || 'https://openclaw.propertyllama.com';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
  };
}

// Session cookie name
const SESSION_COOKIE_NAME = 'session';

// Generate a random session ID
function generateSessionId(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Hash session ID for storage
async function hashSessionId(sessionId: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(sessionId + secret);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer), byte => byte.toString(16).padStart(2, '0')).join('');
}

// Get session from request
async function getSession(request: Request, env: Env): Promise<Session | null> {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;

  const sessionKey = await hashSessionId(sessionId, env.SESSION_SECRET);
  const sessionData = await env.SESSION_KV.get(sessionKey);
  if (!sessionData) return null;

  try {
    const session: Session = JSON.parse(sessionData);
    // Check expiration
    if (Date.now() > session.expiresAt) {
      await env.SESSION_KV.delete(sessionKey);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

// Create a new session
async function createSession(userInfo: GoogleUserInfo, env: Env): Promise<{ sessionId: string; session: Session }> {
  const sessionId = generateSessionId();
  const session: Session = {
    userId: userInfo.sub,
    email: userInfo.email,
    name: userInfo.name,
    picture: userInfo.picture,
    createdAt: Date.now(),
    expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
  };

  const sessionKey = await hashSessionId(sessionId, env.SESSION_SECRET);
  await env.SESSION_KV.put(sessionKey, JSON.stringify(session), {
    expirationTtl: 7 * 24 * 60 * 60, // 7 days in seconds
  });

  return { sessionId, session };
}

// Clear session
async function clearSession(request: Request, env: Env): Promise<void> {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return;

  const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return;

  const sessionKey = await hashSessionId(sessionId, env.SESSION_SECRET);
  await env.SESSION_KV.delete(sessionKey);
}

// Exchange Google authorization code for tokens
async function exchangeCodeForTokens(code: string, redirectUri: string, env: Env): Promise<GoogleTokenResponse> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<GoogleTokenResponse>;
}

// Get user info from Google ID token
async function getGoogleUserInfo(idToken: string): Promise<GoogleUserInfo> {
  // Decode JWT payload
  const payload = idToken.split('.')[1];
  const decodedPayload = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  
  return {
    sub: decodedPayload.sub,
    email: decodedPayload.email,
    email_verified: decodedPayload.email_verified,
    name: decodedPayload.name,
    picture: decodedPayload.picture,
    given_name: decodedPayload.given_name,
    family_name: decodedPayload.family_name,
  };
}

// Validate email domain
function validateEmailDomain(email: string, allowedDomain: string): boolean {
  return email.toLowerCase().endsWith(`@${allowedDomain.toLowerCase()}`);
}

// Agent API Key validation helper
function validateAgentApiKey(request: Request, env: Env): { valid: boolean; agentId?: string } {
  const apiKey = request.headers.get('X-Agent-API-Key');
  if (!apiKey || !env.AGENT_API_KEY) {
    return { valid: false };
  }
  
  // Simple API key validation - in production could check KV for multiple keys
  if (apiKey === env.AGENT_API_KEY) {
    return { valid: true, agentId: 'clawdbot' };
  }
  
  return { valid: false };
}

// Get current user identity (from session or agent API key)
async function getCurrentUser(request: Request, env: Env): Promise<{ type: 'human' | 'agent'; id: string; name: string } | null> {
  // Check for agent auth first
  const agentAuth = validateAgentApiKey(request, env);
  if (agentAuth.valid && agentAuth.agentId) {
    return { type: 'agent', id: agentAuth.agentId, name: agentAuth.agentId };
  }
  
  // Check for session
  const session = await getSession(request, env);
  if (session) {
    return { type: 'human', id: session.email, name: session.name };
  }
  
  return null;
}

// Session validation helper
async function validateSession(request: Request, env: Env): Promise<Response | null> {
  // First check for Agent API Key (for automation)
  const agentAuth = validateAgentApiKey(request, env);
  if (agentAuth.valid) {
    return null; // Allow access for agents
  }
  
  // Check for JWT Bearer token
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = await verifyJwtToken(token, env);
    if (payload) {
      return null; // Valid JWT token
    }
  }
  
  // Skip validation if no OAuth is configured
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID === 'placeholder') {
    return null; // Allow access if no OAuth configured
  }

  const session = await getSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required', authUrl: '/auth/google' }), {
      status: 401,
      headers: getCorsHeaders(request),
    });
  }

  return null; // Validation passed
}

// Verify JWT token
async function verifyJwtToken(token: string, env: Env): Promise<object | null> {
  try {
    const [headerB64, payloadB64, signatureB64] = token.split('.');
    if (!headerB64 || !payloadB64 || !signatureB64) return null;
    
    const encoder = new TextEncoder();
    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    
    // Reconstruct signature from base64url
    const sigB64 = signatureB64.replace(/-/g, '+').replace(/_/g, '/');
    const signature = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
    
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(env.JWT_SECRET || env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;
    
    // Decode payload
    const payloadJson = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadJson);
    
    // Check expiration
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null; // Token expired
    }
    
    return payload;
  } catch (error) {
    console.error('[verifyJwtToken] Error:', error);
    return null;
  }
}

function jsonResponse(data: unknown, status = 200, request?: Request, customHeaders?: Record<string, string>): Response {
  const corsHeaders = request ? getCorsHeaders(request) : {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json',
  };
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      ...customHeaders,
    },
  });
}

function errorResponse(message: string, status = 400, request?: Request): Response {
  return jsonResponse({ error: message }, status, request);
}

// Validation helpers for OpenClaw cron job configuration
// Full list of models supported by OpenClaw
const VALID_MODELS = [
  // Google Gemini
  'google/gemini-3-flash-preview',
  'google/gemini-3-pro',
  'google/gemini-2.0-flash',
  // Anthropic Claude
  'anthropic/claude-sonnet-4-5',
  'anthropic/claude-opus-4-5',
  'anthropic/claude-3-5-sonnet',
  'anthropic/claude-3-opus',
  'anthropic/claude-3-haiku',
  // OpenRouter routing
  'openrouter/auto',
  // OpenRouter - Google
  'openrouter/google/gemini-3-flash-preview',
  'openrouter/google/gemini-3-pro',
  'openrouter/google/gemini-2.0-flash',
  // OpenRouter - Anthropic
  'openrouter/anthropic/claude-sonnet-4-5',
  'openrouter/anthropic/claude-opus-4-5',
  'openrouter/anthropic/claude-3-5-sonnet',
  'openrouter/anthropic/claude-3-opus',
  'openrouter/anthropic/claude-3-haiku',
  // OpenRouter - Moonshot
  'openrouter/moonshotai/kimi-k2.5',
  'openrouter/moonshotai/kimi-k1.5',
  // OpenRouter - Other
  'openrouter/meta-llama/llama-3.3-70b',
  'openrouter/meta-llama/llama-3.1-405b',
  'openrouter/deepseek/deepseek-chat',
  'openrouter/deepseek/deepseek-coder',
  'openrouter/qwen/qwen-2.5-72b'
] as const;

const VALID_THINKING_LEVELS = ['low', 'medium', 'high'] as const;

const MAX_PAYLOAD_SIZE_BYTES = 100 * 1024; // 100KB

function validatePayload(payload: unknown): { valid: boolean; error?: string } {
  if (payload === undefined || payload === null) {
    return { valid: false, error: 'Payload is required' };
  }
  if (typeof payload !== 'string') {
    return { valid: false, error: 'Payload must be a string' };
  }
  if (payload.trim() === '') {
    return { valid: false, error: 'Payload cannot be empty' };
  }
  const byteLength = new TextEncoder().encode(payload).length;
  if (byteLength > MAX_PAYLOAD_SIZE_BYTES) {
    return { valid: false, error: `Payload exceeds maximum size of 100KB (${byteLength} bytes)` };
  }
  return { valid: true };
}

function validateModel(model: unknown): { valid: boolean; error?: string } {
  if (model === undefined || model === null) {
    return { valid: true }; // Uses default
  }
  if (typeof model !== 'string') {
    return { valid: false, error: 'Model must be a string' };
  }
  if (!VALID_MODELS.includes(model as typeof VALID_MODELS[number])) {
    return { valid: false, error: `Invalid model. Must be one of: ${VALID_MODELS.join(', ')}` };
  }
  return { valid: true };
}

function validateThinking(thinking: unknown): { valid: boolean; error?: string } {
  if (thinking === undefined || thinking === null) {
    return { valid: true }; // Uses default
  }
  if (typeof thinking !== 'string') {
    return { valid: false, error: 'Thinking must be a string' };
  }
  if (!VALID_THINKING_LEVELS.includes(thinking as typeof VALID_THINKING_LEVELS[number])) {
    return { valid: false, error: `Invalid thinking level. Must be one of: ${VALID_THINKING_LEVELS.join(', ')}` };
  }
  return { valid: true };
}

function validateTimeoutSeconds(timeout: unknown): { valid: boolean; error?: string } {
  if (timeout === undefined || timeout === null) {
    return { valid: true }; // Uses default
  }
  if (typeof timeout !== 'number' || !Number.isInteger(timeout)) {
    return { valid: false, error: 'Timeout seconds must be an integer' };
  }
  if (timeout < 60 || timeout > 3600) {
    return { valid: false, error: 'Timeout seconds must be between 60 and 3600' };
  }
  return { valid: true };
}

function validateDeliver(deliver: unknown): { valid: boolean; error?: string } {
  if (deliver === undefined || deliver === null) {
    return { valid: true }; // Uses default
  }
  if (typeof deliver !== 'boolean') {
    return { valid: false, error: 'Deliver must be a boolean' };
  }
  return { valid: true };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // Handle CORS preflight with dynamic origin
    if (method === 'OPTIONS') {
      return new Response(null, { headers: getCorsHeaders(request) });
    }

    try {
      // OAuth Routes - no session validation required
      // GET /auth/google - Redirect to Google OAuth
      if (path === '/auth/google' && method === 'GET') {
        return await handleGoogleAuth(url, env);
      }

      // GET /auth/callback - Google OAuth callback
      if (path === '/auth/callback' && method === 'GET') {
        return await handleAuthCallback(url, env);
      }

      // POST /auth/logout - Logout
      if (path === '/auth/logout' && method === 'POST') {
        return await handleLogout(request, env);
      }

      // GET /auth/me - Get current user
      if (path === '/auth/me' && method === 'GET') {
        return await handleGetMe(request, env);
      }

      // POST /auth/login - JWT login (public route, no session validation)
      if (path === '/auth/login' && method === 'POST') {
        return await handleJwtLogin(request, env);
      }

      // GET /auth/sse-token - Get a short-lived JWT for SSE connection
      if (path === '/auth/sse-token' && method === 'GET') {
        const user = await getCurrentUser(request, env);
        if (!user) {
          return jsonResponse({ error: 'Authentication required' }, 401, request);
        }
        const token = await generateJwtToken({ sub: user.id, name: user.name, type: user.type }, env);
        return jsonResponse({ token }, 200, request);
      }

      // SSE Routes - require JWT validation (handled in SSEConnectionManager)
      // GET /sse/connect - Establish SSE connection for real-time updates
      if (path === '/sse/connect' && method === 'GET') {
        return await handleSSEConnect(request, env);
      }

      // GET /sse/stats - Get SSE connection statistics (admin/debug)
      if (path === '/sse/stats' && method === 'GET') {
        return await handleSSEStats(request, env);
      }

      // Validate session for all other routes
      const sessionError = await validateSession(request, env);
      if (sessionError) {
        return sessionError;
      }
      // GET /tasks - List all tasks
      if (path === '/tasks' && method === 'GET') {
        return await listTasks(env, url.searchParams, request);
      }

      // POST /tasks - Create a new task
      if (path === '/tasks' && method === 'POST') {
        console.log('[route] POST /tasks - entering createTask');
        try {
          const result = await createTask(env, request);
          console.log('[route] POST /tasks - createTask completed');
          return result;
        } catch (err) {
          console.error('[route] POST /tasks - createTask threw error:', err);
          throw err;
        }
      }

      // Single task routes
      const taskMatch = path.match(/^\/tasks\/(\d+)$/);
      if (taskMatch) {
        const taskId = parseInt(taskMatch[1], 10);

        // GET /tasks/:id - Get single task
        if (method === 'GET') {
          console.log(`[route] GET /tasks/${taskId} - entering getTask`);
          return await getTask(env, taskId, request);
        }

        // PATCH /tasks/:id - Update task
        if (method === 'PATCH') {
          console.log(`[route] PATCH /tasks/${taskId} - entering updateTask`);
          try {
            const result = await updateTask(env, taskId, request);
            console.log(`[route] PATCH /tasks/${taskId} - updateTask completed`);
            return result;
          } catch (err) {
            console.error(`[route] PATCH /tasks/${taskId} - updateTask threw error:`, err);
            throw err;
          }
        }

        // DELETE /tasks/:id - Delete task
        if (method === 'DELETE') {
          console.log(`[route] DELETE /tasks/${taskId} - entering deleteTask`);
          try {
            const result = await deleteTask(env, taskId, request);
            console.log(`[route] DELETE /tasks/${taskId} - deleteTask completed`);
            return result;
          } catch (err) {
            console.error(`[route] DELETE /tasks/${taskId} - deleteTask threw error:`, err);
            throw err;
          }
        }
      }

      // POST /tasks/archive-closed - Archive all closed tasks (admin only)
      if (path === '/tasks/archive-closed' && method === 'POST') {
        console.log('[route] POST /tasks/archive-closed - entering archiveClosedTasks');
        try {
          const result = await archiveClosedTasks(env, request);
          console.log('[route] POST /tasks/archive-closed - archiveClosedTasks completed');
          return result;
        } catch (err) {
          console.error('[route] POST /tasks/archive-closed - archiveClosedTasks threw error:', err);
          throw err;
        }
      }

      // Task Comment Routes
      // GET /tasks/:id/comments - List comments for a task
      const taskCommentsMatch = path.match(/^\/tasks\/(\d+)\/comments$/);
      if (taskCommentsMatch && method === 'GET') {
        const taskId = parseInt(taskCommentsMatch[1], 10);
        return await listComments(env, taskId, request);
      }

      // POST /tasks/:id/comments - Create comment on a task
      if (taskCommentsMatch && method === 'POST') {
        const taskId = parseInt(taskCommentsMatch[1], 10);
        return await createComment(env, taskId, request);
      }

      // POST /tasks/:id/agent-comment - Agent creates comment
      const taskAgentCommentMatch = path.match(/^\/tasks\/(\d+)\/agent-comment$/);
      if (taskAgentCommentMatch && method === 'POST') {
        const taskId = parseInt(taskAgentCommentMatch[1], 10);
        return await createAgentComment(env, taskId, request);
      }

      // POST /tasks/:id/claim - Agent claims task
      const taskClaimMatch = path.match(/^\/tasks\/(\d+)\/claim$/);
      if (taskClaimMatch && method === 'POST') {
        const taskId = parseInt(taskClaimMatch[1], 10);
        return await claimTask(env, taskId, request);
      }

      // POST /tasks/:id/release - Agent releases task claim
      const taskReleaseMatch = path.match(/^\/tasks\/(\d+)\/release$/);
      if (taskReleaseMatch && method === 'POST') {
        const taskId = parseInt(taskReleaseMatch[1], 10);
        return await releaseTask(env, taskId, request);
      }

      // Comment routes (not task-specific)
      // PATCH /comments/:id - Edit comment
      const commentMatch = path.match(/^\/comments\/(\d+)$/);
      if (commentMatch && method === 'PATCH') {
        const commentId = parseInt(commentMatch[1], 10);
        return await updateComment(env, commentId, request);
      }

      // DELETE /comments/:id - Soft delete comment
      if (commentMatch && method === 'DELETE') {
        const commentId = parseInt(commentMatch[1], 10);
        return await deleteComment(env, commentId, request);
      }

      // POST /comments/:id/reactions - Add reaction
      const commentReactionMatch = path.match(/^\/comments\/(\d+)\/reactions$/);
      if (commentReactionMatch && method === 'POST') {
        const commentId = parseInt(commentReactionMatch[1], 10);
        return await addReaction(env, commentId, request);
      }

      // DELETE /comments/:id/reactions - Remove reaction
      if (commentReactionMatch && method === 'DELETE') {
        const commentId = parseInt(commentReactionMatch[1], 10);
        return await removeReaction(env, commentId, request);
      }

      // Notification routes
      // GET /notifications - List unread notifications
      if (path === '/notifications' && method === 'GET') {
        return await listNotifications(env, request);
      }

      // POST /notifications/:id/read - Mark notification as read
      const notificationMatch = path.match(/^\/notifications\/(\d+)\/read$/);
      if (notificationMatch && method === 'POST') {
        const notificationId = parseInt(notificationMatch[1], 10);
        return await markNotificationRead(env, notificationId, request);
      }

      // POST /notifications/read-all - Mark all notifications as read
      if (path === '/notifications/read-all' && method === 'POST') {
        return await markAllNotificationsRead(env, request);
      }

      // Cron Jobs Routes
      // GET /cron-jobs - List all cron jobs
      if (path === '/cron-jobs' && method === 'GET') {
        return await listCronJobs(env, request);
      }

      // POST /cron-jobs - Create a new cron job
      if (path === '/cron-jobs' && method === 'POST') {
        console.log('[route] POST /cron-jobs - entering createCronJob');
        try {
          const result = await createCronJob(env, request);
          console.log('[route] POST /cron-jobs - createCronJob completed');
          return result;
        } catch (err) {
          console.error('[route] POST /cron-jobs - createCronJob threw error:', err);
          throw err;
        }
      }

      // Single cron job routes
      const cronJobMatch = path.match(/^\/cron-jobs\/(\d+)$/);
      if (cronJobMatch) {
        const cronJobId = parseInt(cronJobMatch[1], 10);

        // GET /cron-jobs/:id - Get single cron job
        if (method === 'GET') {
          return await getCronJob(env, cronJobId, request);
        }

        // PATCH /cron-jobs/:id - Update cron job
        if (method === 'PATCH') {
          return await updateCronJob(env, cronJobId, request);
        }

        // DELETE /cron-jobs/:id - Delete cron job
        if (method === 'DELETE') {
          return await deleteCronJob(env, cronJobId, request);
        }
      }

      // POST /cron-jobs/:id/start - Mark job as running
      const cronStartMatch = path.match(/^\/cron-jobs\/(\d+)\/start$/);
      if (cronStartMatch && method === 'POST') {
        const cronJobId = parseInt(cronStartMatch[1], 10);
        return await startCronJob(env, cronJobId, request);
      }

      // POST /cron-jobs/:id/end - Mark job as done/error with output
      const cronEndMatch = path.match(/^\/cron-jobs\/(\d+)\/end$/);
      if (cronEndMatch && method === 'POST') {
        const cronJobId = parseInt(cronEndMatch[1], 10);
        return await endCronJob(env, cronJobId, request);
      }

      // GET /cron-jobs/:id/runs - Get run history
      const cronRunsMatch = path.match(/^\/cron-jobs\/(\d+)\/runs$/);
      if (cronRunsMatch && method === 'GET') {
        const cronJobId = parseInt(cronRunsMatch[1], 10);
        return await listCronJobRuns(env, cronJobId, request);
      }

      // POST /cron-jobs/sync - Full sync (delete all, insert new)
      if (path === '/cron-jobs/sync' && method === 'POST') {
        return await syncCronJobs(env, request);
      }

      return errorResponse('Not found', 404);
    } catch (error) {
      console.error('Error handling request:', error);
      return errorResponse('Internal server error', 500);
    }
  },
};

// OAuth Handler Functions

async function handleGoogleAuth(url: URL, env: Env): Promise<Response> {
  const redirectUri = `${url.protocol}//${url.host}/auth/callback`;
  const state = generateSessionId(); // Generate state for CSRF protection
  
  // Store state in KV with short expiration (10 minutes)
  await env.SESSION_KV.put(`oauth_state:${state}`, 'pending', { expirationTtl: 600 });

  const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  googleAuthUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  googleAuthUrl.searchParams.set('redirect_uri', redirectUri);
  googleAuthUrl.searchParams.set('response_type', 'code');
  googleAuthUrl.searchParams.set('scope', 'openid email profile');
  googleAuthUrl.searchParams.set('state', state);
  googleAuthUrl.searchParams.set('access_type', 'online');
  googleAuthUrl.searchParams.set('prompt', 'select_account');

  return new Response(null, {
    status: 302,
    headers: {
      'Location': googleAuthUrl.toString(),
    },
  });
}

async function handleAuthCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Handle OAuth errors from Google
  if (error) {
    console.error('OAuth error from Google:', error);
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: '${error}' }, '*');
            window.close();
          </script>
          <p>Authentication failed. You can close this window.</p>
        </body>
      </html>
    `, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code || !state) {
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: 'Missing code or state' }, '*');
            window.close();
          </script>
          <p>Invalid request. You can close this window.</p>
        </body>
      </html>
    `, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Verify state to prevent CSRF
  const stateKey = `oauth_state:${state}`;
  const stateValue = await env.SESSION_KV.get(stateKey);
  if (!stateValue) {
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: 'Invalid or expired state' }, '*');
            window.close();
          </script>
          <p>Invalid or expired session. You can close this window.</p>
        </body>
      </html>
    `, {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  // Delete the used state
  await env.SESSION_KV.delete(stateKey);

  try {
    const redirectUri = `${url.protocol}//${url.host}/auth/callback`;
    const tokens = await exchangeCodeForTokens(code, redirectUri, env);
    const userInfo = await getGoogleUserInfo(tokens.id_token);

    // Verify email is verified
    if (!userInfo.email_verified) {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'Email not verified' }, '*');
              window.close();
            </script>
            <p>Email not verified. You can close this window.</p>
          </body>
        </html>
      `, {
        status: 403,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Verify email domain
    if (!validateEmailDomain(userInfo.email, env.ALLOWED_DOMAIN)) {
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head><title>Authentication Failed</title></head>
          <body>
            <script>
              window.opener.postMessage({ type: 'oauth-error', error: 'Unauthorized domain' }, '*');
              window.close();
            </script>
            <p>Access restricted to ${env.ALLOWED_DOMAIN} email addresses. You can close this window.</p>
          </body>
        </html>
      `, {
        status: 403,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Create session
    const { sessionId, session } = await createSession(userInfo, env);

    // Return HTML that posts message to parent window and sets cookie
    // SameSite=None is required for cross-domain cookies
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Successful</title></head>
        <body>
          <script>
            document.cookie = '${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Secure; SameSite=None; Max-Age=604800';
            window.opener.postMessage({ type: 'oauth-success', user: ${JSON.stringify(session).replace(/</g, '\\u003c')} }, '*');
            setTimeout(() => window.close(), 500);
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>
    `, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
        'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Secure; SameSite=None; Max-Age=604800`,
      },
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Failed</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'oauth-error', error: 'Authentication failed' }, '*');
            window.close();
          </script>
          <p>Authentication failed. You can close this window.</p>
        </body>
      </html>
    `, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

async function handleLogout(request: Request, env: Env): Promise<Response> {
  await clearSession(request, env);
  
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      ...getCorsHeaders(request),
      'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Secure; SameSite=None; Max-Age=0`,
    },
  });
}

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  // Check for agent auth first
  const agentAuth = validateAgentApiKey(request, env);
  if (agentAuth.valid && agentAuth.agentId) {
    return jsonResponse({ user: { type: 'agent', id: agentAuth.agentId, name: agentAuth.agentId } }, 200, request);
  }
  
  // Check for JWT Bearer token
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = await verifyJwtToken(token, env);
    if (payload) {
      // JWT token is valid - extract user info from payload
      const jwtUser = payload as { type: string; id: string; email?: string; name?: string };
      return jsonResponse({ 
        user: { 
          type: jwtUser.type,
          id: jwtUser.id,
          email: jwtUser.email || jwtUser.id,
          name: jwtUser.name || jwtUser.id
        } 
      }, 200, request);
    }
  }
  
  // Check for session cookie (OAuth)
  const session = await getSession(request, env);
  if (session) {
    return jsonResponse({ user: { type: 'human', ...session } }, 200, request);
  }
  
  // No valid authentication found
  return new Response(JSON.stringify({ error: 'Not authenticated' }), {
    status: 401,
    headers: getCorsHeaders(request),
  });
}

// JWT Login handler - exchanges API key or credentials for JWT tokens
async function handleJwtLogin(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as { api_key?: string; username?: string; password?: string };
    
    // Check for API key auth (for service accounts/agents)
    if (body.api_key && env.AGENT_API_KEY) {
      if (body.api_key === env.AGENT_API_KEY) {
        // Generate a JWT token for the agent
        const token = await generateJwtToken({ 
          type: 'agent', 
          id: 'service-account', 
          name: 'Service Account' 
        }, env);
        
        return jsonResponse({ 
          access_token: token,
          token_type: 'Bearer',
          expires_in: 3600,
          user: { type: 'agent', id: 'service-account', name: 'Service Account' }
        }, 200, request);
      }
      return errorResponse('Invalid API key', 401, request);
    }
    
    // Check for username/password auth (for admin user)
    if (body.username && body.password) {
      // For now, support admin@taskboard.local with a configured password
      // In production, this should query the database for user credentials
      const adminEmail = 'admin@taskboard.local';
      const adminPassword = env.ADMIN_PASSWORD || 'admin123'; // Default for testing
      
      if (body.username === adminEmail && body.password === adminPassword) {
        const token = await generateJwtToken({ 
          type: 'user', 
          id: 'admin', 
          email: adminEmail,
          name: 'Admin User' 
        }, env);
        
        return jsonResponse({ 
          access_token: token,
          token_type: 'Bearer',
          expires_in: 3600,
          user: { type: 'user', id: 'admin', email: adminEmail, name: 'Admin User' }
        }, 200, request);
      }
      return errorResponse('Invalid username or password', 401, request);
    }
    
    return errorResponse('Authentication required: provide api_key or username/password', 401, request);
  } catch (error) {
    console.error('[handleJwtLogin] Error:', error);
    console.error('[handleJwtLogin] Error stack:', (error as Error).stack);
    console.error('[handleJwtLogin] Env keys:', Object.keys(env).join(', '));
    return errorResponse('Login failed: ' + (error as Error).message, 500, request);
  }
}

// Generate a simple JWT-like token (base64-encoded signed payload)
async function generateJwtToken(payload: object, env: Env): Promise<string> {
  const encoder = new TextEncoder();
  const header = { alg: 'HS256', typ: 'JWT' };
  
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + 3600, // 1 hour expiration
  };
  
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payloadB64 = btoa(JSON.stringify(claims)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  
  const secret = env.JWT_SECRET || env.SESSION_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET or SESSION_SECRET not configured');
  }
  
  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  
  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

async function listTasks(env: Env, searchParams: URLSearchParams, request: Request): Promise<Response> {
  let sql = 'SELECT * FROM tasks';
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  // By default, filter out archived tasks unless archived=yes is specified
  const includeArchived = searchParams.get('archived') === 'yes';
  if (!includeArchived) {
    conditions.push('archived = 0');
  }

  // Filter by status
  const status = searchParams.get('status');
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  // Filter by assigned_to_agent
  const assigned = searchParams.get('assigned_to_agent');
  if (assigned !== null) {
    conditions.push('assigned_to_agent = ?');
    params.push(assigned === 'true' || assigned === '1' ? 1 : 0);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  // Order by priority desc, then by creation date
  sql += ' ORDER BY priority DESC, created_at DESC';

  const { results } = await env.DB.prepare(sql).bind(...params).all<Task>();
  return jsonResponse({ tasks: results || [] }, 200, request);
}

async function getTask(env: Env, id: number, request: Request): Promise<Response> {
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
  
  if (!task) {
    return errorResponse('Task not found', 404, request);
  }

  return jsonResponse({ task }, 200, request);
}

async function createTask(env: Env, request: Request): Promise<Response> {
  console.log('[createTask] Starting task creation...');
  
  try {
    let body: CreateTaskRequest;
    try {
      body = await request.json() as CreateTaskRequest;
      console.log('[createTask] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[createTask] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON: ' + (parseError as Error).message, 400);
    }

    // Validate required fields
    if (!body.name || body.name.trim() === '') {
      console.log('[createTask] Validation failed: name is empty');
      return errorResponse('Task name is required', 400);
    }

    // Validate status if provided
    const validStatuses = ['inbox', 'up_next', 'in_progress', 'in_review', 'done', 'archived'];
    const status = body.status || 'inbox';
    if (!validStatuses.includes(status)) {
      console.log(`[createTask] Validation failed: invalid status "${status}"`);
      return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
    }

    const name = body.name.trim();
    const description = body.description || null;
    const priority = body.priority ?? 0;
    const blocked = body.blocked ? 1 : 0;
    const assignedToAgent = body.assigned_to_agent ? 1 : 0;

    console.log('[createTask] Prepared values:', { name, description, status, priority, blocked, assignedToAgent });

    let result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO tasks (name, description, status, priority, blocked, assigned_to_agent) 
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(name, description, status, priority, blocked, assignedToAgent).run();
      console.log('[createTask] Insert result:', JSON.stringify(result));
    } catch (insertError) {
      console.error('[createTask] Database insert failed:', insertError);
      return errorResponse('Database insert failed: ' + (insertError as Error).message, 500);
    }

    const lastRowId = result.meta?.last_row_id;
    console.log('[createTask] Last row ID:', lastRowId);

    if (!lastRowId) {
      console.error('[createTask] No last_row_id returned from insert');
      return errorResponse('Failed to get created task ID', 500);
    }

    // Fetch the created task
    let task;
    try {
      task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
        .bind(lastRowId)
        .first<Task>();
      console.log('[createTask] Fetched created task:', JSON.stringify(task));
    } catch (fetchError) {
      console.error('[createTask] Failed to fetch created task:', fetchError);
      return errorResponse('Created task but failed to fetch it: ' + (fetchError as Error).message, 500);
    }

    if (!task) {
      console.error('[createTask] Created task not found in database');
      return errorResponse('Created task not found', 500);
    }

    console.log('[createTask] Successfully created task:', task.id);
    
    // Emit task.created event for SSE
    await emitTaskCreated(env, task);
    
    return jsonResponse({ task }, 201, request);
  } catch (error) {
    console.error('[createTask] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500, request);
  }
}

async function updateTask(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[updateTask] Starting update for task ID: ${id}`);
  
  try {
    // Check if task exists
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
    if (!existing) {
      console.log(`[updateTask] Task ${id} not found`);
      return errorResponse('Task not found', 404, request);
    }
    console.log(`[updateTask] Found existing task:`, JSON.stringify(existing));

    let body: UpdateTaskRequest;
    try {
      body = await request.json() as UpdateTaskRequest;
      console.log('[updateTask] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[updateTask] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON: ' + (parseError as Error).message, 400, request);
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    // Build dynamic update query
    if (body.name !== undefined) {
      if (body.name.trim() === '') {
        console.log('[updateTask] Validation failed: name cannot be empty');
        return errorResponse('Task name cannot be empty', 400, request);
      }
      updates.push('name = ?');
      values.push(body.name.trim());
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description || null);
    }

    if (body.status !== undefined) {
      const validStatuses = ['inbox', 'up_next', 'in_progress', 'in_review', 'done', 'archived'];
      if (!validStatuses.includes(body.status)) {
        console.log(`[updateTask] Validation failed: invalid status "${body.status}"`);
        return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400, request);
      }
      updates.push('status = ?');
      values.push(body.status);
  }

  if (body.priority !== undefined) {
    updates.push('priority = ?');
    values.push(body.priority);
  }

  if (body.blocked !== undefined) {
    updates.push('blocked = ?');
    values.push(body.blocked ? 1 : 0);
  }

  if (body.assigned_to_agent !== undefined) {
    updates.push('assigned_to_agent = ?');
    values.push(body.assigned_to_agent ? 1 : 0);
  }

  if (body.archived !== undefined) {
    updates.push('archived = ?');
    values.push(body.archived ? 1 : 0);
  }

  // Always update the updated_at timestamp
  updates.push('updated_at = CURRENT_TIMESTAMP');

  if (updates.length === 1) {
    console.log('[updateTask] No fields to update');
    return errorResponse('No fields to update', 400, request);
  }

  values.push(id);

  console.log(`[updateTask] Update query: SET ${updates.join(', ')} WHERE id = ?`);
  console.log('[updateTask] Values:', JSON.stringify(values));

  try {
    await env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    console.log('[updateTask] Update successful');
  } catch (updateError) {
    console.error('[updateTask] Database update failed:', updateError);
    return errorResponse('Database update failed: ' + (updateError as Error).message, 500, request);
  }

  // Fetch the updated task
  let task;
  try {
    task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
    console.log('[updateTask] Fetched updated task:', JSON.stringify(task));
  } catch (fetchError) {
    console.error('[updateTask] Failed to fetch updated task:', fetchError);
    return errorResponse('Updated task but failed to fetch it: ' + (fetchError as Error).message, 500, request);
  }

  console.log('[updateTask] Successfully updated task:', id);
  
  // Emit task.updated event for SSE (existing was fetched at start of function)
  if (task) {
    await emitTaskUpdated(env, task, existing);
  }
  
  return jsonResponse({ task }, 200, request);
  } catch (error) {
    console.error('[updateTask] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500, request);
  }
}

async function deleteTask(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[deleteTask] Starting delete for task ID: ${id}`);
  
  try {
    // Check if task exists
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
    if (!existing) {
      console.log(`[deleteTask] Task ${id} not found`);
      return errorResponse('Task not found', 404, request);
    }
    console.log(`[deleteTask] Found task to delete:`, JSON.stringify(existing));

    try {
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
      console.log(`[deleteTask] Task ${id} deleted successfully`);
      
      // Emit task.deleted event for SSE
      await emitTaskDeleted(env, id);
      
      return jsonResponse({ success: true, message: 'Task deleted' }, 200, request);
    } catch (deleteError) {
      console.error('[deleteTask] Database delete failed:', deleteError);
      return errorResponse('Database delete failed: ' + (deleteError as Error).message, 500, request);
    }
  } catch (error) {
    console.error('[deleteTask] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500, request);
  }
}

// Archive all closed tasks (admin only)
async function archiveClosedTasks(env: Env, request: Request): Promise<Response> {
  console.log('[archiveClosedTasks] Starting archive of closed tasks');
  
  try {
    // Check admin authentication
    const user = await validateAdminAuth(request, env);
    if (!user) {
      console.log('[archiveClosedTasks] Admin authentication failed');
      return errorResponse('Forbidden: Admin access required', 403, request);
    }
    console.log(`[archiveClosedTasks] Admin authenticated: ${user.id}`);

    // Count tasks that will be archived (done tasks that are not already archived)
    const countResult = await env.DB.prepare(
      'SELECT COUNT(*) as count FROM tasks WHERE status = ? AND archived = 0'
    ).bind('done').first<{ count: number }>();
    
    const taskCount = countResult?.count || 0;
    console.log(`[archiveClosedTasks] Found ${taskCount} tasks to archive`);
    
    if (taskCount === 0) {
      return jsonResponse({ 
        success: true, 
        archived_count: 0, 
        message: 'No closed tasks to archive' 
      }, 200, request);
    }

    // Update all done tasks to set archived=1 (keep status as 'done')
    const updateResult = await env.DB.prepare(
      'UPDATE tasks SET archived = 1, updated_at = CURRENT_TIMESTAMP WHERE status = ? AND archived = 0'
    ).bind('done').run();
    
    const archivedCount = updateResult.meta?.changes || taskCount;
    console.log(`[archiveClosedTasks] Successfully archived ${archivedCount} tasks`);
    
    return jsonResponse({ 
      success: true, 
      archived_count: archivedCount, 
      message: `${archivedCount} task(s) archived successfully` 
    }, 200, request);
    
  } catch (error) {
    console.error('[archiveClosedTasks] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500, request);
  }
}

// Helper function to validate admin authentication
async function validateAdminAuth(request: Request, env: Env): Promise<{ id: string; email: string; name: string } | null> {
  // Check for Agent API Key (agents have admin-like privileges)
  const agentAuth = validateAgentApiKey(request, env);
  if (agentAuth.valid && agentAuth.agentId) {
    return { id: agentAuth.agentId, email: agentAuth.agentId, name: agentAuth.agentId };
  }
  
  // Check for JWT Bearer token with admin role
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = await verifyJwtToken(token, env);
    if (payload) {
      const jwtUser = payload as { type: string; id: string; email?: string; name?: string };
      // Accept any authenticated JWT user as admin for now
      return { 
        id: jwtUser.id, 
        email: jwtUser.email || jwtUser.id, 
        name: jwtUser.name || jwtUser.id 
      };
    }
  }
  
  // Check for session cookie (OAuth) with allowed domain
  const session = await getSession(request, env);
  if (session && session.email?.toLowerCase().endsWith(`@${env.ALLOWED_DOMAIN.toLowerCase()}`)) {
    return { id: session.userId, email: session.email, name: session.name };
  }
  
  return null;
}

// Cron Job Functions

async function listCronJobs(env: Env, request: Request): Promise<Response> {
  try {
    console.log('[listCronJobs] Querying cron_jobs table...');
    const { results } = await env.DB.prepare(
      'SELECT * FROM cron_jobs ORDER BY created_at DESC'
    ).all<CronJob>();
    console.log('[listCronJobs] Results:', results);
    return jsonResponse({ cronJobs: results || [] }, 200, request);
  } catch (error) {
    console.error('[listCronJobs] Error:', error);
    return errorResponse('Database error: ' + (error as Error).message, 500, request);
  }
}

async function getCronJob(env: Env, id: number, request: Request): Promise<Response> {
  const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
    .bind(id)
    .first<CronJob>();
  
  if (!cronJob) {
    return errorResponse('Cron job not found', 404, request);
  }

  return jsonResponse({ cronJob }, 200, request);
}

async function createCronJob(env: Env, request: Request): Promise<Response> {
  console.log('[createCronJob] Starting cron job creation...');
  
  try {
    let body: CreateCronJobRequest;
    try {
      body = await request.json() as CreateCronJobRequest;
      console.log('[createCronJob] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[createCronJob] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON in request body: ' + (parseError as Error).message, 400);
    }

    // Validate required fields
    if (!body.name || body.name.trim() === '') {
      console.log('[createCronJob] Validation failed: name is empty');
      return errorResponse('Cron job name is required', 400);
    }

    if (!body.schedule || body.schedule.trim() === '') {
      console.log('[createCronJob] Validation failed: schedule is empty');
      return errorResponse('Schedule is required', 400);
    }

    // Validate OpenClaw configuration fields
    const payloadValidation = validatePayload(body.payload);
    if (!payloadValidation.valid) {
      console.log('[createCronJob] Validation failed:', payloadValidation.error);
      return errorResponse(payloadValidation.error!, 400);
    }

    const modelValidation = validateModel(body.model);
    if (!modelValidation.valid) {
      console.log('[createCronJob] Validation failed:', modelValidation.error);
      return errorResponse(modelValidation.error!, 400);
    }

    const thinkingValidation = validateThinking(body.thinking);
    if (!thinkingValidation.valid) {
      console.log('[createCronJob] Validation failed:', thinkingValidation.error);
      return errorResponse(thinkingValidation.error!, 400);
    }

    const timeoutValidation = validateTimeoutSeconds(body.timeout_seconds);
    if (!timeoutValidation.valid) {
      console.log('[createCronJob] Validation failed:', timeoutValidation.error);
      return errorResponse(timeoutValidation.error!, 400);
    }

    const deliverValidation = validateDeliver(body.deliver);
    if (!deliverValidation.valid) {
      console.log('[createCronJob] Validation failed:', deliverValidation.error);
      return errorResponse(deliverValidation.error!, 400);
    }

    const name = body.name.trim();
    const description = body.description || null;
    const schedule = body.schedule.trim();
    const lastStatus = body.last_status || 'pending';
    
    // OpenClaw configuration with defaults
    const payload = body.payload.trim();
    const model = body.model || 'google/gemini-3-flash-preview';
    const thinking = body.thinking || 'low';
    const timeoutSeconds = body.timeout_seconds ?? 300;
    const deliver = body.deliver ?? true;

    console.log('[createCronJob] Prepared values:', { 
      name, description, schedule,
      lastStatus, payload: payload.substring(0, 50) + '...', model, thinking, timeoutSeconds, deliver 
    });

    let result;
    try {
      result = await env.DB.prepare(
        `INSERT INTO cron_jobs (name, description, schedule, 
         payload, model, thinking, timeout_seconds, deliver, last_status) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        name, description, schedule, 
        payload, model, thinking, timeoutSeconds, deliver ? 1 : 0, lastStatus
      ).run();
      console.log('[createCronJob] Insert result:', JSON.stringify(result));
    } catch (insertError) {
      console.error('[createCronJob] Database insert failed:', insertError);
      return errorResponse('Database insert failed: ' + (insertError as Error).message, 500);
    }

    const lastRowId = result.meta?.last_row_id;
    console.log('[createCronJob] Last row ID:', lastRowId);

    if (!lastRowId) {
      console.error('[createCronJob] No last_row_id returned from insert');
      return errorResponse('Failed to get created cron job ID', 500);
    }

    // Fetch the created cron job
    let cronJob;
    try {
      cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
        .bind(lastRowId)
        .first<CronJob>();
      console.log('[createCronJob] Fetched created cron job:', JSON.stringify(cronJob));
    } catch (fetchError) {
      console.error('[createCronJob] Failed to fetch created cron job:', fetchError);
      return errorResponse('Created cron job but failed to fetch it: ' + (fetchError as Error).message, 500);
    }

    if (!cronJob) {
      console.error('[createCronJob] Created cron job not found in database');
      return errorResponse('Created cron job not found', 500);
    }

    console.log('[createCronJob] Successfully created cron job:', cronJob.id);
    return jsonResponse({ cronJob }, 201);
  } catch (error) {
    console.error('[createCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

async function updateCronJob(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[updateCronJob] Starting update for cron job ID: ${id}`);
  
  try {
    // Check if cron job exists
    const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    if (!existing) {
      console.log(`[updateCronJob] Cron job ${id} not found`);
      return errorResponse('Cron job not found', 404);
    }
    console.log(`[updateCronJob] Found existing cron job:`, JSON.stringify(existing));

    let body: Partial<UpdateCronJobRequest>;
    try {
      body = await request.json() as Partial<UpdateCronJobRequest>;
      console.log('[updateCronJob] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[updateCronJob] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON in request body: ' + (parseError as Error).message, 400);
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    // Build dynamic update query
    if (body.name !== undefined) {
      if (body.name.trim() === '') {
        console.log('[updateCronJob] Validation failed: name cannot be empty');
        return errorResponse('Cron job name cannot be empty', 400);
      }
      updates.push('name = ?');
      values.push(body.name.trim());
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description || null);
    }

    if (body.schedule !== undefined) {
      updates.push('schedule = ?');
      values.push(body.schedule.trim());
    }

    // OpenClaw configuration updates
    if (body.payload !== undefined) {
      const payloadValidation = validatePayload(body.payload);
      if (!payloadValidation.valid) {
        console.log('[updateCronJob] Validation failed:', payloadValidation.error);
        return errorResponse(payloadValidation.error!, 400);
      }
      updates.push('payload = ?');
      values.push(body.payload.trim());
    }

    if (body.model !== undefined) {
      const modelValidation = validateModel(body.model);
      if (!modelValidation.valid) {
        console.log('[updateCronJob] Validation failed:', modelValidation.error);
        return errorResponse(modelValidation.error!, 400);
      }
      updates.push('model = ?');
      values.push(body.model);
    }

    if (body.thinking !== undefined) {
      const thinkingValidation = validateThinking(body.thinking);
      if (!thinkingValidation.valid) {
        console.log('[updateCronJob] Validation failed:', thinkingValidation.error);
        return errorResponse(thinkingValidation.error!, 400);
      }
      updates.push('thinking = ?');
      values.push(body.thinking);
    }

    if (body.timeout_seconds !== undefined) {
      const timeoutValidation = validateTimeoutSeconds(body.timeout_seconds);
      if (!timeoutValidation.valid) {
        console.log('[updateCronJob] Validation failed:', timeoutValidation.error);
        return errorResponse(timeoutValidation.error!, 400);
      }
      updates.push('timeout_seconds = ?');
      values.push(body.timeout_seconds);
    }

    if (body.deliver !== undefined) {
      const deliverValidation = validateDeliver(body.deliver);
      if (!deliverValidation.valid) {
        console.log('[updateCronJob] Validation failed:', deliverValidation.error);
        return errorResponse(deliverValidation.error!, 400);
      }
      updates.push('deliver = ?');
      values.push(body.deliver ? 1 : 0);
    }

    if (body.last_status !== undefined) {
      updates.push('last_status = ?');
      values.push(body.last_status);
    }

    if (body.last_run_at !== undefined) {
      updates.push('last_run_at = ?');
      values.push(body.last_run_at);
    }

    if (body.next_run_at !== undefined) {
      updates.push('next_run_at = ?');
      values.push(body.next_run_at);
    }

    // Always update the updated_at timestamp
    updates.push('updated_at = CURRENT_TIMESTAMP');

    if (updates.length === 1) {
      console.log('[updateCronJob] No fields to update');
      return errorResponse('No fields to update', 400);
    }

    values.push(id);
    console.log(`[updateCronJob] Update query: SET ${updates.join(', ')} WHERE id = ?`);
    console.log('[updateCronJob] Values:', JSON.stringify(values));

    try {
      await env.DB.prepare(`UPDATE cron_jobs SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
      console.log('[updateCronJob] Update successful');
    } catch (updateError) {
      console.error('[updateCronJob] Database update failed:', updateError);
      return errorResponse('Database update failed: ' + (updateError as Error).message, 500);
    }

    // Fetch the updated cron job
    const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    console.log('[updateCronJob] Fetched updated cron job:', JSON.stringify(cronJob));
    return jsonResponse({ cronJob });
  } catch (error) {
    console.error('[updateCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

async function deleteCronJob(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[deleteCronJob] Starting delete for cron job ID: ${id}`);
  
  try {
    // Check if cron job exists
    const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    if (!existing) {
      console.log(`[deleteCronJob] Cron job ${id} not found`);
      return errorResponse('Cron job not found', 404, request);
    }
    console.log(`[deleteCronJob] Found cron job to delete:`, JSON.stringify(existing));

    try {
      // Delete related runs first
      const runsResult = await env.DB.prepare('DELETE FROM cron_job_runs WHERE cron_job_id = ?').bind(id).run();
      console.log(`[deleteCronJob] Deleted ${runsResult.meta?.changes || 0} related run records`);
      
      // Delete the cron job
      await env.DB.prepare('DELETE FROM cron_jobs WHERE id = ?').bind(id).run();
      console.log(`[deleteCronJob] Cron job ${id} deleted successfully`);
      
      return jsonResponse({ success: true, message: 'Cron job deleted' }, 200, request);
    } catch (deleteError) {
      console.error('[deleteCronJob] Database delete failed:', deleteError);
      return errorResponse('Database delete failed: ' + (deleteError as Error).message, 500, request);
    }
  } catch (error) {
    console.error('[deleteCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500, request);
  }
}

async function startCronJob(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[startCronJob] Starting cron job ID: ${id}`);
  
  try {
    // Check if cron job exists
    const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    if (!existing) {
      console.log(`[startCronJob] Cron job ${id} not found`);
      return errorResponse('Cron job not found', 404, request);
    }
    console.log(`[startCronJob] Found cron job:`, JSON.stringify(existing));

    const now = new Date().toISOString();
    console.log(`[startCronJob] Setting last_run_at to: ${now}`);

    try {
      // Update cron job status to running
      await env.DB.prepare(
        `UPDATE cron_jobs 
         SET last_run_at = ?, last_status = 'running', last_output = NULL 
         WHERE id = ?`
      ).bind(now, id).run();
      console.log('[startCronJob] Cron job updated to running status');

      // Create a run record
      const runResult = await env.DB.prepare(
        `INSERT INTO cron_job_runs (cron_job_id, started_at, status) 
         VALUES (?, ?, 'running')`
      ).bind(id, now).run();
      console.log(`[startCronJob] Created run record, ID: ${runResult.meta?.last_row_id}`);

      // Fetch the updated cron job
      const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
      console.log('[startCronJob] Cron job started successfully:', JSON.stringify(cronJob));
      return jsonResponse({ cronJob, message: 'Cron job started' }, 200, request);
    } catch (dbError) {
      console.error('[startCronJob] Database operation failed:', dbError);
      return errorResponse('Database operation failed: ' + (dbError as Error).message, 500, request);
    }
  } catch (error) {
    console.error('[startCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500, request);
  }
}

async function endCronJob(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[endCronJob] Ending cron job ID: ${id}`);
  
  try {
    // Check if cron job exists
    const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    if (!existing) {
      console.log(`[endCronJob] Cron job ${id} not found`);
      return errorResponse('Cron job not found', 404);
    }
    console.log(`[endCronJob] Found cron job:`, JSON.stringify(existing));

    let body: EndCronJobRequest;
    try {
      body = await request.json() as EndCronJobRequest;
      console.log('[endCronJob] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[endCronJob] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON in request body: ' + (parseError as Error).message, 400);
    }

    // Validate status
    const validEndStatuses: CronJobStatus[] = ['done', 'error'];
    const status = body.status;
    if (!validEndStatuses.includes(status)) {
      console.log(`[endCronJob] Invalid status: ${status}`);
      return errorResponse(`Invalid status. Must be one of: ${validEndStatuses.join(', ')}`, 400);
    }

    const now = new Date().toISOString();
    const output = body.output || null;
    console.log(`[endCronJob] Setting status to: ${status}, ended_at: ${now}`);

    try {
      // Update cron job
      await env.DB.prepare(
        `UPDATE cron_jobs 
         SET last_status = ?, last_output = ? 
         WHERE id = ?`
      ).bind(status, output, id).run();
      console.log('[endCronJob] Cron job status updated');

      // Update the latest run record
      const updateResult = await env.DB.prepare(
        `UPDATE cron_job_runs 
         SET ended_at = ?, status = ?, output = ? 
         WHERE cron_job_id = ? AND status = 'running'
         ORDER BY started_at DESC
         LIMIT 1`
      ).bind(now, status, output, id).run();
      console.log(`[endCronJob] Updated ${updateResult.meta?.changes || 0} run record(s)`);

      // Fetch the updated cron job
      const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
      console.log('[endCronJob] Cron job ended successfully:', JSON.stringify(cronJob));
      return jsonResponse({ cronJob, message: `Cron job marked as ${status}` });
    } catch (dbError) {
      console.error('[endCronJob] Database operation failed:', dbError);
      return errorResponse('Database operation failed: ' + (dbError as Error).message, 500);
    }
  } catch (error) {
    console.error('[endCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

async function listCronJobRuns(env: Env, id: number, request: Request): Promise<Response> {
  // Check if cron job exists
  const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  if (!existing) {
    return errorResponse('Cron job not found', 404, request);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM cron_job_runs WHERE cron_job_id = ? ORDER BY started_at DESC LIMIT 50'
  ).bind(id).all<CronJobRun>();

  return jsonResponse({ runs: results || [] }, 200, request);
}

async function syncCronJobs(env: Env, request: Request): Promise<Response> {
  console.log('[syncCronJobs] Starting sync...');
  
  try {
    let body: { cronJobs: CreateCronJobRequest[] };
    try {
      body = await request.json() as { cronJobs: CreateCronJobRequest[] };
      console.log(`[syncCronJobs] Received ${body.cronJobs?.length || 0} cron jobs to sync`);
    } catch (parseError) {
      console.error('[syncCronJobs] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON: ' + (parseError as Error).message, 400);
    }
    
    if (!body.cronJobs || !Array.isArray(body.cronJobs)) {
      console.log('[syncCronJobs] Invalid request: cronJobs is not an array');
      return errorResponse('Invalid request: cronJobs array required', 400);
    }

    console.log('[syncCronJobs] Deleting existing cron jobs and runs...');
    try {
      // Delete all existing cron jobs and runs
      const deleteRunsResult = await env.DB.prepare('DELETE FROM cron_job_runs').run();
      const deleteJobsResult = await env.DB.prepare('DELETE FROM cron_jobs').run();
      console.log(`[syncCronJobs] Deleted ${deleteRunsResult.meta?.changes || 0} runs, ${deleteJobsResult.meta?.changes || 0} jobs`);
    } catch (deleteError) {
      console.error('[syncCronJobs] Failed to delete existing jobs:', deleteError);
      return errorResponse('Failed to clear existing jobs: ' + (deleteError as Error).message, 500);
    }

    // Insert new cron jobs
    const inserted: CronJob[] = [];
    console.log(`[syncCronJobs] Inserting ${body.cronJobs.length} cron jobs...`);
    
    for (let i = 0; i < body.cronJobs.length; i++) {
      const job = body.cronJobs[i];
      console.log(`[syncCronJobs] Inserting job ${i + 1}/${body.cronJobs.length}: ${job.name}`);
      
      // Validate payload if provided
      if (job.payload !== undefined) {
        const payloadValidation = validatePayload(job.payload);
        if (!payloadValidation.valid) {
          console.error(`[syncCronJobs] Job ${job.name} has invalid payload:`, payloadValidation.error);
          return errorResponse(`Job "${job.name}": ${payloadValidation.error}`, 400);
        }
      }

      // Validate model if provided
      if (job.model !== undefined) {
        const modelValidation = validateModel(job.model);
        if (!modelValidation.valid) {
          console.error(`[syncCronJobs] Job ${job.name} has invalid model:`, modelValidation.error);
          return errorResponse(`Job "${job.name}": ${modelValidation.error}`, 400);
        }
      }

      // Validate thinking if provided
      if (job.thinking !== undefined) {
        const thinkingValidation = validateThinking(job.thinking);
        if (!thinkingValidation.valid) {
          console.error(`[syncCronJobs] Job ${job.name} has invalid thinking:`, thinkingValidation.error);
          return errorResponse(`Job "${job.name}": ${thinkingValidation.error}`, 400);
        }
      }

      // Validate timeout if provided
      if (job.timeout_seconds !== undefined) {
        const timeoutValidation = validateTimeoutSeconds(job.timeout_seconds);
        if (!timeoutValidation.valid) {
          console.error(`[syncCronJobs] Job ${job.name} has invalid timeout:`, timeoutValidation.error);
          return errorResponse(`Job "${job.name}": ${timeoutValidation.error}`, 400);
        }
      }

      // Validate deliver if provided
      if (job.deliver !== undefined) {
        const deliverValidation = validateDeliver(job.deliver);
        if (!deliverValidation.valid) {
          console.error(`[syncCronJobs] Job ${job.name} has invalid deliver:`, deliverValidation.error);
          return errorResponse(`Job "${job.name}": ${deliverValidation.error}`, 400);
        }
      }
      
      try {
        const payload = job.payload?.trim() || 'Task instructions not yet configured. Edit this job to add task instructions.';
        const model = job.model || 'google/gemini-3-flash-preview';
        const thinking = job.thinking || 'low';
        const timeoutSeconds = job.timeout_seconds ?? 300;
        const deliver = job.deliver ?? true;

        const result = await env.DB.prepare(
          `INSERT INTO cron_jobs (name, description, schedule, 
           payload, model, thinking, timeout_seconds, deliver, last_status) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          job.name,
          job.description || null,
          job.schedule,
          payload,
          model,
          thinking,
          timeoutSeconds,
          deliver ? 1 : 0,
          job.last_status || 'pending'
        ).run();
        console.log(`[syncCronJobs] Job ${job.name} inserted, row ID: ${result.meta?.last_row_id}`);

        const newJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
          .bind(result.meta.last_row_id as number)
          .first<CronJob>();
        if (newJob) {
          inserted.push(newJob);
          console.log(`[syncCronJobs] Job ${job.name} fetched and added to results`);
        }
      } catch (insertError) {
        console.error(`[syncCronJobs] Failed to insert job ${job.name}:`, insertError);
        return errorResponse(`Failed to insert job "${job.name}": ` + (insertError as Error).message, 500);
      }
    }

    console.log(`[syncCronJobs] Sync completed. Inserted ${inserted.length} jobs.`);
    return jsonResponse({ 
      message: 'Cron jobs synced', 
      count: inserted.length,
      cronJobs: inserted 
    }, 201);
  } catch (error) {
    console.error('[syncCronJobs] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

// ============================================================================
// COMMENT SYSTEM HELPER FUNCTIONS
// ============================================================================

/**
 * Parse @mentions from content
 * Returns array of mentioned user identifiers (without the @ symbol)
 */
function parseMentions(content: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
  const mentions: string[] = [];
  let match;
  while ((match = mentionRegex.exec(content)) !== null) {
    mentions.push(match[1]);
  }
  return [...new Set(mentions)]; // Remove duplicates
}

/**
 * Create notifications for mentions in a comment
 */
async function createNotificationsForMentions(
  env: Env,
  mentions: string[],
  taskId: number,
  commentId: number,
  excludeUserId: string
): Promise<void> {
  for (const mention of mentions) {
    // Skip if the mentioned user is the comment author
    if (mention === excludeUserId) continue;

    try {
      await env.DB.prepare(
        `INSERT INTO comment_notifications (user_id, type, task_id, comment_id)
         VALUES (?, 'mention', ?, ?)`
      ).bind(mention, taskId, commentId).run();
      // Broadcast notification via SSE to the mentioned user
      await broadcastNotification(env, { type: 'mention', task_id: taskId, comment_id: commentId, user_id: mention }, mention);
    } catch (error) {
      console.error(`[createNotificationsForMentions] Failed to create notification for ${mention}:`, error);
      // Continue creating other notifications
    }
  }
}

/**
 * Create a notification for a reply to a comment
 */
async function createReplyNotification(
  env: Env,
  parentAuthorId: string,
  taskId: number,
  commentId: number,
  replyAuthorId: string
): Promise<void> {
  // Don't notify if replying to your own comment
  if (parentAuthorId === replyAuthorId) return;
  
  try {
    await env.DB.prepare(
      `INSERT INTO comment_notifications (user_id, type, task_id, comment_id)
       VALUES (?, 'reply', ?, ?)`
    ).bind(parentAuthorId, taskId, commentId).run();
    // Broadcast notification via SSE to the parent comment author
    await broadcastNotification(env, { type: 'reply', task_id: taskId, comment_id: commentId, user_id: parentAuthorId }, parentAuthorId);
  } catch (error) {
    console.error(`[createReplyNotification] Failed to create reply notification:`, error);
  }
}

/**
 * Create a notification for agent comments
 */
async function createAgentCommentNotification(
  env: Env,
  taskId: number,
  commentId: number,
  taskCreatorId?: string
): Promise<void> {
  if (!taskCreatorId) return;
  
  try {
    await env.DB.prepare(
      `INSERT INTO comment_notifications (user_id, type, task_id, comment_id)
       VALUES (?, 'agent_comment', ?, ?)`
    ).bind(taskCreatorId, taskId, commentId).run();
    // Broadcast notification via SSE to the task creator
    await broadcastNotification(env, { type: 'agent_comment', task_id: taskId, comment_id: commentId, user_id: taskCreatorId }, taskCreatorId);
  } catch (error) {
    console.error(`[createAgentCommentNotification] Failed to create agent comment notification:`, error);
  }
}

// Stub implementations for comment and notification handlers (TODO: implement fully)

/**
 * List comments for a task with nested replies and reactions
 */
async function listComments(env: Env, taskId: number, request: Request): Promise<Response> {
  try {
    // Get all top-level comments (no parent)
    const topLevelComments = await env.DB.prepare(
      `SELECT * FROM comments 
       WHERE task_id = ? AND parent_comment_id IS NULL AND is_deleted = 0
       ORDER BY created_at ASC`
    ).bind(taskId).all<Comment>();

    const comments = topLevelComments.results || [];

    // For each comment, get replies and reactions
    for (const comment of comments) {
      // Get replies
      const replies = await env.DB.prepare(
        `SELECT * FROM comments 
         WHERE parent_comment_id = ? AND is_deleted = 0
         ORDER BY created_at ASC`
      ).bind(comment.id).all<Comment>();

      comment.replies = replies.results || [];

      // Get reactions for the main comment
      const reactions = await env.DB.prepare(
        `SELECT * FROM comment_reactions WHERE comment_id = ? ORDER BY created_at ASC`
      ).bind(comment.id).all<CommentReaction>();

      comment.reactions = reactions.results || [];

      // Get reactions for each reply
      for (const reply of comment.replies) {
        const replyReactions = await env.DB.prepare(
          `SELECT * FROM comment_reactions WHERE comment_id = ? ORDER BY created_at ASC`
        ).bind(reply.id).all<CommentReaction>();

        reply.reactions = replyReactions.results || [];
      }
    }

    return jsonResponse({ comments }, 200, request);
  } catch (error) {
    console.error('[listComments] Error:', error);
    return errorResponse('Failed to fetch comments', 500, request);
  }
}

/**
 * Create a new comment on a task
 */
async function createComment(env: Env, taskId: number, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401, request);
    }

    // Parse request body
    const body = await request.json() as CreateCommentRequest;
    const { content, parent_comment_id } = body;

    // Validate content
    if (!content || content.trim().length === 0) {
      return errorResponse('Content is required', 400, request);
    }
    if (content.length > 2000) {
      return errorResponse('Content must be less than 2000 characters', 400, request);
    }

    // Parse mentions
    const mentions = parseMentions(content);
    const mentionsJson = mentions.length > 0 ? JSON.stringify(mentions) : null;

    // Insert comment
    const result = await env.DB.prepare(
      `INSERT INTO comments 
       (task_id, parent_comment_id, author_type, author_id, author_name, content, mentions)
       VALUES (?, ?, 'human', ?, ?, ?, ?)`
    ).bind(taskId, parent_comment_id || null, user.id, user.name, content, mentionsJson).run();

    const commentId = result.meta?.last_row_id;
    if (!commentId) {
      return errorResponse('Failed to create comment', 500, request);
    }

    // Create notifications for mentions
    if (mentions.length > 0) {
      await createNotificationsForMentions(env, mentions, taskId, commentId, user.id);
    }

    // If this is a reply, notify the parent comment author
    if (parent_comment_id) {
      const parentComment = await env.DB.prepare(
        'SELECT author_id, author_type FROM comments WHERE id = ?'
      ).bind(parent_comment_id).first<{ author_id: string; author_type: AuthorType }>();

      if (parentComment && parentComment.author_type === 'human') {
        await createReplyNotification(env, parentComment.author_id, taskId, commentId, user.id);
      }
    }

    // Increment comment_count on the task
    await env.DB.prepare(
      `UPDATE tasks SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(taskId).run();

    // Fetch the created comment
    const comment = await env.DB.prepare(
      'SELECT * FROM comments WHERE id = ?'
    ).bind(commentId).first<Comment>();

    // Broadcast comment created via SSE so other viewers see it in real-time
    if (comment) {
      await broadcastCommentCreated(env, comment as unknown as Record<string, unknown>, taskId);
    }

    return jsonResponse({ comment }, 201, request);
  } catch (error) {
    console.error('[createComment] Error:', error);
    return errorResponse('Failed to create comment', 500, request);
  }
}

/**
 * Create an agent comment on a task (agent API only)
 */
async function createAgentComment(env: Env, taskId: number, request: Request): Promise<Response> {
  try {
    // Validate Agent API Key
    const agentAuth = validateAgentApiKey(request, env);
    if (!agentAuth.valid) {
      return errorResponse('Unauthorized - Invalid API Key', 401, request);
    }

    const agentId = agentAuth.agentId || 'agent';

    // Parse request body
    const body = await request.json() as CreateAgentCommentRequest;
    const { content, agent_comment_type, mentions, auth_token } = body;

    // Validate content
    if (!content || content.trim().length === 0) {
      return errorResponse('Content is required', 400, request);
    }
    if (content.length > 2000) {
      return errorResponse('Content must be less than 2000 characters', 400, request);
    }

    // Parse mentions (from provided list or parse from content)
    const mentionList = mentions || parseMentions(content);
    const mentionsJson = mentionList.length > 0 ? JSON.stringify(mentionList) : null;

    // Insert comment with agent_comment_type
    const commentType = agent_comment_type || 'generic';
    const result = await env.DB.prepare(
      `INSERT INTO comments 
       (task_id, parent_comment_id, author_type, author_id, author_name, content, agent_comment_type, mentions)
       VALUES (?, NULL, 'agent', ?, ?, ?, ?, ?)`
    ).bind(taskId, agentId, agentId, content, commentType, mentionsJson).run();

    const commentId = result.meta?.last_row_id;
    if (!commentId) {
      return errorResponse('Failed to create agent comment', 500, request);
    }

    // Create notifications for mentions
    if (mentionList.length > 0) {
      await createNotificationsForMentions(env, mentionList, taskId, commentId, agentId);
    }

    // Notify task creator about agent comment (if we can determine creator)
    const task = await env.DB.prepare(
      'SELECT created_by FROM tasks WHERE id = ?'
    ).bind(taskId).first<{ created_by: string | null }>();

    if (task?.created_by) {
      await createAgentCommentNotification(env, taskId, commentId, task.created_by);
    }

    // Increment comment_count on the task
    await env.DB.prepare(
      `UPDATE tasks SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(taskId).run();

    // Fetch the created comment
    const comment = await env.DB.prepare(
      'SELECT * FROM comments WHERE id = ?'
    ).bind(commentId).first<Comment>();

    // Broadcast comment created via SSE
    if (comment) {
      await broadcastCommentCreated(env, comment as unknown as Record<string, unknown>, taskId);
    }

    return jsonResponse({ comment }, 201, request);
  } catch (error) {
    console.error('[createAgentComment] Error:', error);
    return errorResponse('Failed to create agent comment', 500, request);
  }
}

/**
 * Claim a task for an agent (update status and create system comment)
 */
async function claimTask(env: Env, taskId: number, request: Request): Promise<Response> {
  try {
    // Validate Agent API Key
    const agentAuth = validateAgentApiKey(request, env);
    if (!agentAuth.valid) {
      return errorResponse('Unauthorized - Invalid API Key', 401, request);
    }

    const agentId = agentAuth.agentId || 'agent';

    // Parse request body
    const body = await request.json() as ClaimTaskRequest;
    const { agent_id, auth_token } = body;

    // Update task to claimed status
    await env.DB.prepare(
      `UPDATE tasks SET 
       status = 'in_progress', 
       assigned_to_agent = 1,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(taskId).run();

    // Create a system comment indicating the task was claimed
    const claimMessage = `🔒 Task claimed by ${agent_id || agentId}`;
    const result = await env.DB.prepare(
      `INSERT INTO comments 
       (task_id, parent_comment_id, author_type, author_id, author_name, content, agent_comment_type)
       VALUES (?, NULL, 'system', 'system', 'System', ?, 'status_update')`
    ).bind(taskId, claimMessage).run();

    const commentId = result.meta?.last_row_id;

    // Increment comment_count on the task for system comment
    await env.DB.prepare(
      `UPDATE tasks SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(taskId).run();

    // Notify task creator
    const task = await env.DB.prepare(
      'SELECT created_by FROM tasks WHERE id = ?'
    ).bind(taskId).first<{ created_by: string | null }>();

    if (task?.created_by) {
      await createAgentCommentNotification(env, taskId, commentId || 0, task.created_by);
    }

    return jsonResponse({ 
      message: 'Task claimed successfully', 
      agent_id: agent_id || agentId,
      comment_id: commentId
    }, 200, request);
  } catch (error) {
    console.error('[claimTask] Error:', error);
    return errorResponse('Failed to claim task', 500, request);
  }
}

async function releaseTask(env: Env, taskId: number, request: Request): Promise<Response> {
  try {
    // Validate Agent API Key
    const agentAuth = validateAgentApiKey(request, env);
    if (!agentAuth.valid) {
      return errorResponse('Unauthorized - Invalid API Key', 401, request);
    }

    const agentId = agentAuth.agentId || 'agent';

    // Verify task exists and is currently claimed
    const task = await env.DB.prepare(
      'SELECT * FROM tasks WHERE id = ?'
    ).bind(taskId).first<Task>();

    if (!task) {
      return errorResponse('Task not found', 404, request);
    }

    if (!task.assigned_to_agent) {
      return errorResponse('Task is not currently claimed by an agent', 400, request);
    }

    // Release the task - unassign agent, move back to inbox
    await env.DB.prepare(
      `UPDATE tasks SET
       assigned_to_agent = 0,
       status = 'inbox',
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(taskId).run();

    // Create a system comment indicating the task was released
    const releaseMessage = `🔓 Task released by ${agentId}`;
    const result = await env.DB.prepare(
      `INSERT INTO comments
       (task_id, parent_comment_id, author_type, author_id, author_name, content, agent_comment_type)
       VALUES (?, NULL, 'system', 'system', 'System', ?, 'status_update')`
    ).bind(taskId, releaseMessage).run();

    const commentId = result.meta?.last_row_id;

    // Increment comment_count
    await env.DB.prepare(
      `UPDATE tasks SET comment_count = comment_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(taskId).run();

    // Notify task creator
    if (task.created_by) {
      await createAgentCommentNotification(env, taskId, commentId || 0, task.created_by);
    }

    return jsonResponse({
      message: 'Task released successfully',
      agent_id: agentId,
      comment_id: commentId
    }, 200, request);
  } catch (error) {
    console.error('[releaseTask] Error:', error);
    return errorResponse('Failed to release task', 500, request);
  }
}

/**
 * Update an existing comment (edit)
 */
async function updateComment(env: Env, commentId: number, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401, request);
    }

    // Get the comment to check ownership
    const comment = await env.DB.prepare(
      'SELECT author_id, author_type FROM comments WHERE id = ? AND is_deleted = 0'
    ).bind(commentId).first<{ author_id: string; author_type: AuthorType }>();

    if (!comment) {
      return errorResponse('Comment not found', 404, request);
    }

    // Only allow editing own comments
    if (comment.author_id !== user.id) {
      return errorResponse('Cannot edit comments from other users', 403, request);
    }

    // Parse request body
    const body = await request.json() as CreateCommentRequest;
    const { content } = body;

    // Validate content
    if (!content || content.trim().length === 0) {
      return errorResponse('Content is required', 400, request);
    }
    if (content.length > 2000) {
      return errorResponse('Content must be less than 2000 characters', 400, request);
    }

    // Parse new mentions
    const mentions = parseMentions(content);
    const mentionsJson = mentions.length > 0 ? JSON.stringify(mentions) : null;

    // Update comment
    await env.DB.prepare(
      `UPDATE comments SET 
       content = ?,
       mentions = ?,
       is_edited = 1,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(content, mentionsJson, commentId).run();

    // Create notifications for new mentions (if any new ones were added)
    if (mentions.length > 0 && user.type === 'human') {
      await createNotificationsForMentions(env, mentions, 0, commentId, user.id);
    }

    // Fetch the updated comment
    const updatedComment = await env.DB.prepare(
      'SELECT * FROM comments WHERE id = ?'
    ).bind(commentId).first<Comment>();

    return jsonResponse({ comment: updatedComment }, 200, request);
  } catch (error) {
    console.error('[updateComment] Error:', error);
    return errorResponse('Failed to update comment', 500, request);
  }
}

/**
 * Soft delete a comment
 */
async function deleteComment(env: Env, commentId: number, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401, request);
    }

    // Get the comment to check ownership and get task_id
    const comment = await env.DB.prepare(
      'SELECT author_id, author_type, task_id FROM comments WHERE id = ? AND is_deleted = 0'
    ).bind(commentId).first<{ author_id: string; author_type: AuthorType; task_id: number }>();

    if (!comment) {
      return errorResponse('Comment not found', 404, request);
    }

    // Only allow deleting own comments
    if (comment.author_id !== user.id) {
      return errorResponse('Cannot delete comments from other users', 403, request);
    }

    // Soft delete (set is_deleted flag)
    await env.DB.prepare(
      `UPDATE comments SET 
       is_deleted = 1,
       updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(commentId).run();

    // Decrement comment_count on the task
    await env.DB.prepare(
      `UPDATE tasks SET comment_count = MAX(0, comment_count - 1), updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(comment.task_id).run();

    return jsonResponse({ message: 'Comment deleted successfully' }, 200, request);
  } catch (error) {
    console.error('[deleteComment] Error:', error);
    return errorResponse('Failed to delete comment', 500, request);
  }
}

/**
 * Add a reaction to a comment
 */
async function addReaction(env: Env, commentId: number, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401, request);
    }

    // Verify comment exists
    const comment = await env.DB.prepare(
      'SELECT id FROM comments WHERE id = ? AND is_deleted = 0'
    ).bind(commentId).first<{ id: number }>();

    if (!comment) {
      return errorResponse('Comment not found', 404, request);
    }

    // Parse request body
    const body = await request.json() as AddReactionRequest;
    const { emoji } = body;

    if (!emoji || emoji.trim().length === 0) {
      return errorResponse('Emoji is required', 400, request);
    }

    // Insert reaction (UNIQUE constraint handles duplicates)
    try {
      await env.DB.prepare(
        `INSERT INTO comment_reactions (comment_id, emoji, author_id, author_type)
         VALUES (?, ?, ?, ?)`
      ).bind(commentId, emoji, user.id, user.type).run();
    } catch (error) {
      // Likely a duplicate, which is fine
      console.log('[addReaction] Duplicate reaction ignored');
    }

    // Fetch all reactions for this comment
    const reactions = await env.DB.prepare(
      `SELECT * FROM comment_reactions WHERE comment_id = ? ORDER BY created_at ASC`
    ).bind(commentId).all<CommentReaction>();

    return jsonResponse({ reactions: reactions.results || [] }, 200, request);
  } catch (error) {
    console.error('[addReaction] Error:', error);
    return errorResponse('Failed to add reaction', 500, request);
  }
}

/**
 * Remove a reaction from a comment
 */
async function removeReaction(env: Env, commentId: number, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401, request);
    }

    // Parse request body to get emoji
    const body = await request.json() as AddReactionRequest;
    const { emoji } = body;

    if (!emoji) {
      return errorResponse('Emoji is required', 400, request);
    }

    // Delete the reaction
    await env.DB.prepare(
      `DELETE FROM comment_reactions 
       WHERE comment_id = ? AND emoji = ? AND author_id = ?`
    ).bind(commentId, emoji, user.id).run();

    // Fetch remaining reactions for this comment
    const reactions = await env.DB.prepare(
      `SELECT * FROM comment_reactions WHERE comment_id = ? ORDER BY created_at ASC`
    ).bind(commentId).all<CommentReaction>();

    return jsonResponse({ reactions: reactions.results || [] }, 200, request);
  } catch (error) {
    console.error('[removeReaction] Error:', error);
    return errorResponse('Failed to remove reaction', 500, request);
  }
}

/**
 * List notifications for the current user
 */
async function listNotifications(env: Env, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    // Only humans can have notifications
    if (user.type !== 'human') {
      return jsonResponse({ notifications: [] });
    }

    // Get URL params for filtering (optional)
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread') === 'true';

    // Build query
    let query = `
      SELECT 
        n.*,
        t.name as task_title,
        substr(c.content, 1, 100) as comment_preview
      FROM comment_notifications n
      LEFT JOIN tasks t ON n.task_id = t.id
      LEFT JOIN comments c ON n.comment_id = c.id
      WHERE n.user_id = ?
    `;
    
    if (unreadOnly) {
      query += ` AND n.is_read = 0`;
    }
    
    query += ` ORDER BY n.created_at DESC LIMIT 50`;

    const notifications = await env.DB.prepare(query).bind(user.id).all<CommentNotification & { task_title: string; comment_preview: string }>();

    return jsonResponse({ 
      notifications: notifications.results || [],
      unread_count: notifications.results?.filter(n => n.is_read === 0).length || 0
    });
  } catch (error) {
    console.error('[listNotifications] Error:', error);
    return errorResponse('Failed to fetch notifications', 500);
  }
}

/**
 * Mark a single notification as read
 */
async function markNotificationRead(env: Env, notificationId: number, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    // Update the notification
    await env.DB.prepare(
      `UPDATE comment_notifications SET 
       is_read = 1,
       read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ?`
    ).bind(notificationId, user.id).run();

    return jsonResponse({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('[markNotificationRead] Error:', error);
    return errorResponse('Failed to mark notification as read', 500);
  }
}

/**
 * Mark all notifications as read for the current user
 */
async function markAllNotificationsRead(env: Env, request: Request): Promise<Response> {
  try {
    // Validate user auth
    const user = await getCurrentUser(request, env);
    if (!user) {
      return errorResponse('Unauthorized', 401);
    }

    // Only humans can have notifications
    if (user.type !== 'human') {
      return jsonResponse({ message: 'No notifications to mark' });
    }

    // Update all unread notifications for this user
    const result = await env.DB.prepare(
      `UPDATE comment_notifications SET 
       is_read = 1,
       read_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND is_read = 0`
    ).bind(user.id).run();

    return jsonResponse({ 
      message: 'All notifications marked as read',
      marked_count: result.meta?.changes || 0
    });
  } catch (error) {
    console.error('[markAllNotificationsRead] Error:', error);
    return errorResponse('Failed to mark notifications as read', 500);
  }
}

// Export the SSE Connection Manager Durable Object
export { SSEConnectionManager };
