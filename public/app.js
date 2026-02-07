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
                            ${job.skill_md_path ? `<span>📄 <a href="${escapeHtml(job.skill_md_path)}" target="_blank">skill.md</a></span>` : ''}
                        </div>
                    </div>
                    <span class="cron-job-badge ${job.last_status}">${statusLabel}</span>
                </div>
                <span class="cron-job-chevron">▼</span>
            </div>
            <div class="cron-job-details">
                ${job.description ? `<div class="cron-job-description">${escapeHtml(job.description)}</div>` : ''}
                <div class="cron-job-output">${job.last_output ? escapeHtml(job.last_output) : ''}</div>
                <div class="cron-job-actions">
                    <button class="btn-secondary" onclick="editCronJob(${job.id})">Edit</button>
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
            
            const cronJobData = {
                name: document.getElementById('cronJobName').value.trim(),
                description: document.getElementById('cronJobDescription').value.trim() || undefined,
                schedule: document.getElementById('cronJobSchedule').value.trim(),
                skill_md_path: document.getElementById('cronJobSkillPath').value.trim() || undefined,
            };

            const id = document.getElementById('cronJobId').value;
            if (id) {
                await updateCronJob(parseInt(id, 10), cronJobData);
            } else {
                await createCronJob(cronJobData);
            }
        });
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

// Make functions available globally for inline onclick handlers
window.editCronJob = editCronJob;
window.runCronJob = runCronJob;

// Start the app
init();
