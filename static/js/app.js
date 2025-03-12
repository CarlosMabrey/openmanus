/**
 * OpenManus Frontend Application
 * 
 * This script handles the frontend functionality for the OpenManus AI agent platform.
 * It manages the execution of tasks, streaming of results, and UI updates.
 * Displays agent reasoning, web browsing, and tool usage in a conversation format.
 */

// Global state
let eventSource = null;
let currentTaskId = null;
let isExecuting = false;
let savedApiKeys = {};
let latestScreenshot = null;

// DOM elements
const elements = {
    executeBtn: document.getElementById('executeBtn'),
    stopBtn: document.getElementById('stopBtn'),
    clearBtn: document.getElementById('clearBtn'),
    exportPdfBtn: document.getElementById('exportPdfBtn'),
    exportOptions: document.getElementById('exportOptions'),
    input: document.getElementById('input'),
    conversation: document.getElementById('conversation'),
    deployType: document.getElementById('deployType'),
    apiKey: document.getElementById('apiKey'),
    localModelSelect: document.getElementById('localModelSelect'),
    cloudModelSelect: document.getElementById('cloudModelSelect'),
    saveKeyBtn: document.getElementById('saveKeyBtn'),
    clearKeyBtn: document.getElementById('clearKeyBtn'),
    maxSteps: document.getElementById('maxSteps'),
    browserViewModal: document.getElementById('browserViewModal'),
    browserViewImage: document.getElementById('browserViewImage'),
    browserViewUrl: document.getElementById('browserViewUrl'),
    browserViewTitle: document.getElementById('browserViewTitle'),
    closeBrowserViewBtn: document.getElementById('closeBrowserViewBtn')
};

/**
 * Initialize the application
 */
function init() {
    // Set up event listeners
    elements.executeBtn.addEventListener('click', executePrompt);
    elements.stopBtn.addEventListener('click', stopExecution);
    elements.clearBtn.addEventListener('click', clearConversation);
    elements.exportPdfBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        
        // Position the options dropdown
        const rect = elements.exportPdfBtn.getBoundingClientRect();
        elements.exportOptions.style.top = `${rect.bottom}px`;
        elements.exportOptions.style.right = `${window.innerWidth - rect.right}px`;
        
        // Toggle visibility
        elements.exportOptions.classList.toggle('hidden');
    });
    
    // Set up API key persistence
    if (elements.saveKeyBtn) {
        elements.saveKeyBtn.addEventListener('click', saveApiKey);
    }
    
    if (elements.clearKeyBtn) {
        elements.clearKeyBtn.addEventListener('click', clearSavedApiKey);
    }
    
    // Set up browser view modal
    if (elements.closeBrowserViewBtn) {
        elements.closeBrowserViewBtn.addEventListener('click', closeBrowserView);
    }
    
    // Set up example request buttons
    setupExampleRequests();
    
    // Add export options
    addExportOptions();
    
    // Load saved API keys
    loadSavedApiKeys();
    
    // Initialize UI state
    updateUIForExecution(false);
    
    // Update API key field if we have a saved key for the selected model
    updateApiKeyField();
    
    // Add change listener to cloud model select
    if (elements.cloudModelSelect) {
        elements.cloudModelSelect.addEventListener('change', updateApiKeyField);
    }
}

/**
 * Set up example request buttons
 */
function setupExampleRequests() {
    const exampleRequests = {
        "Japan Travel Itinerary": `I need a 7-day Japan itinerary for April 15-23 from Seattle, with a $2500-5000 budget for my fiancée and me. We love historical sites, hidden gems, and Japanese culture (kendo, tea ceremonies, Zen meditation). We want to see Nara's deer and explore cities on foot. I plan to propose during this trip and need a special location recommendation. Please provide a detailed itinerary and a simple HTML travel handbook with maps, attraction descriptions, essential Japanese phrases, and travel tips we can reference throughout our journey.`,
        
        "Data Analysis": `I have a CSV dataset of customer purchase history with columns for customer_id, purchase_date, product_id, quantity, and price. Please help me analyze this data to identify: 1) Monthly sales trends over the past year, 2) Top 10 best-selling products, 3) Customer segmentation based on purchase frequency and average order value, and 4) Product recommendations for cross-selling opportunities. Create visualizations for each analysis and provide actionable business insights based on the findings.`,
        
        "Website Creation": `I need a personal portfolio website for my photography business. The site should have: 1) A responsive home page with a gallery showcase, 2) An about page with my bio and equipment list, 3) A services page with pricing packages, 4) A contact form, and 5) Integration with Instagram to automatically display my latest posts. Please create a clean, modern design with a dark theme that makes my photos stand out. Use HTML, CSS, and JavaScript, and make sure it's mobile-friendly.`,
        
        "Research Summary": `I need a comprehensive research summary on the latest advancements in renewable energy technologies, focusing on solar, wind, and hydrogen power. Please include: 1) Current efficiency rates and cost comparisons, 2) Breakthrough technologies from the past 2 years, 3) Major companies and countries leading innovation, 4) Challenges and limitations, and 5) Future outlook for the next decade. Format the summary with clear sections, include relevant statistics, and cite reliable sources.`
    };
    
    // Add click event listeners to all example request buttons
    document.querySelectorAll('.example-request-btn').forEach(button => {
        button.addEventListener('click', () => {
            const requestType = button.textContent;
            if (exampleRequests[requestType]) {
                elements.input.value = exampleRequests[requestType];
                elements.input.focus();
                // Scroll to the bottom of the textarea
                elements.input.scrollTop = elements.input.scrollHeight;
            }
        });
    });
}

/**
 * Load saved API keys from localStorage
 */
function loadSavedApiKeys() {
    const savedKeys = localStorage.getItem('openManus_apiKeys');
    if (savedKeys) {
        try {
            savedApiKeys = JSON.parse(savedKeys);
        } catch (e) {
            console.error('Error loading saved API keys:', e);
            savedApiKeys = {};
        }
    }
}

/**
 * Save the current API key for the selected model
 */
function saveApiKey() {
    const model = elements.cloudModelSelect.value;
    const apiKey = elements.apiKey.value.trim();
    
    if (!apiKey) {
        showSystemMessage("Please enter an API key to save", "warning");
        return;
    }
    
    // Save the API key
    savedApiKeys[model] = apiKey;
    localStorage.setItem('openManus_apiKeys', JSON.stringify(savedApiKeys));
    
    showSystemMessage(`API key saved for ${model}`, "success");
}

