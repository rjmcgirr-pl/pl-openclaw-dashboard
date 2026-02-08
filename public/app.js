// Task Board Frontend
// Configure this to point to your Worker API
// Production API URL - change this if your Worker is on a different domain
const API_BASE_URL = window.API_BASE_URL || 'https://taskboard-api.rei-workers.workers.dev';

// Status configuration
const STATUSES = ['inbox', 'up_next', 'in_progress', 'in_review', 'done'];
const STATUS_LABELS = {
    inbox: '📥 Inbox',
    up_next: '⬆️ Up Next',
    in_progress: '🔨 In Progress',
    in_review: '👀 In Review',
    done: '✅ Done'
};

// Cron job status configuration
const CRON_STATUSES = ['pending', 'running', 'done', 'error', 'stalled'];
const CRON_STATUS_LABELS = {
    pending: '⏸️ Pending',
    running: '🔄 Running',
    done: '✅ Done',
    error: '❌ Error',
    stalled: '⚠️ Stalled'
};

// State
let tasks = [];
let cronJobs = [];
let draggedTask = null;
let autoRefreshInterval = null;
let cronRefreshInterval = null;
let dashboardPassword = sessionStorage.getItem('dashboardPassword') || '';
let currentTab = 'tasks';

// DOM Elements
const newTaskBtn = document.getElementById('newTaskBtn');
const taskModal = document.getElementById('taskModal');
const closeModalBtn = document.getElementById('closeModal');
const taskForm = document.getElementById('taskForm');
const deleteTaskBtn = document.getElementById('deleteTaskBtn');
const modalTitle = document.getElementById('modalTitle');

// Form fields
const taskIdField = document.getElementById('taskId');
const taskNameField = document.getElementById('taskName');
const taskDescriptionField = document.getElementById('taskDescription');
const taskStatusField = document.getElementById('taskStatus');
const taskPriorityField = document.getElementById('taskPriority');
const taskBlockedField = document.getElementById('taskBlocked');
const taskAssignedField = document.getElementById('taskAssigned');

// Initialize
async function init() {
    console.log('[Init] Starting dashboard...');
    
    // ALWAYS set up event listeners first (including login form)
    setupEventListeners();
    
    // Check if password is required
    if (!dashboardPassword) {
        console.log('[Init] No password found, showing login modal');
        showLoginModal();
        return;
    }
    
    // Verify password works by loading tasks
    try {
        console.log('[Init] Checking stored password...');
        await loadTasks();
        await loadCronJobs();
        setupDragAndDrop();
        setupCronEventListeners();
        startAutoRefresh();
        startCronAutoRefresh();
        
        // Show logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.style.display = 'block';
        }
        console.log('[Init] Dashboard initialized successfully');
    } catch (error) {
        // If auth failed, login modal will be shown by apiRequest
        console.log('[Init] Auth check failed, showing login:', error.message);
    }
}

// Login Modal Functions
function showLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function hideLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

async function handleLogin(password) {
    dashboardPassword = password;
    
    try {
        // Test the password by loading tasks
        const data = await apiRequest('/tasks');
        tasks = data.tasks || [];
        
        // Also load cron jobs
        await loadCronJobs();
        
        // Save password to sessionStorage
        sessionStorage.setItem('dashboardPassword', password);
        
        hideLoginModal();
        renderBoard();
        renderCronJobs();
        setupDragAndDrop();
        setupCronEventListeners();
        startAutoRefresh();
        startCronAutoRefresh();
        
        // Show logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.style.display = 'block';
        }
        
        return true;
    } catch (error) {
        // Clear the password on failure
        dashboardPassword = '';
        sessionStorage.removeItem('dashboardPassword');
        console.error('Login failed:', error.message);
        return false;
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[API] Request to: ${url}`, options.method || 'GET');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    // Add password header if available
    if (dashboardPassword) {
        headers['X-Dashboard-Password'] = dashboardPassword;
    }
    
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
        });
    } catch (networkError) {
        // Network error (CORS, offline, DNS failure, etc.)
        console.error('[API] Network error:', networkError);
        throw new Error('Network error: Cannot connect to API. Please check your connection and ensure the API is running.');
    }
    
    console.log(`[API] Response status: ${response.status}`);
    
    if (!response.ok) {
        // Handle 401 Unauthorized - show login modal
        if (response.status === 401) {
            dashboardPassword = '';
            sessionStorage.removeItem('dashboardPassword');
            showLoginModal();
            throw new Error('Authentication required. Please enter the password.');
        }
        
        // Safely parse error response
        let errorMessage = `HTTP ${response.status}`;
        try {
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const error = await response.json();
                errorMessage = error.error || errorMessage;
            } else {
                const text = await response.text();
                if (text) errorMessage = text;
            }
        } catch (parseError) {
            // If we can't parse the error, just use the status
            console.warn('[API] Failed to parse error response:', parseError);
        }
        throw new Error(errorMessage);
    }
    
    return response.json();
}

async function loadTasks() {
    try {
        const data = await apiRequest('/tasks');
        tasks = data.tasks || [];
        renderBoard();
    } catch (error) {
        showError('Failed to load tasks: ' + error.message);
    }
}

async function createTask(taskData) {
    try {
        const data = await apiRequest('/tasks', {
            method: 'POST',
            body: JSON.stringify(taskData),
        });
        await loadTasks();
        closeModal();
        return data.task;
    } catch (error) {
        showError('Failed to create task: ' + error.message);
    }
}

async function updateTask(id, taskData) {
    try {
        const data = await apiRequest(`/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(taskData),
        });
        await loadTasks();
        closeModal();
        return data.task;
    } catch (error) {
        showError('Failed to update task: ' + error.message);
    }
}

