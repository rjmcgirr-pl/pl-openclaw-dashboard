// Task Board Frontend
// Auto-detect API URL based on environment
const IS_STAGING = window.location.hostname.includes('dev.') || 
                   window.location.hostname.includes('pl-openclaw-taskboard-staging');
const API_BASE_URL = window.API_BASE_URL || (IS_STAGING 
    ? 'https://taskboard-api-staging.rei-workers.workers.dev'
    : 'https://taskboard-api.rei-workers.workers.dev');
const GOOGLE_CLIENT_ID = window.GOOGLE_CLIENT_ID || '';

// Debug logging - visible on page
function debugLog(msg) {
    const timestamp = new Date().toLocaleTimeString();
    const line = `[${timestamp}] ${msg}`;
    console.log('[DEBUG]', line);
    const debugDiv = document.getElementById('debugLog');
    if (debugDiv) {
        const entry = document.createElement('div');
        entry.textContent = line;
        entry.style.marginBottom = '2px';
        debugDiv.appendChild(entry);
        debugDiv.scrollTop = debugDiv.scrollHeight;
    }
}

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
let currentUser = null;
let currentTab = 'tasks';

// Comments State
let currentComments = [];
let currentTaskId = null;
let replyingToCommentId = null;
let editingCommentId = null;
let mentionUsers = []; // Will be populated with users for @mentions

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
    debugLog('=== INIT START ===');
    debugLog('Environment: ' + (IS_STAGING ? 'STAGING' : 'PRODUCTION'));
    debugLog('API URL: ' + API_BASE_URL);
    
    // Hide staging-only elements on production
    if (!IS_STAGING) {
        document.querySelectorAll('.staging-only').forEach(el => {
            el.style.display = 'none';
        });
    }
    
    // ALWAYS set up event listeners first (including OAuth handlers)
    debugLog('Setting up event listeners...');
    setupEventListeners();
    setupOAuthListeners();
    
    // Check if user is authenticated
    try {
        debugLog('Checking session at /auth/me...');
        
        const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
            credentials: 'include'
        });
        
        debugLog('/auth/me response: ' + meResponse.status);
        
        if (meResponse.ok) {
            const data = await meResponse.json();
            currentUser = data.user;
            debugLog('User authenticated: ' + currentUser.name);
            await initializeDashboard();
        } else if (meResponse.status === 401) {
            debugLog('No active session (401), showing login');
            showLoginModal();
        } else {
            debugLog('Auth error: ' + meResponse.status);
            showLoginModal();
        }
    } catch (error) {
        debugLog('Auth check FAILED: ' + error.message);
        showLoginModal();
    }
    debugLog('=== INIT END ===');
}

// Initialize dashboard after authentication
async function initializeDashboard() {
    await loadTasks();
    await loadCronJobs();
    setupDragAndDrop();
    setupCronEventListeners();
    startAutoRefresh();
    startCronAutoRefresh();
    updateUserUI();
    console.log('[Init] Dashboard initialized successfully');
}

// Update UI with user info
function updateUserUI() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.style.display = 'block';
        if (currentUser) {
            logoutBtn.title = `Logout (${currentUser.name})`;
        }
    }
}

// OAuth / Login Functions
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

let oauthPopup = null;

function initiateGoogleAuth() {
    debugLog('=== GOOGLE AUTH CLICKED ===');
    
    // Clear any previous error
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
    
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    
    const popupUrl = `${API_BASE_URL}/auth/google`;
    debugLog('Opening popup to: ' + popupUrl);
    
    oauthPopup = window.open(
        popupUrl,
        'googleOAuth',
        `width=${width},height=${height},top=${top},left=${left},toolbar=no,menubar=no,location=no,status=no`
    );
    
    // Check if popup was blocked
    if (!oauthPopup || oauthPopup.closed || typeof oauthPopup.closed === 'undefined') {
        debugLog('ERROR: Popup was blocked by browser!');
        showLoginError('Popup blocked. Please allow popups for this site and try again.');
        return;
    }
    
    debugLog('Popup opened successfully');
    
    // Start polling to detect if popup is closed
    startOAuthPolling();
}

