import type { Env, Task, CreateTaskRequest, UpdateTaskRequest, CronJob, CronJobRun, CreateCronJobRequest, UpdateCronJobRequest, EndCronJobRequest, CronJobStatus, GoogleTokenResponse, GoogleUserInfo, Session } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

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

// Session validation helper
async function validateSession(request: Request, env: Env): Promise<Response | null> {
  // Skip validation if no OAuth is configured (fallback to password or allow)
  if (!env.GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID === 'placeholder') {
    // Fall back to password validation if configured
    if (env.DASHBOARD_PASSWORD) {
      const providedPassword = request.headers.get('X-Dashboard-Password');
      if (!providedPassword || providedPassword !== env.DASHBOARD_PASSWORD) {
        return new Response(JSON.stringify({ error: 'Invalid password' }), {
          status: 401,
          headers: CORS_HEADERS,
        });
      }
    }
    return null; // Allow access if no auth configured
  }

  const session = await getSession(request, env);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required', authUrl: '/auth/google' }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  return null; // Validation passed
}

function jsonResponse(data: unknown, status = 200, customHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      ...customHeaders,
    },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
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

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Set allowed origin if specified
    if (env.ALLOWED_ORIGIN) {
      CORS_HEADERS['Access-Control-Allow-Origin'] = env.ALLOWED_ORIGIN;
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

      // Validate session for all other routes
      const sessionError = await validateSession(request, env);
      if (sessionError) {
        return sessionError;
      }
      // GET /tasks - List all tasks
      if (path === '/tasks' && method === 'GET') {
        return await listTasks(env, url.searchParams);
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
          return await getTask(env, taskId);
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
            const result = await deleteTask(env, taskId);
            console.log(`[route] DELETE /tasks/${taskId} - deleteTask completed`);
            return result;
          } catch (err) {
            console.error(`[route] DELETE /tasks/${taskId} - deleteTask threw error:`, err);
            throw err;
          }
        }
      }

      // Cron Jobs Routes
      // GET /cron-jobs - List all cron jobs
      if (path === '/cron-jobs' && method === 'GET') {
        return await listCronJobs(env);
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
          return await getCronJob(env, cronJobId);
        }

        // PATCH /cron-jobs/:id - Update cron job
        if (method === 'PATCH') {
          return await updateCronJob(env, cronJobId, request);
        }

        // DELETE /cron-jobs/:id - Delete cron job
        if (method === 'DELETE') {
          return await deleteCronJob(env, cronJobId);
        }
      }

      // POST /cron-jobs/:id/start - Mark job as running
      const cronStartMatch = path.match(/^\/cron-jobs\/(\d+)\/start$/);
      if (cronStartMatch && method === 'POST') {
        const cronJobId = parseInt(cronStartMatch[1], 10);
        return await startCronJob(env, cronJobId);
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
        return await listCronJobRuns(env, cronJobId);
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
      ...CORS_HEADERS,
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
    return new Response(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Successful</title></head>
        <body>
          <script>
            document.cookie = '${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Secure; SameSite=Lax; Max-Age=604800';
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
        'Set-Cookie': `${SESSION_COOKIE_NAME}=${sessionId}; Path=/; Secure; SameSite=Lax; Max-Age=604800`,
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
      ...CORS_HEADERS,
      'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const session = await getSession(request, env);
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  return jsonResponse({ user: session });
}

async function listTasks(env: Env, searchParams: URLSearchParams): Promise<Response> {
  let sql = 'SELECT * FROM tasks';
  const params: (string | number)[] = [];
  const conditions: string[] = [];

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
  return jsonResponse({ tasks: results || [] });
}

async function getTask(env: Env, id: number): Promise<Response> {
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
  
  if (!task) {
    return errorResponse('Task not found', 404);
  }

  return jsonResponse({ task });
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
    const validStatuses = ['inbox', 'up_next', 'in_progress', 'in_review', 'done'];
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
    return jsonResponse({ task }, 201);
  } catch (error) {
    console.error('[createTask] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

async function updateTask(env: Env, id: number, request: Request): Promise<Response> {
  console.log(`[updateTask] Starting update for task ID: ${id}`);
  
  try {
    // Check if task exists
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
    if (!existing) {
      console.log(`[updateTask] Task ${id} not found`);
      return errorResponse('Task not found', 404);
    }
    console.log(`[updateTask] Found existing task:`, JSON.stringify(existing));

    let body: UpdateTaskRequest;
    try {
      body = await request.json() as UpdateTaskRequest;
      console.log('[updateTask] Request body:', JSON.stringify(body));
    } catch (parseError) {
      console.error('[updateTask] Failed to parse request body:', parseError);
      return errorResponse('Invalid JSON: ' + (parseError as Error).message, 400);
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    // Build dynamic update query
    if (body.name !== undefined) {
      if (body.name.trim() === '') {
        console.log('[updateTask] Validation failed: name cannot be empty');
        return errorResponse('Task name cannot be empty', 400);
      }
      updates.push('name = ?');
      values.push(body.name.trim());
    }

    if (body.description !== undefined) {
      updates.push('description = ?');
      values.push(body.description || null);
    }

    if (body.status !== undefined) {
      const validStatuses = ['inbox', 'up_next', 'in_progress', 'in_review', 'done'];
      if (!validStatuses.includes(body.status)) {
        console.log(`[updateTask] Validation failed: invalid status "${body.status}"`);
        return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
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

  // Always update the updated_at timestamp
  updates.push('updated_at = CURRENT_TIMESTAMP');

  if (updates.length === 1) {
    console.log('[updateTask] No fields to update');
    return errorResponse('No fields to update', 400);
  }

  values.push(id);

  console.log(`[updateTask] Update query: SET ${updates.join(', ')} WHERE id = ?`);
  console.log('[updateTask] Values:', JSON.stringify(values));

  try {
    await env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();
    console.log('[updateTask] Update successful');
  } catch (updateError) {
    console.error('[updateTask] Database update failed:', updateError);
    return errorResponse('Database update failed: ' + (updateError as Error).message, 500);
  }

  // Fetch the updated task
  let task;
  try {
    task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
    console.log('[updateTask] Fetched updated task:', JSON.stringify(task));
  } catch (fetchError) {
    console.error('[updateTask] Failed to fetch updated task:', fetchError);
    return errorResponse('Updated task but failed to fetch it: ' + (fetchError as Error).message, 500);
  }

  console.log('[updateTask] Successfully updated task:', id);
  return jsonResponse({ task });
  } catch (error) {
    console.error('[updateTask] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

async function deleteTask(env: Env, id: number): Promise<Response> {
  console.log(`[deleteTask] Starting delete for task ID: ${id}`);
  
  try {
    // Check if task exists
    const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
    if (!existing) {
      console.log(`[deleteTask] Task ${id} not found`);
      return errorResponse('Task not found', 404);
    }
    console.log(`[deleteTask] Found task to delete:`, JSON.stringify(existing));

    try {
      await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
      console.log(`[deleteTask] Task ${id} deleted successfully`);
      return jsonResponse({ success: true, message: 'Task deleted' });
    } catch (deleteError) {
      console.error('[deleteTask] Database delete failed:', deleteError);
      return errorResponse('Database delete failed: ' + (deleteError as Error).message, 500);
    }
  } catch (error) {
    console.error('[deleteTask] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

// Cron Job Functions

async function listCronJobs(env: Env): Promise<Response> {
  try {
    console.log('[listCronJobs] Querying cron_jobs table...');
    const { results } = await env.DB.prepare(
      'SELECT * FROM cron_jobs ORDER BY created_at DESC'
    ).all<CronJob>();
    console.log('[listCronJobs] Results:', results);
    return jsonResponse({ cronJobs: results || [] });
  } catch (error) {
    console.error('[listCronJobs] Error:', error);
    return errorResponse('Database error: ' + (error as Error).message, 500);
  }
}

async function getCronJob(env: Env, id: number): Promise<Response> {
  const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
    .bind(id)
    .first<CronJob>();
  
  if (!cronJob) {
    return errorResponse('Cron job not found', 404);
  }

  return jsonResponse({ cronJob });
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

async function deleteCronJob(env: Env, id: number): Promise<Response> {
  console.log(`[deleteCronJob] Starting delete for cron job ID: ${id}`);
  
  try {
    // Check if cron job exists
    const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    if (!existing) {
      console.log(`[deleteCronJob] Cron job ${id} not found`);
      return errorResponse('Cron job not found', 404);
    }
    console.log(`[deleteCronJob] Found cron job to delete:`, JSON.stringify(existing));

    try {
      // Delete related runs first
      const runsResult = await env.DB.prepare('DELETE FROM cron_job_runs WHERE cron_job_id = ?').bind(id).run();
      console.log(`[deleteCronJob] Deleted ${runsResult.meta?.changes || 0} related run records`);
      
      // Delete the cron job
      await env.DB.prepare('DELETE FROM cron_jobs WHERE id = ?').bind(id).run();
      console.log(`[deleteCronJob] Cron job ${id} deleted successfully`);
      
      return jsonResponse({ success: true, message: 'Cron job deleted' });
    } catch (deleteError) {
      console.error('[deleteCronJob] Database delete failed:', deleteError);
      return errorResponse('Database delete failed: ' + (deleteError as Error).message, 500);
    }
  } catch (error) {
    console.error('[deleteCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
  }
}

async function startCronJob(env: Env, id: number): Promise<Response> {
  console.log(`[startCronJob] Starting cron job ID: ${id}`);
  
  try {
    // Check if cron job exists
    const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
    if (!existing) {
      console.log(`[startCronJob] Cron job ${id} not found`);
      return errorResponse('Cron job not found', 404);
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
      return jsonResponse({ cronJob, message: 'Cron job started' });
    } catch (dbError) {
      console.error('[startCronJob] Database operation failed:', dbError);
      return errorResponse('Database operation failed: ' + (dbError as Error).message, 500);
    }
  } catch (error) {
    console.error('[startCronJob] Unexpected error:', error);
    return errorResponse('Internal server error: ' + (error as Error).message, 500);
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

async function listCronJobRuns(env: Env, id: number): Promise<Response> {
  // Check if cron job exists
  const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  if (!existing) {
    return errorResponse('Cron job not found', 404);
  }

  const { results } = await env.DB.prepare(
    'SELECT * FROM cron_job_runs WHERE cron_job_id = ? ORDER BY started_at DESC LIMIT 50'
  ).bind(id).all<CronJobRun>();

  return jsonResponse({ runs: results || [] });
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
