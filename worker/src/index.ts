import type { Env, Task, CreateTaskRequest, UpdateTaskRequest } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

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
  const values: (string | number)[] = [];

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