function setupOAuthListeners() {
    // Listen for OAuth messages from popup
    window.addEventListener('message', async (event) => {
        // Verify the message is from our API
        const apiUrl = new URL(API_BASE_URL);
        if (event.origin !== `${apiUrl.protocol}//${apiUrl.host}`) {
            return;
        }

        if (event.data.type === 'oauth-success') {
            console.log('[OAuth] Login successful');
            currentUser = event.data.user;
            hideLoginModal();
            clearOAuthPolling();
            await initializeDashboard();
            if (oauthPopup && !oauthPopup.closed) {
                oauthPopup.close();
            }
        } else if (event.data.type === 'oauth-error') {
            console.error('[OAuth] Login failed:', event.data.error);
            clearOAuthPolling();
            showLoginError('Login failed: ' + event.data.error);
            if (oauthPopup && !oauthPopup.closed) {
                oauthPopup.close();
            }
            // Ensure login modal is shown
            showLoginModal();
        }
    });
}

let oauthPollInterval = null;

function clearOAuthPolling() {
    if (oauthPollInterval) {
        clearInterval(oauthPollInterval);
        oauthPollInterval = null;
    }
}

function startOAuthPolling() {
    clearOAuthPolling();
    
    // Poll every 500ms to check if popup was closed
    oauthPollInterval = setInterval(() => {
        if (oauthPopup && oauthPopup.closed) {
            console.log('[OAuth] Popup closed by user');
            clearOAuthPolling();
            
            // Check if we got a session (user might have closed after success)
            setTimeout(async () => {
                try {
                    const meResponse = await fetch(`${API_BASE_URL}/auth/me`, {
                        credentials: 'include'
                    });
                    
                    if (meResponse.ok) {
                        const data = await meResponse.json();
                        currentUser = data.user;
                        console.log('[OAuth] Session found after popup close');
                        hideLoginModal();
                        await initializeDashboard();
                    } else {
                        // No session, show login again
                        console.log('[OAuth] No session after popup close');
                        showLoginError('Login was cancelled. Please try again.');
                        showLoginModal();
                    }
                } catch (error) {
                    console.log('[OAuth] Error checking session:', error.message);
                    showLoginError('Unable to verify login. Please try again.');
                    showLoginModal();
                }
            }, 500);
        }
    }, 500);
    
    // Stop polling after 2 minutes (timeout)
    setTimeout(() => {
        clearOAuthPolling();
    }, 120000);
}

function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }
}