/**
 * Clear the saved API key for the selected model
 */
function clearSavedApiKey() {
    const model = elements.cloudModelSelect.value;
    
    if (savedApiKeys[model]) {
        delete savedApiKeys[model];
        localStorage.setItem('openManus_apiKeys', JSON.stringify(savedApiKeys));
        elements.apiKey.value = '';
        showSystemMessage(`API key for ${model} has been removed`, "info");
    } else {
        showSystemMessage(`No saved API key found for ${model}`, "warning");
    }
}

/**
 * Update the API key field with the saved key for the selected model
 */
function updateApiKeyField() {
    if (elements.deployType.value !== 'cloud') return;
    
    const model = elements.cloudModelSelect.value;
    if (savedApiKeys[model]) {
        elements.apiKey.value = savedApiKeys[model];
    } else {
        elements.apiKey.value = '';
    }
}

/**
 * Execute a prompt with the configured model
 */
async function executePrompt() {
    // Prevent multiple executions
    if (isExecuting) return;
    
    // Get user input
    const userPrompt = elements.input.value.trim();
    
    // Validate input
    if (!userPrompt) {
        showSystemMessage("Please enter a request before executing.", "error");
        return;
    }
    
    // Get max steps
    const maxSteps = parseInt(elements.maxSteps.value, 10) || 30;
    
    // Validate max steps
    if (maxSteps < 1 || maxSteps > 100) {
        showSystemMessage("Max steps must be between 1 and 100.", "error");
        return;
    }
    
    // Collect configuration parameters
    const deployType = elements.deployType.value;
    const config = {
        deploy_type: deployType,
        model_name: getSelectedModel(),
        api_key: elements.apiKey?.value || '',
        prompt: userPrompt,
        max_steps: maxSteps
    };
    
    if (deployType === 'cloud' && !config.api_key) {
        showSystemMessage("API key is required for cloud models.", "error");
        return;
    }
    
    try {
        // Set executing state
        isExecuting = true;
        updateUIForExecution(true);
        
        // Add user message to conversation
        addUserMessage(userPrompt);
        
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
        
        // Create typing indicator
        const typingIndicator = createTypingIndicator();
        elements.conversation.appendChild(typingIndicator);
        scrollToBottom();
        
        // Connect to event stream
        connectToEventStream(task_id, typingIndicator);
        
    } catch (error) {
        console.error('Execution error:', error);
        showSystemMessage(error.message || 'An error occurred during execution', "error");
        updateUIForExecution(false);
        isExecuting = false;
    }
}

/**
 * Connect to the server-sent events stream
 */
function connectToEventStream(taskId, typingIndicator) {
    // Close any existing connection
    if (eventSource) {
        eventSource.close();
    }
    
    eventSource = new EventSource(`/stream/${taskId}`);
    
    // Track the current agent message being built
    let currentAgentMessage = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3;
    
    eventSource.onmessage = (e) => {
        try {
            // Reset reconnect attempts on successful message
            reconnectAttempts = 0;
            
            // Remove typing indicator when we get a message
            if (typingIndicator && typingIndicator.parentNode) {
                typingIndicator.parentNode.removeChild(typingIndicator);
            }
            
            // Safely parse the event data
            let data;
            try {
                // First check if e.data exists and is a string
                if (typeof e.data !== 'string') {
                    console.warn('Event data is not a string:', e.data);
                    // Try to convert to string if possible
                    const dataStr = String(e.data);
                    const jsonStr = dataStr.replace(/^data:/, '').trim();
                    data = JSON.parse(jsonStr);
                } else {
                    const jsonStr = e.data.replace(/^data:/, '').trim();
                    data = JSON.parse(jsonStr);
                }
            } catch (parseErr) {
                console.error('Error parsing event data:', parseErr, e.data);
                // Create a fallback data object
                data = {
                    type: 'error',
                    content: `Error processing message: ${parseErr.message}`,
                    timestamp: new Date().toISOString()
                };
            }
            
            // Process the message based on type
            processStreamMessage(data, currentAgentMessage);
            
            // Add typing indicator back after message
            elements.conversation.appendChild(typingIndicator);
            
            // Scroll to bottom
            scrollToBottom();
        } catch (err) {
            console.error('Error handling message:', err);
            showSystemMessage(`Error processing message: ${err.message}`, 'error');
        }
    };
    
    eventSource.onerror = (err) => {
        console.error('EventSource error:', err);
        
        // Remove typing indicator
        if (typingIndicator && typingIndicator.parentNode) {
            typingIndicator.parentNode.removeChild(typingIndicator);
        }
        
        // Try to reconnect if the task is still running
        if (isExecuting && reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            showSystemMessage(`Connection lost. Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`, "warning");
            
            // Close the current connection
            eventSource.close();
            
            // Wait a moment before reconnecting
            setTimeout(() => {
                connectToEventStream(taskId, createTypingIndicator());
            }, 1000 * reconnectAttempts); // Exponential backoff
            
            return;
        }
        
        // If we've exceeded reconnect attempts or execution is done, close the connection
        eventSource.close();
        eventSource = null;
        
        if (isExecuting) {
            showSystemMessage("Connection interrupted. The task may still be running in the background.", "error");
            updateUIForExecution(false);
            isExecuting = false;
        }
    };
    
    // Handle connection open
    eventSource.onopen = () => {
        if (reconnectAttempts > 0) {
            showSystemMessage("Connection re-established!", "success");
        }
    };
}

/**
 * Process a message from the event stream
 */
