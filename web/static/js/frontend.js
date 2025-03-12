let eventSource = null;
let currentTaskId = null;
let isExecuting = false;

async function executePrompt() {
    // Prevent multiple executions
    if (isExecuting) return;
    
    // Get the output div
    const outputDiv = document.getElementById('output');
    
    // Collect configuration parameters
    const deployType = document.getElementById('deployType').value;
    const config = {
        deploy_type: deployType,
        model_name: getSelectedModel(),
        api_key: document.getElementById('apiKey')?.value || '',
        prompt: document.getElementById('input').value
    };
    
    // Validate input
    if (!config.prompt.trim()) {
        showError("Please enter a request before executing.");
        return;
    }
    
    if (deployType === 'cloud' && !config.api_key) {
        showError("API key is required for cloud models.");
        return;
    }
    
    try {
        // Set executing state
        isExecuting = true;
        updateUIForExecution(true);
        
        // Clear previous output
        outputDiv.innerHTML = '<div class="text-slate-400 animate-pulse">Initializing task...</div>';
        
        // Start task
        const response = await fetch('/execute', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(config)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to start execution');
        }
        
        const { task_id } = await response.json();
        currentTaskId = task_id;
        
        // Connect to stream endpoint
        outputDiv.innerHTML = '<div class="text-slate-400">Task started. Waiting for results...</div>';
        
        eventSource = new EventSource(`/stream/${task_id}`);
        
        eventSource.onmessage = (e) => {
            try {
                const jsonStr = e.data.replace(/^data:/, '').trim();
                const data = JSON.parse(jsonStr);
                
                // Format the message based on type
                let messageHtml = '';
                
                if (data.type === 'error') {
                    messageHtml = `<div class="text-red-400 py-1">${formatContent(data.content)}</div>`;
                } else if (data.type === 'progress') {
                    messageHtml = `<div class="text-green-400 py-1">${formatContent(data.content)}</div>`;
                } else {
                    messageHtml = `<div class="py-1">${formatContent(data.content)}</div>`;
                }
                
                // Append to output
                outputDiv.innerHTML += messageHtml;
                outputDiv.scrollTop = outputDiv.scrollHeight;
            } catch (err) {
                console.error('Error parsing message:', err);
            }
        };
        
        eventSource.onerror = (err) => {
            console.error('EventSource error:', err);
            eventSource.close();
            outputDiv.innerHTML += '<div class="text-red-400 py-1">Connection interrupted</div>';
            updateUIForExecution(false);
            isExecuting = false;
        };
    } catch (error) {
        console.error('Execution error:', error);
        showError(error.message || 'An error occurred during execution');
        updateUIForExecution(false);
        isExecuting = false;
    }
}

async function stopExecution() {
    if (!currentTaskId || !eventSource) return;
    
    try {
        // Show stopping indicator
        const outputDiv = document.getElementById('output');
        outputDiv.innerHTML += '<div class="text-yellow-400 py-1">Stopping task...</div>';
        
        // Close event source
        eventSource.close();
        
        // Send stop request
        await fetch(`/stop/${currentTaskId}`, { method: 'POST' });
        
        // Update UI
        outputDiv.innerHTML += '<div class="text-slate-400 py-1">Task stopped</div>';
        updateUIForExecution(false);
        isExecuting = false;
        eventSource = null;
    } catch (error) {
        console.error('Error stopping execution:', error);
        showError('Failed to stop the task');
    }
}

// Get the selected model name based on deployment type
function getSelectedModel() {
    if (document.getElementById('deployType').value === 'local') {
        return document.getElementById('localModelSelect').value;
    }
    return document.getElementById('cloudModelSelect').value;
}

// Helper function to show errors
function showError(message) {
    const outputDiv = document.getElementById('output');
    outputDiv.innerHTML += `<div class="text-red-400 py-1">${message}</div>`;
    outputDiv.scrollTop = outputDiv.scrollHeight;
}

// Update UI elements based on execution state
function updateUIForExecution(isRunning) {
    const executeBtn = document.getElementById('executeBtn');
    const stopBtn = document.getElementById('stopBtn');
    const inputArea = document.getElementById('input');
    const deployType = document.getElementById('deployType');
    
    if (isRunning) {
        executeBtn.disabled = true;
        executeBtn.classList.add('opacity-50');
        stopBtn.disabled = false;
        stopBtn.classList.remove('opacity-50');
        inputArea.disabled = true;
        inputArea.classList.add('bg-slate-100');
        deployType.disabled = true;
    } else {
        executeBtn.disabled = false;
        executeBtn.classList.remove('opacity-50');
        stopBtn.disabled = true;
        stopBtn.classList.add('opacity-50');
        inputArea.disabled = false;
        inputArea.classList.remove('bg-slate-100');
        deployType.disabled = false;
    }
}

// Format content for display
function formatContent(content) {
    if (!content) return '';
    
    // Escape HTML
    let escaped = content.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    // Convert URLs to links
    escaped = escaped.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank" class="text-primary-400 hover:underline">$1</a>'
    );
    
    // Add syntax highlighting for code blocks (simple version)
    escaped = escaped.replace(
        /`([^`]+)`/g,
        '<code class="bg-slate-800 px-1 rounded">$1</code>'
    );
    
    return escaped;
}

// Initialize UI on load
document.addEventListener('DOMContentLoaded', () => {
    updateUIForExecution(false);
});