async function updateTaskStatus(id, status) {
    try {
        await apiRequest(`/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status }),
        });
        await loadTasks();
    } catch (error) {
        showError('Failed to update task status: ' + error.message);
    }
}

async function deleteTask(id) {
    if (!confirm('Are you sure you want to delete this task?')) {
        return;
    }
    
    try {
        await apiRequest(`/tasks/${id}`, {
            method: 'DELETE',
        });
        await loadTasks();
        closeModal();
    } catch (error) {
        showError('Failed to delete task: ' + error.message);
    }
}

// Rendering
function renderBoard() {
    // Clear all columns
    STATUSES.forEach(status => {
        const col = document.getElementById(`col-${status}`);
        col.innerHTML = '';
    });

    // Count tasks per status
    const counts = {};
    STATUSES.forEach(status => counts[status] = 0);

    // Sort tasks by priority desc
    const sortedTasks = [...tasks].sort((a, b) => b.priority - a.priority);

    // Render tasks
    sortedTasks.forEach(task => {
        counts[task.status]++;
        const taskCard = createTaskCard(task);
        const col = document.getElementById(`col-${task.status}`);
        col.appendChild(taskCard);
    });

    // Update counts
    STATUSES.forEach(status => {
        document.getElementById(`count-${status}`).textContent = counts[status];
    });
}

function createTaskCard(task) {
    const card = document.createElement('div');
    card.className = 'task-card';
    card.draggable = true;
    card.dataset.taskId = task.id;

    if (task.blocked) card.classList.add('blocked');
    if (task.assigned_to_agent) card.classList.add('assigned');

    const badges = [];
    if (task.priority > 0) {
        badges.push(`<span class="badge badge-priority">P${task.priority}</span>`);
    }
    if (task.blocked) {
        badges.push(`<span class="badge badge-blocked">🚫</span>`);
    }
    if (task.assigned_to_agent) {
        badges.push(`<span class="badge badge-assigned">🤖</span>`);
    }

    const description = task.description 
        ? `<div class="task-description">${escapeHtml(task.description)}</div>` 
        : '';

    // Get adjacent statuses for move buttons
    const statusIndex = STATUSES.indexOf(task.status);
    const prevStatus = statusIndex > 0 ? STATUSES[statusIndex - 1] : null;
    const nextStatus = statusIndex < STATUSES.length - 1 ? STATUSES[statusIndex + 1] : null;

    const moveButtons = [];
    if (prevStatus) {
        moveButtons.push(`<button class="task-btn" data-move="${prevStatus}">← ${STATUS_LABELS[prevStatus].split(' ')[0]}</button>`);
    }
    if (nextStatus) {
        moveButtons.push(`<button class="task-btn" data-move="${nextStatus}">${STATUS_LABELS[nextStatus].split(' ')[0]} →</button>`);
    }

    card.innerHTML = `
        <div class="task-header">
            <span class="task-name">${escapeHtml(task.name)}</span>
            <div class="task-badges">${badges.join('')}</div>
        </div>
        ${description}
        <div class="task-meta">Updated: ${formatDate(task.updated_at)}</div>
        <div class="task-actions">
            ${moveButtons.join('')}
        </div>
    `;

    // Click to edit
    card.addEventListener('click', (e) => {
        if (!e.target.classList.contains('task-btn')) {
            openEditModal(task);
        }
    });

    // Move buttons
    card.querySelectorAll('.task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newStatus = btn.dataset.move;
            updateTaskStatus(task.id, newStatus);
        });
    });

    // Drag events
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);

    return card;
}

// Drag and Drop
function setupDragAndDrop() {
    document.querySelectorAll('.column-tasks').forEach(col => {
        col.addEventListener('dragover', handleDragOver);
        col.addEventListener('dragenter', handleDragEnter);
        col.addEventListener('dragleave', handleDragLeave);
        col.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedTask = parseInt(e.target.dataset.taskId, 10);
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    draggedTask = null;
    document.querySelectorAll('.column-tasks').forEach(col => {
        col.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.add('drag-over');
}

function handleDragLeave(e) {
    const col = e.currentTarget;
    col.classList.remove('drag-over');
}

async function handleDrop(e) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.remove('drag-over');

    if (draggedTask === null) return;

    const newStatus = col.parentElement.dataset.status;
    const task = tasks.find(t => t.id === draggedTask);
    
    if (task && task.status !== newStatus) {
        await updateTaskStatus(draggedTask, newStatus);
    }
}

// Modal Functions
function openNewModal() {
    modalTitle.textContent = 'New Task';
    taskForm.reset();
    taskIdField.value = '';
    taskStatusField.value = 'inbox';
    taskPriorityField.value = '0';
    deleteTaskBtn.style.display = 'none';
    taskModal.classList.add('active');
}

function openEditModal(task) {
    modalTitle.textContent = 'Edit Task';
    taskIdField.value = task.id;
    taskNameField.value = task.name;
    taskDescriptionField.value = task.description || '';
    taskStatusField.value = task.status;
    taskPriorityField.value = task.priority;
    taskBlockedField.checked = task.blocked === 1;
    taskAssignedField.checked = task.assigned_to_agent === 1;
    deleteTaskBtn.style.display = 'block';
    taskModal.classList.add('active');
}

function closeModal() {
    taskModal.classList.remove('active');
}

// Event Listeners
function setupEventListeners() {
    newTaskBtn.addEventListener('click', openNewModal);
    closeModalBtn.addEventListener('click', closeModal);
    deleteTaskBtn.addEventListener('click', () => {
        const id = parseInt(taskIdField.value, 10);
        if (id) deleteTask(id);
    });

    taskModal.addEventListener('click', (e) => {
        if (e.target === taskModal) closeModal();
    });

    taskForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const taskData = {
            name: taskNameField.value.trim(),
            description: taskDescriptionField.value.trim() || undefined,
            status: taskStatusField.value,
            priority: parseInt(taskPriorityField.value, 10) || 0,
            blocked: taskBlockedField.checked,
            assigned_to_agent: taskAssignedField.checked,
        };

        const id = taskIdField.value;
        if (id) {
            await updateTask(parseInt(id, 10), taskData);
        } else {
            await createTask(taskData);
        }
    });

    // Login form
    const loginForm = document.getElementById('loginForm');
    const loginPasswordField = document.getElementById('loginPassword');
    const loginErrorDiv = document.getElementById('loginError');
    const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('[Login] Form submitted');
            
            // Clear previous errors
            loginErrorDiv.style.display = 'none';
            loginErrorDiv.textContent = '';

            const password = loginPasswordField.value.trim();
            
            // Validate input
            if (!password) {
                loginErrorDiv.textContent = 'Please enter a password.';
                loginErrorDiv.style.display = 'block';
                loginPasswordField.focus();
                return;
            }
            
            console.log('[Login] Password entered:', password ? 'Yes (length: ' + password.length + ')' : 'No');
            
            // Show loading state
            const originalBtnText = loginSubmitBtn ? loginSubmitBtn.textContent : 'Login';
            if (loginSubmitBtn) {
                loginSubmitBtn.disabled = true;
                loginSubmitBtn.textContent = 'Logging in...';
            }
            
            try {
                const success = await handleLogin(password);
                console.log('[Login] handleLogin returned:', success);

                if (!success) {
                    console.log('[Login] Showing error message');
                    loginErrorDiv.textContent = 'Invalid password. Please try again.';
                    loginErrorDiv.style.display = 'block';
                    loginPasswordField.value = '';
                    loginPasswordField.focus();
                }
            } catch (err) {
                console.error('[Login] Unexpected error in form handler:', err);
                loginErrorDiv.textContent = 'Error: ' + err.message;
                loginErrorDiv.style.display = 'block';
            } finally {
                // Restore button state
                if (loginSubmitBtn) {
                    loginSubmitBtn.disabled = false;
                    loginSubmitBtn.textContent = originalBtnText;
                }
            }
        });
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            dashboardPassword = '';
            sessionStorage.removeItem('dashboardPassword');
            stopAutoRefresh();
            stopCronAutoRefresh();
            location.reload();
        });
    }
}

// Auto-refresh
function startAutoRefresh() {
    // Refresh every 30 seconds
    autoRefreshInterval = setInterval(() => {
        loadTasks();
    }, 30000);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Utilities
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showError(message) {
    console.error(message);
    // Could show a toast notification here
    alert(message);
}

// Cron Job Functions

async function loadCronJobs() {
    try {
        const data = await apiRequest('/cron-jobs');
        cronJobs = data.cronJobs || [];
        renderCronJobs();
    } catch (error) {
        showError('Failed to load cron jobs: ' + error.message);
    }
}

function renderCronJobs() {
    const container = document.getElementById('cronJobsList');
    
    // Update stats
    const stats = {
        total: cronJobs.length,
        done: cronJobs.filter(j => j.last_status === 'done').length,
        running: cronJobs.filter(j => j.last_status === 'running').length,
        error: cronJobs.filter(j => j.last_status === 'error' || j.last_status === 'stalled').length
    };
    
    document.getElementById('cronTotal').textContent = stats.total;
    document.getElementById('cronDone').textContent = stats.done;
    document.getElementById('cronRunning').textContent = stats.running;
    document.getElementById('cronError').textContent = stats.error;
    
    if (cronJobs.length === 0) {
        container.innerHTML = `
            <div class="cron-empty-state">
                <div class="cron-empty-state-icon">⏰</div>
                <h3>No Cron Jobs</h3>
                <p>Create your first cron job to start monitoring</p>
            </div>
        `;
        return;
    }
    
    // Sort by status (running/error first), then by last run time
    const sortedJobs = [...cronJobs].sort((a, b) => {
        const statusPriority = { running: 0, stalled: 1, error: 2, pending: 3, done: 4 };
        const aPriority = statusPriority[a.last_status] ?? 5;
        const bPriority = statusPriority[b.last_status] ?? 5;
        
        if (aPriority !== bPriority) {
            return aPriority - bPriority;
        }
        
        // Sort by last run time (most recent first)
        const aTime = a.last_run_at ? new Date(a.last_run_at) : new Date(0);
        const bTime = b.last_run_at ? new Date(b.last_run_at) : new Date(0);
        return bTime - aTime;
    });
    
    container.innerHTML = sortedJobs.map(job => createCronJobCard(job)).join('');
    
    // Add click handlers for expansion
    container.querySelectorAll('.cron-job-header').forEach(header => {
        header.addEventListener('click', () => {
            const card = header.closest('.cron-job-card');
            card.classList.toggle('expanded');
        });
    });
}

function createCronJobCard(job) {
    const statusLabel = CRON_STATUS_LABELS[job.last_status] || job.last_status;
    const lastRun = job.last_run_at ? formatDate(job.last_run_at) : 'Never';
    const nextRun = job.next_run_at ? formatDate(job.next_run_at) : 'Not scheduled';

    // Render markdown content for preview (truncated)
    let skillMdPreview = '';
    if (job.skill_md_content) {
        const previewText = job.skill_md_content.substring(0, 300);
        const isTruncated = job.skill_md_content.length > 300;
        skillMdPreview = `
            <div class="skill-md-preview">
                <div class="skill-md-header">
                    <span class="skill-md-icon">📄</span>
                    <span class="skill-md-title">Skill.md Content</span>
                    <span class="skill-md-size">(${(job.skill_md_content.length / 1024).toFixed(1)} KB)</span>
                </div>
                <div class="skill-md-content">${escapeHtml(previewText)}${isTruncated ? '...' : ''}</div>
            </div>
        `;
    }

    // Build config badges
    const modelBadge = `<span class="cron-config-badge model">${getModelDisplayName(job.model)}</span>`;
    const timeoutBadge = `<span class="cron-config-badge timeout">⏱️ ${job.timeout_seconds || 300}s</span>`;
    const thinkingBadge = job.thinking && job.thinking !== 'low' 
        ? `<span class="cron-config-badge thinking">🧠 ${job.thinking}</span>` 
        : '';
    const deliverBadge = job.deliver === false 
        ? `<span class="cron-config-badge deliver-off">📵 No delivery</span>` 
        : '';

    // Payload preview (truncated)
    let payloadPreview = '';
    if (job.payload) {
        const previewText = job.payload.substring(0, 200);
        const isTruncated = job.payload.length > 200;
        payloadPreview = `
            <div class="cron-payload-preview">
                <div class="payload-preview-header">
                    <span class="payload-preview-icon">📝</span>
                    <span class="payload-preview-title">Task Instructions</span>
                    <span class="payload-preview-size">(${(job.payload.length / 1024).toFixed(1)} KB)</span>
                </div>
                <div class="payload-preview-content">${escapeHtml(previewText)}${isTruncated ? '...' : ''}</div>
            </div>
        `;
    }

    return `
        <div class="cron-job-card" data-cron-id="${job.id}">
            <div class="cron-job-header">
                <div class="cron-job-main">
                    <div class="cron-job-status ${job.last_status}"></div>
                    <div class="cron-job-info">
                        <div class="cron-job-name">${escapeHtml(job.name)}</div>
                        <div class="cron-job-meta">
                            <span>⏱️ ${escapeHtml(job.schedule)}</span>
                            <span>🕐 Last: ${lastRun}</span>
                            ${job.skill_md_path ? `<span>📎 <a href="${escapeHtml(job.skill_md_path)}" target="_blank">skill.md</a></span>` : ''}
                        </div>
                        <div class="cron-job-config-badges">
                            ${modelBadge}
                            ${timeoutBadge}
                            ${thinkingBadge}
                            ${deliverBadge}
                        </div>
                    </div>
                    <span class="cron-job-badge ${job.last_status}">${statusLabel}</span>
                </div>
                <span class="cron-job-chevron">▼</span>
            </div>
            <div class="cron-job-details">
                ${job.description ? `<div class="cron-job-description">${escapeHtml(job.description)}</div>` : ''}
                ${payloadPreview}
                ${skillMdPreview}
                <div class="cron-job-output">${job.last_output ? escapeHtml(job.last_output) : ''}</div>
                <div class="cron-job-actions">
                    <button class="btn-secondary" onclick="editCronJob(${job.id})">Edit Config</button>
                    <button class="btn-secondary" onclick="openMarkdownEditor(${job.id})">Edit Skill.md</button>
                    <button class="btn-primary" onclick="runCronJob(${job.id})">Run Now</button>
                </div>
            </div>
        </div>
    `;
}

async function createCronJob(cronJobData) {
    try {
        const data = await apiRequest('/cron-jobs', {
            method: 'POST',
            body: JSON.stringify(cronJobData),
        });
        await loadCronJobs();
        closeCronModal();
        return data.cronJob;
    } catch (error) {
        showError('Failed to create cron job: ' + error.message);
    }
}

async function updateCronJob(id, cronJobData) {
    try {
        const data = await apiRequest(`/cron-jobs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(cronJobData),
        });
        await loadCronJobs();
        closeCronModal();
        return data.cronJob;
    } catch (error) {
        showError('Failed to update cron job: ' + error.message);
    }
}