function processStreamMessage(data, currentAgentMessage) {
    // Skip heartbeat messages
    if (!data.content) return;
    
    // Ensure content is properly formatted
    let content = data.content;
    // If content is an object, keep it as is for specific message types that expect objects
    if (typeof content === 'object' && !Array.isArray(content) && content !== null) {
        if (data.type !== 'browser_screenshot' && data.type !== 'browser_navigation') {
            // For message types that expect strings, convert objects to strings
            content = JSON.stringify(content);
        }
    } else if (typeof content !== 'string') {
        // Convert non-string, non-object content to string
        content = String(content);
    }
    
    const messageType = data.type || 'log';
    
    // Track displayed steps to avoid redundancy
    if (!window.displayedSteps) {
        window.displayedSteps = new Set();
    }
    
    // Create a unique message identifier if the message has a step
    let messageId = null;
    if (data.step) {
        messageId = `${messageType}-${data.step}`;
        // Skip if we've already displayed this exact step/type combination
        if (window.displayedSteps.has(messageId)) {
            return;
        }
        window.displayedSteps.add(messageId);
    }
    
    // Handle different message types
    switch (messageType) {
        case 'question':
            addAgentQuestion(content);
            break;
            
        case 'success':
            // Final response from the agent
            displayFinalResponse(content);
            updateUIForExecution(false);
            isExecuting = false;
            break;
            
        case 'error':
            showSystemMessage(content, "error");
            updateUIForExecution(false);
            isExecuting = false;
            break;
            
        case 'reasoning':
            addReasoningMessage(content);
            break;
            
        case 'tool':
            addToolUsageMessage(content);
            break;
            
        case 'tool_result':
            addToolResultMessage(content);
            break;
            
        case 'browser_screenshot':
            handleBrowserScreenshot(content);
            break;
            
        case 'browser_navigation':
            addWebBrowsingMessage(content);
            break;
            
        case 'status':
            showSystemMessage(content, "info");
            
            if (content.includes("Maximum steps reached") || 
                content.includes("Task completed successfully")) {
                updateUIForExecution(false);
                isExecuting = false;
            }
            break;
            
        case 'summary':
            // Display the summary in a collapsible section
            showStructuredSummary(content);
            break;
            
        case 'info':
            // Only show important info messages
            if (content.includes("Connected") || 
                content.includes("completed") || 
                content.includes("paused") || 
                content.includes("resumed")) {
                showSystemMessage(content, "info");
            }
            break;
            
        default:
            // For other log messages, only show if they seem important
            if (content.includes("Error") || 
                content.includes("Warning") || 
                content.includes("Failed")) {
                showSystemMessage(content, "warning");
            }
    }
}

/**
 * Display a final response from the agent
 */
function displayFinalResponse(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble agent-message final-response';
    
    // Add a header to make it clear this is the final response
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-green font-medium mb-2">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Final Response
        </div>
        <div class="pb-2 mb-2 border-b border-apple-200">
            ${formatContent(content)}
        </div>
        <div class="text-xs text-apple-500 mt-2">
            <button id="clear-conversation" class="text-accent-blue hover:underline">
                Start a new conversation
            </button>
            or
            <button id="export-conversation" class="text-accent-blue hover:underline">
                Export this conversation
            </button>
        </div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
    
    // Add event listeners for the buttons
    document.getElementById('clear-conversation').addEventListener('click', clearConversation);
    document.getElementById('export-conversation').addEventListener('click', exportConversationToPdf);
}

/**
 * Display a structured summary of the conversation
 */
function showStructuredSummary(summaryContent) {
    const summaryDiv = document.createElement('div');
    summaryDiv.className = 'my-4 rounded-lg border border-apple-200 overflow-hidden';
    
    // Create a unique ID for this summary
    const summaryId = 'summary-' + Date.now();
    const contentId = 'summary-content-' + Date.now();
    
    // Format with a collapsible section
    summaryDiv.innerHTML = `
        <div class="flex items-center justify-between px-4 py-3 bg-apple-50 cursor-pointer" id="${summaryId}">
            <div class="flex items-center">
                <svg class="w-4 h-4 mr-2 text-accent-blue" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 5H7C5.89543 5 5 5.89543 5 7V19C5 20.1046 5.89543 21 7 21H17C18.1046 21 19 20.1046 19 19V7C19 5.89543 18.1046 5 17 5H15M9 5C9 6.10457 9.89543 7 11 7H13C14.1046 7 15 6.10457 15 5M9 5C9 3.89543 9.89543 3 11 3H13C14.1046 3 15 3.89543 15 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 12H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 16H15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="font-medium">Summary of Actions</span>
            </div>
            <svg class="w-5 h-5 transform transition-transform" id="${summaryId}-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 9L12 16L5 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div class="px-4 py-3 bg-white summary-content" id="${contentId}" style="display: none;">
            ${summaryContent}
        </div>
    `;
    
    elements.conversation.appendChild(summaryDiv);
    
    // Add toggle functionality
    document.getElementById(summaryId).addEventListener('click', () => {
        const content = document.getElementById(contentId);
        const icon = document.getElementById(`${summaryId}-icon`);
        
        if (content.style.display === 'none') {
            content.style.display = 'block';
            icon.classList.add('rotate-180');
        } else {
            content.style.display = 'none';
            icon.classList.remove('rotate-180');
        }
    });
}

function processDetailedConversation(detailsContent) {
    // If detailsContent is not a string, convert it to a string
    if (typeof detailsContent !== 'string') {
        try {
            // If it's an object, try to stringify it
            if (typeof detailsContent === 'object' && detailsContent !== null) {
                detailsContent = JSON.stringify(detailsContent, null, 2);
            } else {
                // Otherwise, convert to string
                detailsContent = String(detailsContent);
            }
        } catch (e) {
            console.error("Error processing message:", e);
            showSystemMessage("Error processing message: " + e.message, "error");
            return;
        }
    }
    
    const messageLines = detailsContent.split('\n\n').filter(line => line.trim());
    
    // Process each message based on its prefix
    messageLines.forEach(message => {
        // Ensure message is a string
        const messageStr = String(message);
        
        if (messageStr.startsWith("MODEL QUESTION:")) {
            const questionContent = messageStr.replace("MODEL QUESTION:", "").trim();
            addAgentQuestion(questionContent);
        } else if (messageStr.startsWith("USER RESPONSE:")) {
            const responseContent = messageStr.replace("USER RESPONSE:", "").trim();
            // User responses are already displayed by addUserMessage
        } else if (messageStr.startsWith("MODEL OUTPUT:")) {
            const outputContent = messageStr.replace("MODEL OUTPUT:", "").trim();
            
            // Check for special output types
            if (outputContent.startsWith("Reasoning:")) {
                addReasoningMessage(outputContent.replace("Reasoning:", "").trim());
            } else if (outputContent.startsWith("Using tool:")) {
                addToolUsageMessage(outputContent);
            } else if (outputContent.startsWith("Tool result:")) {
                addToolResultMessage(outputContent.replace("Tool result:", "").trim());
            } else {
                addAgentMessage(outputContent);
            }
        } else if (messageStr.startsWith("STATUS:")) {
            const statusContent = messageStr.replace("STATUS:", "").trim();
            showSystemMessage(statusContent, "info");
        } else {
            // For any other message, just display it as agent message
            addAgentMessage(messageStr);
        }
    });
}

