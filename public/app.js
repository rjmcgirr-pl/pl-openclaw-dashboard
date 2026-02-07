// Task Board Frontend
// Configure this to point to your Worker API
// For Cloudflare Pages deployment, set this to your Worker URL:
// const API_BASE_URL = 'https://taskboard-api.your-account.workers.dev';
// 
// Auto-detect: Uses same origin for local dev, or derives from hostname for Pages
const API_BASE_URL = (() => {
    // If running on pages.dev, construct the Worker URL
    if (window.location.hostname.includes('pages.dev')) {
        // Extract account subdomain from pages URL
        // e.g., taskboard.your-account.pages.dev -> your-account
        const parts = window.location.hostname.split('.');
        if (parts.length >= 3) {
            const account = parts[parts.length - 3]; // second-to-last before pages.dev
            return `https://taskboard-api.${account}.workers.dev`;
        }
    }
    // Default: same origin (for local development)
    return '';
})();

// Status configuration
const STATUSES = ['inbox', 'up_next', 'in_progress', 'in_review', 'done'];
const STATUS_LABELS = {
    inbox: '📥 Inbox',
    up_next: '⬆️ Up Next',
    in_progress: '🔨 In Progress',
    in_review: '👀 In Review',
    done: '✅ Done'
};

// State
let tasks = [];
let draggedTask = null;
let autoRefreshInterval = null;

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
    await loadTasks();
    setupEventListeners();
    setupDragAndDrop();
    startAutoRefresh();
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options.headers,
        },
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
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

// Start the app
init();