async function deleteCronJob(id) {
    if (!confirm('Are you sure you want to delete this cron job?')) {
        return;
    }
    
    try {
        await apiRequest(`/cron-jobs/${id}`, {
            method: 'DELETE',
        });
        await loadCronJobs();
        closeCronModal();
    } catch (error) {
        showError('Failed to delete cron job: ' + error.message);
    }
}

async function runCronJob(id) {
    try {
        await apiRequest(`/cron-jobs/${id}/start`, {
            method: 'POST',
        });
        showError('Cron job started manually');
        await loadCronJobs();
    } catch (error) {
        showError('Failed to start cron job: ' + error.message);
    }
}

// Tab Functions
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(tabName + 'Tab').classList.add('active');
}

// Cron Modal Functions
function openNewCronModal() {
    document.getElementById('cronModalTitle').textContent = 'New Cron Job';
    document.getElementById('cronJobForm').reset();
    document.getElementById('cronJobId').value = '';
    document.getElementById('deleteCronJobBtn').style.display = 'none';
    
    // Set default values for new fields
    document.getElementById('cronJobModel').value = 'google/gemini-3-flash-preview';
    document.getElementById('cronJobThinking').value = 'low';
    document.getElementById('cronJobTimeout').value = '300';
    document.getElementById('cronJobDeliver').checked = true;
    
    // Reset validation errors
    document.getElementById('payloadError').style.display = 'none';
    document.getElementById('timeoutError').style.display = 'none';
    updatePayloadCharCount();
    
    document.getElementById('cronJobModal').classList.add('active');
}