/**
 * Handle browser screenshot data
 */
function handleBrowserScreenshot(content) {
    // Ensure content is an object
    if (!content || typeof content !== 'object') {
        console.error('Invalid browser screenshot content:', content);
        return;
    }
    
    // Store the latest screenshot info
    latestScreenshot = {
        url: content.url || 'about:blank',
        title: content.title || 'Browser View',
        timestamp: content.timestamp || new Date().toISOString()
    };
    
    // Fetch the actual screenshot image
    fetchBrowserScreenshot();
}

/**
 * Fetch the browser screenshot from the server
 */
async function fetchBrowserScreenshot() {
    if (!currentTaskId) return;
    
    try {
        const response = await fetch(`/browser_screenshot/${currentTaskId}`);
        if (!response.ok) {
            console.error('Failed to fetch browser screenshot');
            return;
        }
        
        const data = await response.json();
        
        // Update the browser view with the screenshot data
        updateBrowserView(data);
        
        // Add a browser message with screenshot preview
        addBrowserScreenshotMessage(data);
    } catch (error) {
        console.error('Error fetching browser screenshot:', error);
    }
}

/**
 * Update the browser view modal with screenshot data
 */
function updateBrowserView(data) {
    if (!elements.browserViewImage || !elements.browserViewUrl || !elements.browserViewTitle) return;
    
    // Set the image source
    elements.browserViewImage.src = `data:image/png;base64,${data.image_data}`;
    
    // Set the URL and title
    elements.browserViewUrl.textContent = data.url || 'Unknown URL';
    elements.browserViewTitle.textContent = data.title || 'Browser View';
}

/**
 * Add a browser screenshot message to the conversation
 */
function addBrowserScreenshotMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'web-browsing';
    
    // Create a thumbnail of the screenshot
    const thumbnailSrc = `data:image/png;base64,${data.image_data}`;
    
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-green font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.6001 9H20.4001" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.6001 15H20.4001" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 3C10.4087 7.38695 9.6001 9.58069 9.6001 12C9.6001 14.4193 10.4087 16.613 12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 3C13.5913 7.38695 14.4001 9.58069 14.4001 12C14.4001 14.4193 13.5913 16.613 12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Browser Screenshot
        </div>
        <div class="mb-2">
            <a href="${data.url}" target="_blank" class="text-accent-blue hover:underline">${data.url}</a>
        </div>
        <div class="browser-screenshot-preview cursor-pointer" onclick="openBrowserView()">
            <img src="${thumbnailSrc}" alt="Browser screenshot" class="max-h-48 rounded-lg border border-apple-200 hover:border-accent-blue transition">
            <div class="mt-1 text-xs text-apple-500 text-center">Click to view full screenshot</div>
        </div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Open the browser view modal
 */