async function handleLogout() {
    try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    currentUser = null;
    stopAutoRefresh();
    stopCronAutoRefresh();
    location.reload();
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    console.log(`[API] Request to: ${url}`, options.method || 'GET');
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
    };
    
    let response;
    try {
        response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include', // Include cookies for session
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
            currentUser = null;
            showLoginModal();
            throw new Error('Authentication required. Please log in.');
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
    console.log('[Delete] deleteTask called with ID:', id);
    
    if (!confirm('Are you sure you want to delete this task?')) {
        console.log('[Delete] User cancelled deletion');
        return;
    }
    
    console.log('[Delete] User confirmed deletion, calling API...');
    
    try {
        await apiRequest(`/tasks/${id}`, {
            method: 'DELETE',
        });
        console.log('[Delete] API call successful');
        await loadTasks();
        closeModal();
    } catch (error) {
        console.error('[Delete] API call failed:', error);
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
    currentTaskIdForComments = null;
    currentComments = [];

    // Hide tabs for new task (no comments yet)
    const tabsContainer = document.getElementById('taskModalTabs');
    if (tabsContainer) tabsContainer.style.display = 'none';

    // Reset to Details tab
    document.querySelectorAll('.modal-tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    const detailsTab = document.querySelector('.modal-tab-btn[data-tab="details"]');
    if (detailsTab) detailsTab.classList.add('active');
    const detailsContent = document.getElementById('detailsTab');
    if (detailsContent) detailsContent.classList.add('active');

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
    currentTaskIdForComments = task.id;
    
    // Attach delete handler directly to button (ensures it works)
    deleteTaskBtn.onclick = () => {
        const id = parseInt(taskIdField.value, 10);
        console.log('[Delete] Button clicked, task ID:', id);
        if (id) deleteTask(id);
    };

    // Show tabs for existing task (has comments)
    const tabsContainer = document.getElementById('taskModalTabs');
    if (tabsContainer) tabsContainer.style.display = 'flex';

    // Reset to Details tab
    document.querySelectorAll('.modal-tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove('active'));
    const detailsTab = document.querySelector('.modal-tab-btn[data-tab="details"]');
    if (detailsTab) detailsTab.classList.add('active');
    const detailsContent = document.getElementById('detailsTab');
    if (detailsContent) detailsContent.classList.add('active');

    taskModal.classList.add('active');
}

function closeModal() {
    taskModal.classList.remove('active');
    currentTaskIdForComments = null;
    currentComments = [];
}

// Event Listeners
function setupEventListeners() {
    newTaskBtn.addEventListener('click', openNewModal);
    closeModalBtn.addEventListener('click', closeModal);
    
    // Use event delegation for delete button - more robust against DOM changes
    // The delete button is inside the task modal, so we listen on the modal
    if (taskModal) {
        taskModal.addEventListener('click', (e) => {
            // Check if the clicked element is the delete button or inside it
            const deleteBtn = e.target.closest('#deleteTaskBtn');
            if (deleteBtn) {
                e.preventDefault();
                e.stopPropagation();
                const id = parseInt(taskIdField.value, 10);
                console.log('[Delete] Button clicked via delegation, task ID:', id);
                if (id) deleteTask(id);
            }
        });
        console.log('[Init] Delete button event delegation attached to modal');
    } else {
        console.error('[Init] Task modal NOT found in DOM');
    }

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

    // Google Login button
    const googleLoginBtn = document.getElementById('googleLoginBtn');
    debugLog('Google login button found: ' + (googleLoginBtn ? 'YES' : 'NO'));
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            debugLog('Button clicked via addEventListener');
            initiateGoogleAuth();
        });
        debugLog('Event listener attached to button');
    } else {
        debugLog('ERROR: Google login button NOT found in DOM');
    }

    // Logout button
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Smart polling: listen for tab visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Comments tab switching
    const modalTabs = document.querySelectorAll('.modal-tab-btn');
    modalTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.dataset.tab;
            if (!tabName) return;

            // Update active tab
            modalTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Show/hide tab content
            document.querySelectorAll('.modal-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            const tabContent = document.getElementById(tabName + 'Tab');
            if (tabContent) {
                tabContent.classList.add('active');
            }

            // Load comments if comments tab is clicked
            if (tabName === 'comments' && currentTaskIdForComments) {
                loadComments(currentTaskIdForComments);
            }
        });
    });

    // Comment submit button
    const submitCommentBtn = document.getElementById('submitCommentBtn');
    if (submitCommentBtn) {
        submitCommentBtn.addEventListener('click', submitComment);
    }

    // Comment input - enable/disable submit button based on content
    const commentInput = document.getElementById('commentInput');
    const commentCharCount = document.getElementById('commentCharCount');
    if (commentInput && submitCommentBtn) {
        commentInput.addEventListener('input', () => {
            const length = commentInput.value.length;
            submitCommentBtn.disabled = length === 0;
            if (commentCharCount) {
                commentCharCount.textContent = length;
            }
        });
        // Initial state
        submitCommentBtn.disabled = commentInput.value.length === 0;
    }

    // Comment input - submit on Enter (Shift+Enter for new line)
    if (commentInput) {
        commentInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!submitCommentBtn.disabled) {
                    submitComment();
                }
            }
        });
    }
}

// Smart polling configuration
const REFRESH_INTERVAL_ACTIVE = 60000;  // 60 seconds when tab is visible
const REFRESH_INTERVAL_IDLE = 300000;   // 5 minutes when tab is hidden