function editCronJob(id) {
    const job = cronJobs.find(j => j.id === id);
    if (!job) return;

    document.getElementById('cronModalTitle').textContent = 'Edit Cron Job';
    document.getElementById('cronJobId').value = job.id;
    document.getElementById('cronJobName').value = job.name;
    document.getElementById('cronJobDescription').value = job.description || '';
    document.getElementById('cronJobSchedule').value = job.schedule;
    document.getElementById('cronJobSkillPath').value = job.skill_md_path || '';
    document.getElementById('cronJobSkillMdContent').value = job.skill_md_content || '';
    
    // Populate new OpenClaw config fields
    document.getElementById('cronJobPayload').value = job.payload || '';
    document.getElementById('cronJobModel').value = job.model || 'google/gemini-3-flash-preview';
    document.getElementById('cronJobThinking').value = job.thinking || 'low';
    document.getElementById('cronJobTimeout').value = job.timeout_seconds || 300;
    document.getElementById('cronJobDeliver').checked = job.deliver !== false;
    
    // Reset validation errors
    document.getElementById('payloadError').style.display = 'none';
    document.getElementById('timeoutError').style.display = 'none';
    updatePayloadCharCount();
    
    document.getElementById('deleteCronJobBtn').style.display = 'block';
    document.getElementById('cronJobModal').classList.add('active');
}