function openBrowserView() {
    if (!elements.browserViewModal) return;
    
    elements.browserViewModal.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Close the browser view modal
 */
function closeBrowserView() {
    if (!elements.browserViewModal) return;
    
    elements.browserViewModal.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Add a web browsing message to the conversation
 */
function addWebBrowsingMessage(content, url) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'web-browsing';
    
    // Extract URL if present
    let formattedContent = content;
    
    if (url) {
        formattedContent = content.replace(url, `<a href="${url}" target="_blank" class="text-accent-blue hover:underline">${url}</a>`);
    }
    
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-green font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.6001 9H20.4001" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.6001 15H20.4001" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 3C10.4087 7.38695 9.6001 9.58069 9.6001 12C9.6001 14.4193 10.4087 16.613 12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 3C13.5913 7.38695 14.4001 9.58069 14.4001 12C14.4001 14.4193 13.5913 16.613 12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Web Browsing
        </div>
        <div>${formatContent(formattedContent)}</div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
}

/**
 * Show a system message in the conversation
 */
function showSystemMessage(message, type = 'info') {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'py-2 px-3 rounded-lg text-center my-2 text-sm';
    
    // Set color based on message type
    switch (type) {
        case 'error':
            messageDiv.classList.add('bg-red-50', 'text-accent-red');
            break;
        case 'success':
            messageDiv.classList.add('bg-green-50', 'text-accent-green');
            break;
        case 'warning':
            messageDiv.classList.add('bg-yellow-50', 'text-accent-yellow');
            break;
        default:
            messageDiv.classList.add('bg-apple-50', 'text-apple-500');
    }
    
    messageDiv.textContent = message;
    elements.conversation.appendChild(messageDiv);
    scrollToBottom();
}

/**
 * Stop the current execution
 */
async function stopExecution() {
    if (!currentTaskId || !eventSource) return;
    
    try {
        // Show stopping indicator
        showSystemMessage("Stopping task...", "warning");
        
        // Close event source
        eventSource.close();
        
        // Send stop request
        await fetch(`/stop/${currentTaskId}`, { method: 'POST' });
        
        // Update UI
        showSystemMessage("Task stopped", "info");
        updateUIForExecution(false);
        isExecuting = false;
        eventSource = null;
    } catch (error) {
        console.error('Error stopping execution:', error);
        showSystemMessage('Failed to stop the task', "error");
    }
}

/**
 * Clear the conversation
 */
function clearConversation() {
    // Clear the conversation
    elements.conversation.innerHTML = '';
    
    // Add the welcome message
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'text-apple-500 text-center py-4';
    welcomeDiv.textContent = 'OpenManus is ready. Configure your agent and enter your request to begin.';
    elements.conversation.appendChild(welcomeDiv);
    
    // Add the flex-grow spacer
    const spacer = document.createElement('div');
    spacer.className = 'flex-grow';
    elements.conversation.appendChild(spacer);
    
    showSystemMessage("Conversation cleared", "info");
}

/**
 * Get the selected model name based on deployment type
 */
function getSelectedModel() {
    if (elements.deployType.value === 'local') {
        return elements.localModelSelect.value;
    }
    return elements.cloudModelSelect.value;
}

/**
 * Create a typing indicator element
 */
function createTypingIndicator() {
    const div = document.createElement('div');
    div.className = 'typing-indicator py-2 px-4';
    div.innerHTML = '<span></span><span></span><span></span>';
    return div;
}

/**
 * Scroll conversation to bottom
 */
function scrollToBottom() {
    elements.conversation.scrollTop = elements.conversation.scrollHeight;
}

/**
 * Update UI elements based on execution state
 */
function updateUIForExecution(isRunning) {
    if (isRunning) {
        elements.executeBtn.disabled = true;
        elements.executeBtn.classList.add('opacity-50');
        elements.stopBtn.disabled = false;
        elements.stopBtn.classList.remove('opacity-50');
        elements.input.disabled = true;
        elements.input.classList.add('bg-apple-50');
        elements.deployType.disabled = true;
        elements.maxSteps.disabled = true;
    } else {
        elements.executeBtn.disabled = false;
        elements.executeBtn.classList.remove('opacity-50');
        elements.stopBtn.disabled = true;
        elements.stopBtn.classList.add('opacity-50');
        elements.input.disabled = false;
        elements.input.classList.remove('bg-apple-50');
        elements.deployType.disabled = false;
        elements.maxSteps.disabled = false;
    }
}

/**
 * Format content for display
 */
function formatContent(content) {
    if (!content) return '';
    
    // Ensure content is a string
    let stringContent;
    if (typeof content !== 'string') {
        try {
            if (typeof content === 'object') {
                stringContent = JSON.stringify(content);
            } else {
                stringContent = String(content);
            }
        } catch (e) {
            console.error('Error converting content to string:', e);
            stringContent = 'Error: Could not format content';
        }
    } else {
        stringContent = content;
    }
    
    // Escape HTML
    let escaped = stringContent
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    // Convert URLs to links
    escaped = escaped.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank" class="text-accent-blue hover:underline">$1</a>'
    );
    
    // Add syntax highlighting for code blocks with language specification
    escaped = escaped.replace(
        /```([a-zA-Z0-9]+)?\n([\s\S]*?)```/g,
        function(match, language, code) {
            const lang = language || 'text';
            return `<pre class="bg-apple-100 p-3 rounded-lg my-2 overflow-x-auto"><code class="language-${lang}">${code}</code></pre>`;
        }
    );
    
    // Handle code blocks without language specification
    escaped = escaped.replace(
        /```([\s\S]*?)```/g,
        function(match, code) {
            return `<pre class="bg-apple-100 p-3 rounded-lg my-2 overflow-x-auto"><code class="language-text">${code}</code></pre>`;
        }
    );
    
    // Highlight inline code
    escaped = escaped.replace(
        /`([^`]+)`/g,
        '<code class="bg-apple-100 px-1 rounded font-mono text-sm">$1</code>'
    );
    
    // Format headers
    escaped = escaped.replace(/^### (.*?)$/gm, '<h3 class="text-lg font-bold mt-4 mb-2">$1</h3>');
    escaped = escaped.replace(/^## (.*?)$/gm, '<h2 class="text-xl font-bold mt-5 mb-2">$1</h2>');
    escaped = escaped.replace(/^# (.*?)$/gm, '<h1 class="text-2xl font-bold mt-6 mb-3">$1</h1>');
    
    // Format lists
    escaped = escaped.replace(/^\* (.*?)$/gm, '<li class="ml-4 list-disc">$1</li>');
    escaped = escaped.replace(/^- (.*?)$/gm, '<li class="ml-4 list-disc">$1</li>');
    escaped = escaped.replace(/^\d+\. (.*?)$/gm, '<li class="ml-4 list-decimal">$1</li>');
    
    // Wrap adjacent list items in ul/ol tags
    escaped = escaped.replace(/<li class="ml-4 list-disc">(.*?)<\/li>\n<li class="ml-4 list-disc">/g, '<ul class="my-2"><li class="ml-4 list-disc">$1</li>\n<li class="ml-4 list-disc">');
    escaped = escaped.replace(/<li class="ml-4 list-decimal">(.*?)<\/li>\n<li class="ml-4 list-decimal">/g, '<ol class="my-2"><li class="ml-4 list-decimal">$1</li>\n<li class="ml-4 list-decimal">');
    
    // Close list tags
    escaped = escaped.replace(/<li class="ml-4 list-disc">(.*?)<\/li>\n(?!<li class="ml-4 list-disc">)/g, '<ul class="my-2"><li class="ml-4 list-disc">$1</li></ul>\n');
    escaped = escaped.replace(/<li class="ml-4 list-decimal">(.*?)<\/li>\n(?!<li class="ml-4 list-decimal">)/g, '<ol class="my-2"><li class="ml-4 list-decimal">$1</li></ol>\n');
    
    // Format bold and italic text
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Convert newlines to <br> tags
    escaped = escaped.replace(/\n/g, '<br>');
    
    return escaped;
}

/**
 * Add an agent question to the conversation with a response input
 */
function addAgentQuestion(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble agent-message';
    
    // Create a unique ID for this question
    const questionId = 'question-' + Date.now();
    
    // Format the message with a response input
    messageDiv.innerHTML = `
        <div>${formatContent(content)}</div>
        <div class="mt-3 pt-3 border-t border-apple-200">
            <div class="flex flex-col">
                <div class="text-accent-blue text-sm mb-2">
                    <svg class="w-4 h-4 inline-block mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 12H8.01M12 12H12.01M16 12H16.01M21 12C21 16.418 16.97 20 12 20C10.5286 20 9.14629 19.6635 7.94358 19.079L3 20L4.2528 15.7448C3.46091 14.5345 3 13.1612 3 12C3 7.58172 7.02944 4 12 4C16.97 4 21 7.58172 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Waiting for your response...
                </div>
                <div class="flex items-center">
                    <input type="text" id="${questionId}-input" class="flex-1 px-3 py-2 bg-white border border-apple-200 rounded-lg text-apple-800 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition" placeholder="Type your response...">
                    <button id="${questionId}-submit" class="ml-2 px-3 py-2 bg-accent-blue text-white rounded-lg hover:bg-blue-700 transition">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
    
    // Show a system message indicating execution is paused
    showSystemMessage("Execution paused. Waiting for your response...", "info");
    
    // Pause execution until user responds
    pauseExecution();
    
    // Add event listener for the submit button
    document.getElementById(`${questionId}-submit`).addEventListener('click', () => {
        handleUserResponse(questionId);
    });
    
    // Add event listener for Enter key
    document.getElementById(`${questionId}-input`).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleUserResponse(questionId);
        }
    });
    
    // Focus the input field
    document.getElementById(`${questionId}-input`).focus();
}

