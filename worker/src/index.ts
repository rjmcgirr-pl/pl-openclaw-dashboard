import type { Env, Task, CreateTaskRequest, UpdateTaskRequest, CronJob, CronJobRun, CreateCronJobRequest, EndCronJobRequest, CronJobStatus } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Dashboard-Password',
  'Content-Type': 'application/json',
};

// Password validation helper
function validatePassword(request: Request, env: Env): Response | null {
  // Skip validation if no password is configured
  if (!env.DASHBOARD_PASSWORD) {
    return null;
  }

  const providedPassword = request.headers.get('X-Dashboard-Password');
  
  if (!providedPassword) {
    return new Response(JSON.stringify({ error: 'Password required' }), {
      status: 401,
      headers: CORS_HEADERS,
    });
  }

  if (providedPassword !== env.DASHBOARD_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Invalid password' }), {
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

    // Validate password
    const passwordError = validatePassword(request, env);
    if (passwordError) {
      return passwordError;
    }

    try {
      // GET /tasks - List all tasks
      if (path === '/tasks' && method === 'GET') {
        return await listTasks(env, url.searchParams);
      }

      // POST /tasks - Create a new task
      if (path === '/tasks' && method === 'POST') {
        return await createTask(env, request);
      }

      // Single task routes
      const taskMatch = path.match(/^\/tasks\/(\d+)$/);
      if (taskMatch) {
        const taskId = parseInt(taskMatch[1], 10);

        // GET /tasks/:id - Get single task
        if (method === 'GET') {
          return await getTask(env, taskId);
        }

        // PATCH /tasks/:id - Update task
        if (method === 'PATCH') {
          return await updateTask(env, taskId, request);
        }

        // DELETE /tasks/:id - Delete task
        if (method === 'DELETE') {
          return await deleteTask(env, taskId);
        }
      }

      // Cron Jobs Routes
      // GET /cron-jobs - List all cron jobs
      if (path === '/cron-jobs' && method === 'GET') {
        return await listCronJobs(env);
      }

      // POST /cron-jobs - Create a new cron job
      if (path === '/cron-jobs' && method === 'POST') {
        return await createCronJob(env, request);
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
  const body = await request.json() as CreateTaskRequest;

  // Validate required fields
  if (!body.name || body.name.trim() === '') {
    return errorResponse('Task name is required');
  }

  // Validate status if provided
  const validStatuses = ['inbox', 'up_next', 'in_progress', 'in_review', 'done'];
  const status = body.status || 'inbox';
  if (!validStatuses.includes(status)) {
    return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  const name = body.name.trim();
  const description = body.description || null;
  const priority = body.priority ?? 0;
  const blocked = body.blocked ? 1 : 0;
  const assignedToAgent = body.assigned_to_agent ? 1 : 0;

  const result = await env.DB.prepare(
    `INSERT INTO tasks (name, description, status, priority, blocked, assigned_to_agent) 
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(name, description, status, priority, blocked, assignedToAgent).run();

  // Fetch the created task
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<Task>();

  return jsonResponse({ task }, 201);
}

async function updateTask(env: Env, id: number, request: Request): Promise<Response> {
  // Check if task exists
  const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
  if (!existing) {
    return errorResponse('Task not found', 404);
  }

  const body = await request.json() as UpdateTaskRequest;
  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  // Build dynamic update query
  if (body.name !== undefined) {
    if (body.name.trim() === '') {
      return errorResponse('Task name cannot be empty');
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
      return errorResponse(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
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
    return errorResponse('No fields to update');
  }

  values.push(id);

  await env.DB.prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // Fetch the updated task
  const task = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
  return jsonResponse({ task });
}

async function deleteTask(env: Env, id: number): Promise<Response> {
  // Check if task exists
  const existing = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(id).first<Task>();
  if (!existing) {
    return errorResponse('Task not found', 404);
  }

  await env.DB.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true, message: 'Task deleted' });
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
  const body = await request.json() as CreateCronJobRequest;

  // Validate required fields
  if (!body.name || body.name.trim() === '') {
    return errorResponse('Cron job name is required');
  }

  if (!body.schedule || body.schedule.trim() === '') {
    return errorResponse('Schedule is required');
  }

  const name = body.name.trim();
  const description = body.description || null;
  const schedule = body.schedule.trim();
  const skillMdPath = body.skill_md_path || null;

  const result = await env.DB.prepare(
    `INSERT INTO cron_jobs (name, description, schedule, skill_md_path, last_status) 
     VALUES (?, ?, ?, ?, 'pending')`
  ).bind(name, description, schedule, skillMdPath).run();

  // Fetch the created cron job
  const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
    .bind(result.meta.last_row_id)
    .first<CronJob>();

  return jsonResponse({ cronJob }, 201);
}

async function updateCronJob(env: Env, id: number, request: Request): Promise<Response> {
  // Check if cron job exists
  const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  if (!existing) {
    return errorResponse('Cron job not found', 404);
  }

  const body = await request.json() as Partial<CreateCronJobRequest>;
  const updates: string[] = [];
  const values: (string | null)[] = [];

  // Build dynamic update query
  if (body.name !== undefined) {
    if (body.name.trim() === '') {
      return errorResponse('Cron job name cannot be empty');
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

  if (body.skill_md_path !== undefined) {
    updates.push('skill_md_path = ?');
    values.push(body.skill_md_path || null);
  }

  if (updates.length === 0) {
    return errorResponse('No fields to update');
  }

  values.push(id.toString());

  await env.DB.prepare(`UPDATE cron_jobs SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

  // Fetch the updated cron job
  const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  return jsonResponse({ cronJob });
}

async function deleteCronJob(env: Env, id: number): Promise<Response> {
  // Check if cron job exists
  const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  if (!existing) {
    return errorResponse('Cron job not found', 404);
  }

  // Delete related runs first
  await env.DB.prepare('DELETE FROM cron_job_runs WHERE cron_job_id = ?').bind(id).run();
  
  // Delete the cron job
  await env.DB.prepare('DELETE FROM cron_jobs WHERE id = ?').bind(id).run();
  return jsonResponse({ success: true, message: 'Cron job deleted' });
}

async function startCronJob(env: Env, id: number): Promise<Response> {
  // Check if cron job exists
  const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  if (!existing) {
    return errorResponse('Cron job not found', 404);
  }

  const now = new Date().toISOString();

  // Update cron job status to running
  await env.DB.prepare(
    `UPDATE cron_jobs 
     SET last_run_at = ?, last_status = 'running', last_output = NULL 
     WHERE id = ?`
  ).bind(now, id).run();

  // Create a run record
  await env.DB.prepare(
    `INSERT INTO cron_job_runs (cron_job_id, started_at, status) 
     VALUES (?, ?, 'running')`
  ).bind(id, now).run();

  // Fetch the updated cron job
  const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  return jsonResponse({ cronJob, message: 'Cron job started' });
}

async function endCronJob(env: Env, id: number, request: Request): Promise<Response> {
  // Check if cron job exists
  const existing = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  if (!existing) {
    return errorResponse('Cron job not found', 404);
  }

  const body = await request.json() as EndCronJobRequest;

  // Validate status
  const validEndStatuses: CronJobStatus[] = ['done', 'error'];
  const status = body.status;
  if (!validEndStatuses.includes(status)) {
    return errorResponse(`Invalid status. Must be one of: ${validEndStatuses.join(', ')}`);
  }

  const now = new Date().toISOString();
  const output = body.output || null;

  // Update cron job
  await env.DB.prepare(
    `UPDATE cron_jobs 
     SET last_status = ?, last_output = ? 
     WHERE id = ?`
  ).bind(status, output, id).run();

  // Update the latest run record
  await env.DB.prepare(
    `UPDATE cron_job_runs 
     SET ended_at = ?, status = ?, output = ? 
     WHERE cron_job_id = ? AND status = 'running'
     ORDER BY started_at DESC
     LIMIT 1`
  ).bind(now, status, output, id).run();

  // Fetch the updated cron job
  const cronJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?').bind(id).first<CronJob>();
  return jsonResponse({ cronJob, message: `Cron job marked as ${status}` });
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
  const body = await request.json() as { cronJobs: CreateCronJobRequest[] };
  
  if (!body.cronJobs || !Array.isArray(body.cronJobs)) {
    return errorResponse('Invalid request: cronJobs array required');
  }

  // Delete all existing cron jobs and runs
  await env.DB.prepare('DELETE FROM cron_job_runs').run();
  await env.DB.prepare('DELETE FROM cron_jobs').run();

  // Insert new cron jobs
  const inserted: CronJob[] = [];
  for (const job of body.cronJobs) {
    const result = await env.DB.prepare(
      `INSERT INTO cron_jobs (name, description, schedule, skill_md_path, last_status) 
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      job.name,
      job.description || null,
      job.schedule,
      job.skill_md_path || null,
      job.last_status || 'pending'
    ).run();

    const newJob = await env.DB.prepare('SELECT * FROM cron_jobs WHERE id = ?')
      .bind(result.meta.last_row_id as number)
      .first<CronJob>();
    if (newJob) inserted.push(newJob);
  }

  return jsonResponse({ 
    message: 'Cron jobs synced', 
    count: inserted.length,
    cronJobs: inserted 
  }, 201);
}