function closeCronModal() {
    document.getElementById('cronJobModal').classList.remove('active');
}

// Cron Event Listeners
function setupCronEventListeners() {
    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    // New cron job button
    const newCronJobBtn = document.getElementById('newCronJobBtn');
    if (newCronJobBtn) {
        newCronJobBtn.addEventListener('click', openNewCronModal);
    }
    
    // Close cron modal
    const closeCronModalBtn = document.getElementById('closeCronModal');
    if (closeCronModalBtn) {
        closeCronModalBtn.addEventListener('click', closeCronModal);
    }
    
    // Cron job form
    const cronJobForm = document.getElementById('cronJobForm');
    if (cronJobForm) {
        cronJobForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Get all form values
            const skillMdContent = document.getElementById('cronJobSkillMdContent').value;
            const payload = document.getElementById('cronJobPayload').value;
            const timeout = parseInt(document.getElementById('cronJobTimeout').value, 10);

            // Validate payload (required, max 100KB)
            if (!payload.trim()) {
                showError('Task instructions (payload) are required.');
                document.getElementById('cronJobPayload').focus();
                return;
            }
            if (payload.length > 100000) {
                showError('Payload exceeds 100KB limit. Please reduce the size.');
                document.getElementById('cronJobPayload').focus();
                return;
            }

            // Validate timeout range
            if (isNaN(timeout) || timeout < 60 || timeout > 3600) {
                showError('Timeout must be between 60 and 3600 seconds.');
                document.getElementById('cronJobTimeout').focus();
                return;
            }

            // Validate size
            if (skillMdContent.length > 100000) {
                showError('Skill.md content exceeds 100KB limit. Please reduce the size.');
                return;
            }

            const cronJobData = {
                name: document.getElementById('cronJobName').value.trim(),
                description: document.getElementById('cronJobDescription').value.trim() || undefined,
                schedule: document.getElementById('cronJobSchedule').value.trim(),
                skill_md_path: document.getElementById('cronJobSkillPath').value.trim() || undefined,
                skill_md_content: skillMdContent || undefined,
                // New OpenClaw config fields
                payload: payload.trim(),
                model: document.getElementById('cronJobModel').value,
                thinking: document.getElementById('cronJobThinking').value,
                timeout_seconds: timeout,
                deliver: document.getElementById('cronJobDeliver').checked,
            };

            const id = document.getElementById('cronJobId').value;
            if (id) {
                await updateCronJob(parseInt(id, 10), cronJobData);
            } else {
                await createCronJob(cronJobData);
            }
        });
    }

    // Payload textarea event listeners
    const cronJobPayload = document.getElementById('cronJobPayload');
    const cronJobTimeout = document.getElementById('cronJobTimeout');
    
    if (cronJobPayload) {
        cronJobPayload.addEventListener('input', () => {
            updatePayloadCharCount();
            autoResizeTextarea(cronJobPayload);
        });
    }

    if (cronJobTimeout) {
        cronJobTimeout.addEventListener('input', validateTimeout);
        cronJobTimeout.addEventListener('blur', validateTimeout);
    }
    
    // Delete cron job button
    const deleteCronJobBtn = document.getElementById('deleteCronJobBtn');
    if (deleteCronJobBtn) {
        deleteCronJobBtn.addEventListener('click', () => {
            const id = parseInt(document.getElementById('cronJobId').value, 10);
            if (id) deleteCronJob(id);
        });
    }
    
    // Refresh cron jobs button
    const refreshCronBtn = document.getElementById('refreshCronBtn');
    if (refreshCronBtn) {
        refreshCronBtn.addEventListener('click', loadCronJobs);
    }
    
    // Close modal on backdrop click
    const cronJobModal = document.getElementById('cronJobModal');
    if (cronJobModal) {
        cronJobModal.addEventListener('click', (e) => {
            if (e.target === cronJobModal) closeCronModal();
        });
    }

    // Markdown Editor Modal Event Listeners
    const markdownEditorModal = document.getElementById('markdownEditorModal');
    const markdownEditorTextarea = document.getElementById('markdownEditorTextarea');
    const closeMarkdownEditorBtn = document.getElementById('closeMarkdownEditor');
    const cancelMarkdownEditorBtn = document.getElementById('cancelMarkdownEditor');
    const saveMarkdownEditorBtn = document.getElementById('saveMarkdownEditor');

    if (closeMarkdownEditorBtn) {
        closeMarkdownEditorBtn.addEventListener('click', closeMarkdownEditor);
    }

    if (cancelMarkdownEditorBtn) {
        cancelMarkdownEditorBtn.addEventListener('click', closeMarkdownEditor);
    }

    if (saveMarkdownEditorBtn) {
        saveMarkdownEditorBtn.addEventListener('click', saveMarkdownContent);
    }

    if (markdownEditorTextarea) {
        markdownEditorTextarea.addEventListener('input', () => {
            updateCharCount();
            updateMarkdownPreview();
            autoResizeTextarea(markdownEditorTextarea);
        });
    }

    if (markdownEditorModal) {
        markdownEditorModal.addEventListener('click', (e) => {
            if (e.target === markdownEditorModal) closeMarkdownEditor();
        });
    }
}