/**
 * Handle user response to a question
 */
async function handleUserResponse(questionId) {
    const inputElement = document.getElementById(`${questionId}-input`);
    const submitButton = document.getElementById(`${questionId}-submit`);
    
    // Get the user's response
    const response = inputElement.value.trim();
    
    if (!response) {
        return; // Don't submit empty responses
    }
    
    // Disable the input and button
    inputElement.disabled = true;
    submitButton.disabled = true;
    submitButton.classList.add('opacity-50');
    
    // Add the user's response to the conversation
    addUserMessage(response);
    
    // Remove the input field and button
    const questionDiv = inputElement.closest('.message-bubble');
    const inputContainer = inputElement.parentElement.parentElement;
    questionDiv.removeChild(inputContainer);
    
    // Show a system message indicating execution is resuming
    showSystemMessage("Resuming execution with your response...", "success");
    
    // Create a new typing indicator to show the agent is thinking
    const typingIndicator = createTypingIndicator();
    elements.conversation.appendChild(typingIndicator);
    scrollToBottom();
    
    // Resume execution with the user's response
    await resumeExecution(response);
}

/**
 * Pause execution while waiting for user response
 */
function pauseExecution() {
    // Send a message to the server to pause execution
    if (currentTaskId) {
        fetch(`/pause/${currentTaskId}`, { method: 'POST' })
            .catch(error => {
                console.error('Error pausing execution:', error);
            });
    }
}

/**
 * Resume execution with the user's response
 */
async function resumeExecution(response) {
    // Send the user's response to the server
    if (currentTaskId) {
        try {
            await fetch(`/resume/${currentTaskId}`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ response })
            });
        } catch (error) {
            console.error('Error resuming execution:', error);
            showSystemMessage('Failed to send your response to the agent', "error");
        }
    }
}

/**
 * Export the conversation to a PDF file
 */
function exportConversationToPdf() {
    // Check if there's content to export
    if (elements.conversation.children.length <= 1) {
        showSystemMessage("No conversation to export", "warning");
        return;
    }
    
    // Create a clone of the conversation element for PDF export
    const conversationClone = elements.conversation.cloneNode(true);
    
    // Remove any input fields or buttons from the clone
    const inputFields = conversationClone.querySelectorAll('input, button');
    inputFields.forEach(field => field.remove());
    
    // Create a container for the PDF content
    const container = document.createElement('div');
    container.className = 'pdf-container';
    container.style.padding = '20px';
    container.style.fontFamily = 'Arial, sans-serif';
    
    // Add a title
    const title = document.createElement('h1');
    title.textContent = 'OpenManus Conversation';
    title.style.textAlign = 'center';
    title.style.marginBottom = '20px';
    title.style.fontSize = '24px';
    title.style.fontWeight = 'bold';
    container.appendChild(title);
    
    // Add a timestamp
    const timestamp = document.createElement('p');
    const currentDate = new Date();
    timestamp.textContent = `Generated on ${currentDate.toLocaleString()}`;
    timestamp.style.textAlign = 'center';
    timestamp.style.marginBottom = '30px';
    timestamp.style.color = '#666';
    container.appendChild(timestamp);
    
    // Add the conversation content
    container.appendChild(conversationClone);
    
    // Add a footer
    const footer = document.createElement('p');
    footer.textContent = 'OpenManus © 2023-2024 | An open-source AI agent platform';
    footer.style.textAlign = 'center';
    footer.style.marginTop = '30px';
    footer.style.color = '#666';
    footer.style.borderTop = '1px solid #eee';
    footer.style.paddingTop = '10px';
    container.appendChild(footer);
    
    // Configure PDF options
    const opt = {
        margin: [10, 10],
        filename: `openmanus-conversation-${formatDateForFilename(currentDate)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    // Generate the PDF
    showSystemMessage("Generating PDF...", "info");
    
    // Use html2pdf to generate and download the PDF
    html2pdf().from(container).set(opt).save()
        .then(() => {
            showSystemMessage("PDF generated successfully", "success");
        })
        .catch(error => {
            console.error('Error generating PDF:', error);
            showSystemMessage("Error generating PDF", "error");
        });
}

/**
 * Export the conversation to a Markdown file
 */
function exportConversationToMarkdown() {
    // Check if there's content to export
    if (elements.conversation.children.length <= 1) {
        showSystemMessage("No conversation to export", "warning");
        return;
    }
    
    // Create markdown content
    let markdown = "# OpenManus Conversation\n\n";
    
    // Add timestamp
    const currentDate = new Date();
    markdown += `*Generated on ${currentDate.toLocaleString()}*\n\n`;
    
    // Process conversation elements
    const conversationElements = elements.conversation.children;
    for (let i = 0; i < conversationElements.length; i++) {
        const element = conversationElements[i];
        
        // Skip system messages and typing indicators
        if (element.classList.contains('typing-indicator') || 
            (element.classList.contains('py-2') && element.classList.contains('px-3'))) {
            continue;
        }
        
        // Process based on message type
        if (element.classList.contains('user-message')) {
            markdown += `## User\n\n${htmlToMarkdown(element.innerHTML)}\n\n`;
        } else if (element.classList.contains('agent-message')) {
            markdown += `## OpenManus\n\n${htmlToMarkdown(element.innerHTML)}\n\n`;
        } else if (element.classList.contains('web-browsing')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Web Browsing';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `## ${title}\n\n${htmlToMarkdown(content)}\n\n`;
        } else if (element.classList.contains('reasoning')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Reasoning';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `## ${title}\n\n${htmlToMarkdown(content)}\n\n`;
        } else if (element.classList.contains('tool-usage')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Tool Usage';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `## ${title}\n\n${htmlToMarkdown(content)}\n\n`;
        }
    }
    
    // Add footer
    markdown += "---\n\nOpenManus © 2023-2024 | An open-source AI agent platform";
    
    // Create a blob and download link
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openmanus-conversation-${formatDateForFilename(currentDate)}.md`;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    showSystemMessage("Markdown file generated successfully", "success");
}

/**
 * Export the conversation to an HTML file
 */
function exportConversationToHtml() {
    // Check if there's content to export
    if (elements.conversation.children.length <= 1) {
        showSystemMessage("No conversation to export", "warning");
        return;
    }
    
    // Create a clone of the conversation element for HTML export
    const conversationClone = elements.conversation.cloneNode(true);
    
    // Remove any input fields or buttons from the clone
    const inputFields = conversationClone.querySelectorAll('input, button');
    inputFields.forEach(field => field.remove());
    
    // Create HTML content
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenManus Conversation</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
        }
        h1 {
            text-align: center;
            color: #0071e3;
        }
        .timestamp {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
        }
        .message-bubble {
            position: relative;
            border-radius: 18px;
            padding: 12px 16px;
            max-width: 85%;
            margin-bottom: 12px;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
        }
        .user-message {
            background-color: #0071e3;
            color: white;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        .agent-message {
            background-color: #f5f5f7;
            color: #1d1d1f;
            margin-right: auto;
            border-bottom-left-radius: 4px;
        }
        .web-browsing, .reasoning, .tool-usage {
            background-color: #f5f5f7;
            padding: 8px 12px;
            margin: 8px 0;
            border-radius: 4px;
        }
        .web-browsing {
            border-left: 3px solid #68cc45;
        }
        .reasoning {
            border-left: 3px solid #bf5af2;
        }
        .tool-usage {
            border-left: 3px solid #0071e3;
        }
        pre {
            background-color: #f1f1f1;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
        }
        code {
            font-family: monospace;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 10px;
            border-top: 1px solid #eee;
            color: #666;
        }
    </style>
</head>
<body>
    <h1>OpenManus Conversation</h1>
    <p class="timestamp">Generated on ${new Date().toLocaleString()}</p>
    <div class="conversation">
        ${conversationClone.innerHTML}
    </div>
    <div class="footer">
        OpenManus © 2023-2024 | An open-source AI agent platform
    </div>
</body>
</html>`;
    
    // Create a blob and download link
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `openmanus-conversation-${formatDateForFilename(new Date())}.html`;
    document.body.appendChild(a);
    a.click();
    
    // Cleanup
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
    
    showSystemMessage("HTML file generated successfully", "success");
}