// Auto-refresh with smart polling
function startAutoRefresh() {
    // Clear any existing interval
    stopAutoRefresh();
    
    // Set initial interval based on current visibility
    const interval = document.hidden ? REFRESH_INTERVAL_IDLE : REFRESH_INTERVAL_ACTIVE;
    
    autoRefreshInterval = setInterval(() => {
        loadTasks();
    }, interval);
    
    console.log(`[AutoRefresh] Started with ${interval/1000}s interval (hidden: ${document.hidden})`);
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Handle visibility change for smart polling
function handleVisibilityChange() {
    if (document.hidden) {
        // Tab is hidden - slow down polling
        console.log('[Visibility] Tab hidden, slowing to 5min interval');
        stopAutoRefresh();
        stopCronAutoRefresh();
        autoRefreshInterval = setInterval(() => {
            loadTasks();
        }, REFRESH_INTERVAL_IDLE);
        cronRefreshInterval = setInterval(() => {
            if (currentTab === 'cron') {
                loadCronJobs();
            }
        }, REFRESH_INTERVAL_IDLE);
    } else {
        // Tab is visible - speed up polling
        console.log('[Visibility] Tab visible, speeding to 60s interval');
        stopAutoRefresh();
        stopCronAutoRefresh();
        autoRefreshInterval = setInterval(() => {
            loadTasks();
        }, REFRESH_INTERVAL_ACTIVE);
        cronRefreshInterval = setInterval(() => {
            if (currentTab === 'cron') {
                loadCronJobs();
            }
        }, REFRESH_INTERVAL_ACTIVE);
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
    // Clear any existing interval
    stopCronAutoRefresh();
    
    // Set initial interval based on current visibility
    const interval = document.hidden ? REFRESH_INTERVAL_IDLE : REFRESH_INTERVAL_ACTIVE;
    
    cronRefreshInterval = setInterval(() => {
        if (currentTab === 'cron') {
            loadCronJobs();
        }
    }, interval);
    
    console.log(`[CronAutoRefresh] Started with ${interval/1000}s interval (hidden: ${document.hidden})`);
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

// Start the app when DOM is ready - CRITICAL: must wait for debugLog element
function startApp() {
    debugLog('Script loaded, DOM ready');
    init();
}

// Comments Functions (state variables already declared at top of file)
async function loadComments(taskId) {
    const commentsList = document.getElementById('commentsList');
    if (commentsList) {
        commentsList.innerHTML = '<div class="comments-loading">Loading comments...</div>';
    }
    
    try {
        const data = await apiRequest(`/tasks/${taskId}/comments`);
        currentComments = data.comments || [];
        currentTaskIdForComments = taskId;
        renderComments();
    } catch (error) {
        console.error('Failed to load comments:', error);
        if (commentsList) {
            commentsList.innerHTML = '<div class="comments-empty">Failed to load comments. <button onclick="loadComments(' + taskId + ')" style="background:none;border:none;color:var(--accent-primary);cursor:pointer;text-decoration:underline;">Try again</button></div>';
        }
    }
}

function renderComments() {
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;

    if (currentComments.length === 0) {
        commentsList.innerHTML = '<div class="comments-empty">No comments yet. Add one below!</div>';
        return;
    }

    const html = currentComments.map(comment => {
        const author = comment.author_name || 'Unknown';
        const text = escapeHtml(comment.content || '');
        const time = formatDate(comment.created_at);
        return `
            <div class="comment-item">
                <div class="comment-header">
                    <span class="comment-author">${escapeHtml(author)}</span>
                    <span class="comment-time">${time}</span>
                </div>
                <div class="comment-text">${text}</div>
            </div>
        `;
    }).join('');

    commentsList.innerHTML = html;
}

async function submitComment() {
    const commentInput = document.getElementById('commentInput');
    if (!commentInput || !currentTaskIdForComments) return;

    const content = commentInput.value.trim();
    if (!content) return;

    try {
        await apiRequest(`/tasks/${currentTaskIdForComments}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content }),
        });
        commentInput.value = '';
        await loadComments(currentTaskIdForComments);
    } catch (error) {
        console.error('Failed to submit comment:', error);
        showError('Failed to submit comment: ' + error.message);
    }
}

// Make functions available globally for inline onclick handlers
window.editCronJob = editCronJob;
window.runCronJob = runCronJob;
window.openMarkdownEditor = openMarkdownEditor;
window.initiateGoogleAuth = initiateGoogleAuth;
window.loadComments = loadComments;
window.submitComment = submitComment;

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}