function startCronAutoRefresh() {
    // Refresh every 30 seconds
    cronRefreshInterval = setInterval(() => {
        if (currentTab === 'cron') {
            loadCronJobs();
        }
    }, 30000);
}

function stopCronAutoRefresh() {
    if (cronRefreshInterval) {
        clearInterval(cronRefreshInterval);
        cronRefreshInterval = null;
    }
}

// Markdown Editor State
let currentMarkdownJobId = null;

// Markdown Editor Functions
function openMarkdownEditor(jobId) {
    const job = cronJobs.find(j => j.id === jobId);
    if (!job) return;

    currentMarkdownJobId = jobId;
    const textarea = document.getElementById('markdownEditorTextarea');
    const title = document.getElementById('markdownEditorTitle');

    title.textContent = `Edit Skill.md - ${job.name}`;
    textarea.value = job.skill_md_content || '';

    updateCharCount();
    updateMarkdownPreview();

    const modal = document.getElementById('markdownEditorModal');
    modal.classList.add('active');

    // Auto-resize textarea
    autoResizeTextarea(textarea);
}

function closeMarkdownEditor() {
    const modal = document.getElementById('markdownEditorModal');
    modal.classList.remove('active');
    currentMarkdownJobId = null;
}

function updateCharCount() {
    const textarea = document.getElementById('markdownEditorTextarea');
    const countSpan = document.getElementById('charCount');
    const count = textarea.value.length;
    countSpan.textContent = count.toLocaleString();

    // Visual feedback if approaching limit
    if (count > 90000) {
        countSpan.style.color = '#ff6b6b';
    } else if (count > 70000) {
        countSpan.style.color = '#ffd93d';
    } else {
        countSpan.style.color = '';
    }
}