/**
 * Format a date for use in filenames
 */
function formatDateForFilename(date) {
    return date.toISOString()
        .replace(/:/g, '-')
        .replace(/\..+/, '')
        .replace('T', '_');
}

/**
 * Convert HTML to Markdown
 */
function htmlToMarkdown(html) {
    // This is a simple conversion - for a more robust solution, consider using a library
    let markdown = html;
    
    // Replace <br> tags with newlines
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    // Replace <p> tags
    markdown = markdown.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
    
    // Replace headers
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    
    // Replace <strong> and <b> tags
    markdown = markdown.replace(/<(strong|b)>(.*?)<\/(strong|b)>/gi, '**$2**');
    
    // Replace <em> and <i> tags
    markdown = markdown.replace(/<(em|i)>(.*?)<\/(em|i)>/gi, '*$2*');
    
    // Replace <code> tags
    markdown = markdown.replace(/<code>(.*?)<\/code>/gi, '`$1`');
    
    // Replace <pre><code> blocks
    markdown = markdown.replace(/<pre><code.*?>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n');
    
    // Replace <ul> and <ol> lists
    markdown = markdown.replace(/<ul>([\s\S]*?)<\/ul>/gi, function(match, list) {
        return list.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
    });
    
    markdown = markdown.replace(/<ol>([\s\S]*?)<\/ol>/gi, function(match, list) {
        let index = 1;
        return list.replace(/<li>(.*?)<\/li>/gi, function(match, item) {
            return `${index++}. ${item}\n`;
        });
    });
    
    // Replace <a> tags
    markdown = markdown.replace(/<a href="(.*?)".*?>(.*?)<\/a>/gi, '[$2]($1)');
    
    // Remove all other HTML tags
    markdown = markdown.replace(/<[^>]*>/g, '');
    
    // Decode HTML entities
    markdown = markdown.replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&apos;/g, "'")
                      .replace(/&amp;/g, '&');
    
    return markdown;
}

/**
 * Add export options to the UI
 */
function addExportOptions() {
    const exportOptionsDiv = document.createElement('div');
    exportOptionsDiv.className = 'export-options hidden absolute right-0 mt-2 bg-white rounded-lg shadow-apple-lg border border-apple-200 z-10';
    exportOptionsDiv.innerHTML = `
        <div class="py-1">
            <button id="exportPdfOption" class="w-full text-left px-4 py-2 text-sm text-apple-700 hover:bg-apple-50 transition">
                <svg class="w-4 h-4 inline-block mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 10V16M12 16L9 13M12 16L15 13M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Save as PDF
            </button>
            <button id="exportMarkdownOption" class="w-full text-left px-4 py-2 text-sm text-apple-700 hover:bg-apple-50 transition">
                <svg class="w-4 h-4 inline-block mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 9h1v4M12 9h1v4M9 13h4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Save as Markdown
            </button>
            <button id="exportHtmlOption" class="w-full text-left px-4 py-2 text-sm text-apple-700 hover:bg-apple-50 transition">
                <svg class="w-4 h-4 inline-block mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14 3v4a1 1 0 0 0 1 1h4M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M9 9l-2 3 2 3M15 9l2 3-2 3M12 9l-1 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Save as HTML
            </button>
        </div>
    `;
    
    // Add to the DOM
    document.body.appendChild(exportOptionsDiv);
    
    // Store reference to the export options
    elements.exportOptions = exportOptionsDiv;
    elements.exportPdfOption = document.getElementById('exportPdfOption');
    elements.exportMarkdownOption = document.getElementById('exportMarkdownOption');
    elements.exportHtmlOption = document.getElementById('exportHtmlOption');
    
    // Update the export PDF button to show options
    elements.exportPdfBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        
        // Position the options dropdown
        const rect = elements.exportPdfBtn.getBoundingClientRect();
        elements.exportOptions.style.top = `${rect.bottom}px`;
        elements.exportOptions.style.right = `${window.innerWidth - rect.right}px`;
        
        // Toggle visibility
        elements.exportOptions.classList.toggle('hidden');
    });
    
    // Add event listeners for export options
    elements.exportPdfOption.addEventListener('click', function() {
        elements.exportOptions.classList.add('hidden');
        exportConversationToPdf();
    });
    
    elements.exportMarkdownOption.addEventListener('click', function() {
        elements.exportOptions.classList.add('hidden');
        exportConversationToMarkdown();
    });
    
    elements.exportHtmlOption.addEventListener('click', function() {
        elements.exportOptions.classList.add('hidden');
        exportConversationToHtml();
    });
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', function(e) {
        if (!elements.exportOptions.contains(e.target) && e.target !== elements.exportPdfBtn) {
            elements.exportOptions.classList.add('hidden');
        }
    });
}