function updateMarkdownPreview() {
    const textarea = document.getElementById('markdownEditorTextarea');
    const preview = document.getElementById('markdownPreview');
    const content = textarea.value;

    if (typeof marked !== 'undefined') {
        preview.innerHTML = marked.parse(content);
    } else {
        // Fallback to simple HTML conversion
        preview.innerHTML = simpleMarkdownToHtml(content);
    }
}

function simpleMarkdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown
        // Escape HTML
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Headers
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        // Bold and italic
        .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        // Code blocks
        .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        // Lists
        .replace(/^\* (.*$)/gim, '<li>$1</li>')
        .replace(/^- (.*$)/gim, '<li>$1</li>')
        .replace(/(^<li>.*<\/li>\n?)+/gm, '<ul>$&</ul>')
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
        // Line breaks
        .replace(/\n/g, '<br>');

    return html;
}

function autoResizeTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 600) + 'px';
}

async function saveMarkdownContent() {
    if (!currentMarkdownJobId) return;

    const textarea = document.getElementById('markdownEditorTextarea');
    const content = textarea.value;

    // Validate size
    if (content.length > 100000) {
        showError('Content exceeds 100KB limit. Please reduce the size.');
        return;
    }

    try {
        await apiRequest(`/cron-jobs/${currentMarkdownJobId}`, {
            method: 'PATCH',
            body: JSON.stringify({ skill_md_content: content }),
        });

        // Show success message
        showToast('Skill.md content saved successfully', 'success');

        // Close modal and refresh
        closeMarkdownEditor();
        await loadCronJobs();
    } catch (error) {
        showError('Failed to save skill.md content: ' + error.message);
        showToast('Failed to save: ' + error.message, 'error');
    }
}