/**
 * Display a final response from the agent
 */
function displayFinalResponse(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble agent-message final-response';
    
    // Add a header to make it clear this is the final response
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-green font-medium mb-2">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12L11 14L15 10M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Final Response
        </div>
        <div class="pb-2 mb-2 border-b border-apple-200">
            ${formatContent(content)}
        </div>
        <div class="text-xs text-apple-500 mt-2">
            <button id="clear-conversation" class="text-accent-blue hover:underline">
                Start a new conversation
            </button>
            or
            <button id="export-conversation" class="text-accent-blue hover:underline">
                Export this conversation
            </button>
        </div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
    
    // Add event listeners for the buttons
    document.getElementById('clear-conversation').addEventListener('click', clearConversation);
    document.getElementById('export-conversation').addEventListener('click', exportConversationToPdf);
}

/**
 * Add a user message to the conversation
 */
function addUserMessage(content) {
    // Get the flex-grow spacer element
    const spacer = document.querySelector('#conversation .flex-grow');
    
    // Create the message div
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble user-message';
    messageDiv.innerHTML = formatContent(content);
    
    // Insert the message before the spacer
    if (spacer) {
        elements.conversation.insertBefore(messageDiv, spacer);
    } else {
        // If spacer doesn't exist, add it first
        const newSpacer = document.createElement('div');
        newSpacer.className = 'flex-grow';
        elements.conversation.appendChild(newSpacer);
        elements.conversation.insertBefore(messageDiv, newSpacer);
    }
    
    scrollToBottom();
}

/**
 * Add an agent message to the conversation
 */
function addAgentMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble agent-message';
    messageDiv.innerHTML = formatContent(content);
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
}

/**
 * Add a reasoning message to the conversation
 */
function addReasoningMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble reasoning';
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-purple font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 16V12M12 8H12.01M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Reasoning
        </div>
        <div>${formatContent(content)}</div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
}

/**
 * Add a tool usage message to the conversation
 */
function addToolUsageMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble tool-usage';
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-blue font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Tool Usage
        </div>
        <div>${formatContent(content)}</div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
}

/**
 * Add a tool result message to the conversation
 */
function addToolResultMessage(content) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message-bubble tool-result';
    
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-blue font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.3432 5.65686L5.65686 10.3432C4.78033 11.2198 4.78033 12.6262 5.65686 13.5027L10.3432 18.1891C11.2198 19.0657 12.6262 19.0657 13.5027 18.1891L18.1891 13.5027C19.0657 12.6262 19.0657 11.2198 18.1891 10.3432L13.5027 5.65686C12.6262 4.78033 11.2198 4.78033 10.3432 5.65686Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 9L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 15.01L12.01 14.999" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Tool Result
        </div>
        <div>${formatContent(content)}</div>
    `;
    
    elements.conversation.appendChild(messageDiv);
    
    // Initialize syntax highlighting
    if (typeof Prism !== 'undefined') {
        Prism.highlightAllUnder(messageDiv);
    }
    
    scrollToBottom();
}

/**
 * Handle a message from the server
 */
function handleMessage(message) {
    // Remove typing indicator if present
    removeTypingIndicator();
    
    // Handle different message types
    switch (message.type) {
        case 'user_message':
            addUserMessage(message.content);
            break;
        case 'agent_message':
            addAgentMessage(message.content);
            break;
        case 'reasoning':
            addReasoningMessage(message.content);
            break;
        case 'tool_usage':
            addToolUsageMessage(message.content);
            break;
        case 'web_browsing':
            addWebBrowsingMessage(message.content, message.url);
            break;
        case 'browser_view':
            handleBrowserView(message.content, message.url);
            break;
        case 'system_message':
            showSystemMessage(message.content, message.level || 'info');
            break;
        case 'execution_complete':
            updateUIForExecution(false);
            // Display final response if provided
            if (message.final_response) {
                displayFinalResponse(message.final_response);
            }
            break;
        case 'execution_error':
            showSystemMessage(message.content, 'error');
            updateUIForExecution(false);
            break;
        default:
            console.warn('Unknown message type:', message.type);
    }
}

/**
 * Handle browser view message
 */
function handleBrowserView(content, url) {
    // Update the browser view modal
    if (elements.browserViewImage && elements.browserViewUrl) {
        elements.browserViewImage.src = `data:image/png;base64,${content}`;
        elements.browserViewUrl.textContent = url || 'Unknown URL';
        elements.browserViewTitle.textContent = 'Browser View';
    }
    
    // Create a message with a preview
    const messageDiv = document.createElement('div');
    messageDiv.className = 'web-browsing';
    
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-green font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3C7.02944 3 3 7.02944 3 12C3 16.9706 7.02944 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.6001 9H20.4001" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M3.6001 15H20.4001" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 3C10.4087 7.38695 9.6001 9.58069 9.6001 12C9.6001 14.4193 10.4087 16.613 12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 3C13.5913 7.38695 14.4001 9.58069 14.4001 12C14.4001 14.4193 13.5913 16.613 12 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Browser Screenshot
        </div>
        <div class="mb-2">
            <span class="text-apple-700">${url || 'Current webpage'}</span>
        </div>
        <div class="browser-screenshot-preview cursor-pointer" onclick="openBrowserView()">
            <img src="data:image/png;base64,${content}" alt="Browser screenshot" class="max-h-48 rounded-lg border border-apple-200 hover:border-accent-blue transition">
            <div class="mt-1 text-xs text-apple-500 text-center">Click to view full screenshot</div>
        </div>
    `;
    
    // Get the flex-grow spacer element
    const spacer = document.querySelector('#conversation .flex-grow');
    
    // Insert the message before the spacer
    if (spacer) {
        elements.conversation.insertBefore(messageDiv, spacer);
    } else {
        elements.conversation.appendChild(messageDiv);
    }
    
    scrollToBottom();
    
    // Automatically open the browser view modal
    openBrowserView();
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init); 