// Payload character counter
function updatePayloadCharCount() {
    const textarea = document.getElementById('cronJobPayload');
    const countSpan = document.getElementById('payloadCharCount');
    const errorSpan = document.getElementById('payloadError');
    
    if (!textarea || !countSpan) return;
    
    const count = textarea.value.length;
    countSpan.textContent = count.toLocaleString();
    
    // Visual feedback
    if (count > 100000) {
        countSpan.style.color = '#ff6b6b';
        if (errorSpan) errorSpan.style.display = 'inline';
    } else if (count > 90000) {
        countSpan.style.color = '#ffd93d';
        if (errorSpan) errorSpan.style.display = 'none';
    } else {
        countSpan.style.color = '';
        if (errorSpan) errorSpan.style.display = 'none';
    }
}

// Timeout validation
function validateTimeout() {
    const input = document.getElementById('cronJobTimeout');
    const errorSpan = document.getElementById('timeoutError');
    
    if (!input || !errorSpan) return;
    
    const value = parseInt(input.value, 10);
    
    if (isNaN(value) || value < 60 || value > 3600) {
        errorSpan.style.display = 'inline';
        input.style.borderColor = '#ff6b6b';
    } else {
        errorSpan.style.display = 'none';
        input.style.borderColor = '';
    }
}

// Model display names
const MODEL_DISPLAY_NAMES = {
    'google/gemini-3-flash-preview': '⚡ Gemini Flash',
    'anthropic/claude-opus-4-5': '🧠 Claude Opus',
    'openrouter/auto': '🔀 OpenRouter Auto'
};

// Get model display name
function getModelDisplayName(model) {
    return MODEL_DISPLAY_NAMES[model] || model || '⚡ Gemini Flash';
}

function showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    // Add styles if not already present
    if (!document.getElementById('toast-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-styles';
        style.textContent = `
            .toast {
                position: fixed;
                bottom: 20px;
                right: 20px;
                padding: 12px 20px;
                border-radius: 8px;
                color: white;
                font-weight: 500;
                z-index: 10000;
                animation: slideIn 0.3s ease;
                max-width: 300px;
            }
            .toast-success { background-color: #2ecc71; }
            .toast-error { background-color: #e74c3c; }
            .toast-info { background-color: #3498db; }
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Make functions available globally for inline onclick handlers
window.editCronJob = editCronJob;
window.runCronJob = runCronJob;
window.openMarkdownEditor = openMarkdownEditor;

// Start the app
init();
