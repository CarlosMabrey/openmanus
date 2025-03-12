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
let browserRemoteUrl = null; // URL for remote browser control
let isLiveViewActive = false; // Track if live view is active
let autoUpdateScreenshots = true; // Auto-update screenshots
let screenshotInterval = null; // Interval for auto-updating screenshots
let isFloatingBrowserVisible = false; // Track if floating browser is visible
let elements = {}; // UI elements populated on DOM load
let currentAgentMessage = "";
let browserReady = false;
let projectList = {};
let currentProject = null;

/**
 * Initialize the application
 */
function init() {
    // Initialize UI elements
    initializeElements();
    
    // Setup event handlers
    setupEventHandlers();
    
    // Load saved API keys
    loadSavedApiKeys();
    
    // Setup example requests
    setupExampleRequests();
    
    // Initialize projects list
    initializeProjects();
    
    // Focus the prompt input
    elements.promptInput.focus();
}

/**
 * Initialize all UI elements
 */
function initializeElements() {
    console.log("Initializing UI elements...");
    
    // Main UI elements
    elements.input = document.getElementById('prompt-input');
    elements.conversation = document.getElementById('conversation');
    elements.executeBtn = document.getElementById('execute-btn');
    elements.stopBtn = document.getElementById('stop-btn');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.exportPdfBtn = document.getElementById('export-pdf-btn');
    elements.exportOptions = document.getElementById('export-options');
    
    // Configuration elements
    elements.deploymentSelect = document.getElementById('deployment-select');
    elements.localModelSelect = document.getElementById('local-model-select');
    elements.cloudModelSelect = document.getElementById('cloud-model-select');
    elements.cloudConfig = document.getElementById('cloudConfig');
    elements.localModels = document.getElementById('localModels');
    elements.apiKey = document.getElementById('api-key-input');
    elements.saveKeyBtn = document.getElementById('save-key-btn');
    elements.clearKeyBtn = document.getElementById('clear-key-btn');
    elements.maxSteps = document.getElementById('max-steps');
    elements.verbosityControl = document.getElementById('verbosity-control');
    
    // Browser elements
    elements.browserViewModal = document.getElementById('browserViewModal');
    elements.browserViewTitle = document.getElementById('browserViewTitle');
    elements.browserViewUrl = document.getElementById('browserViewUrl');
    elements.browserViewFrame = document.getElementById('browserViewFrame');
    elements.closeBrowserViewBtn = document.getElementById('closeBrowserViewBtn');
    elements.toggleLiveViewBtn = document.getElementById('toggleLiveViewBtn');
    elements.embeddedBrowserToggle = document.getElementById('embeddedBrowserToggle');
    elements.closeFloatingBrowserBtn = document.getElementById('closeFloatingBrowserBtn');
    elements.expandBrowserBtn = document.getElementById('expandBrowserBtn');
    elements.autoUpdateToggle = document.getElementById('autoUpdateToggle');
    elements.takeBrowserScreenshotBtn = document.getElementById('takeBrowserScreenshotBtn');
    
    // Debug element initialization
    console.log("UI elements initialized:", Object.keys(elements).length);
}

/**
 * Set up example request buttons
 */
function setupExampleRequests() {
    console.log("Setting up example request buttons...");
    
    const exampleRequests = {
        "Japan Travel Itinerary": `I need a 7-day Japan itinerary for April 15-23 from Seattle, with a $2500-5000 budget for my fiancée and me. We love historical sites, hidden gems, and Japanese culture (kendo, tea ceremonies, Zen meditation). We want to see Nara's deer and explore cities on foot. I plan to propose during this trip and need a special location recommendation. Please provide a detailed itinerary and a simple HTML travel handbook with maps, attraction descriptions, essential Japanese phrases, and travel tips we can reference throughout our journey.`,
        
        "Data Analysis": `I have a CSV dataset of customer purchase history with columns for customer_id, purchase_date, product_id, quantity, and price. Please help me analyze this data to identify: 1) Monthly sales trends over the past year, 2) Top 10 best-selling products, 3) Customer segmentation based on purchase frequency and average order value, and 4) Product recommendations for cross-selling opportunities. Create visualizations for each analysis and provide actionable business insights based on the findings.`,
        
        "Website Creation": `I need a personal portfolio website for my photography business. The site should have: 1) A responsive home page with a gallery showcase, 2) An about page with my bio and equipment list, 3) A services page with pricing packages, 4) A contact form, and 5) Integration with Instagram to automatically display my latest posts. Please create a clean, modern design with a dark theme that makes my photos stand out. Use HTML, CSS, and JavaScript, and make sure it's mobile-friendly.`,
        
        "Research Summary": `I need a comprehensive research summary on the latest advancements in renewable energy technologies, focusing on solar, wind, and hydrogen power. Please include: 1) Current efficiency rates and cost comparisons, 2) Breakthrough technologies from the past 2 years, 3) Major companies and countries leading innovation, 4) Challenges and limitations, and 5) Future outlook for the next decade. Format the summary with clear sections, include relevant statistics, and cite reliable sources.`
    };
    
    // Add click event listeners to all example request buttons
    const exampleButtons = document.querySelectorAll('.example-request-btn');
    console.log(`Found ${exampleButtons.length} example request buttons`);
    
    exampleButtons.forEach(button => {
        console.log("Setting up button:", button.textContent);
        button.addEventListener('click', () => {
            console.log("Example button clicked:", button.textContent);
            const requestType = button.textContent;
            if (exampleRequests[requestType]) {
                console.log("Setting input value to example request");
                elements.input.value = exampleRequests[requestType];
                elements.input.focus();
                // Scroll to the bottom of the textarea
                elements.input.scrollTop = elements.input.scrollHeight;
            } else {
                console.log("Example request not found for:", requestType);
            }
        });
    });
    
    console.log("Example request buttons setup complete");
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
    if (elements.deploymentSelect.value !== 'cloud') return;
    
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
    console.log("Execute prompt function called");
    
    // Prevent multiple executions
    if (isExecuting) {
        console.log("Already executing, canceling request");
        return;
    }
    
    // Get user input
    const userPrompt = elements.input.value.trim();
    console.log("User prompt:", userPrompt ? `${userPrompt.substring(0, 50)}...` : "Empty");
    
    // Validate input
    if (!userPrompt) {
        showSystemMessage("Please enter a request before executing.", "error");
        console.log("Empty prompt, aborting execution");
        return;
    }
    
    // Get max steps
    const maxSteps = parseInt(elements.maxSteps.value, 10) || 30;
    console.log("Max steps:", maxSteps);
    
    // Validate max steps
    if (maxSteps < 1 || maxSteps > 100) {
        showSystemMessage("Max steps must be between 1 and 100.", "error");
        console.log("Invalid max steps, aborting execution");
        return;
    }
    
    // Get verbosity setting
    const verbosity = elements.verbosityControl ? elements.verbosityControl.value : 'normal';
    console.log("Verbosity setting:", verbosity);
    
    // Collect configuration parameters
    const deployType = elements.deploymentSelect.value;
    console.log("Deploy type:", deployType);
    
    const modelName = getSelectedModel();
    console.log("Selected model:", modelName);
    
    const apiKey = elements.apiKey?.value || '';
    console.log("API key provided:", apiKey ? "Yes" : "No");
    
    const config = {
        deploy_type: deployType,
        model_name: modelName,
        api_key: apiKey,
        prompt: userPrompt,
        max_steps: maxSteps,
        verbosity: verbosity
    };
    console.log("Configuration:", {
        deploy_type: config.deploy_type,
        model_name: config.model_name,
        max_steps: config.max_steps,
        verbosity: config.verbosity,
        has_api_key: config.api_key ? "yes" : "no"
    });
    
    if (deployType === 'cloud' && !config.api_key) {
        showSystemMessage("API key is required for cloud models.", "error");
        console.log("Missing API key for cloud model, aborting execution");
        return;
    }
    
    try {
        // Set executing state
        isExecuting = true;
        updateUIForExecution(true);
        console.log("UI updated for execution");
        
        // Add user message to conversation
        addUserMessage(userPrompt);
        
        // Start task
        console.log("Sending /execute request...");
        console.log("Request payload:", JSON.stringify(config));
        
        try {
            const response = await fetch('/execute', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(config)
            });
            
            console.log("Execute response status:", response.status);
            console.log("Response headers:", [...response.headers.entries()]);
            
            if (!response.ok) {
                const errorData = await response.json();
                console.error("Execute error:", errorData);
                throw new Error(errorData.detail || 'Failed to start execution');
            }
            
            const responseData = await response.json();
            console.log("Response data:", responseData);
            
            const { task_id } = responseData;
            console.log("Got task ID:", task_id);
            currentTaskId = task_id;
            
            // Create typing indicator
            const typingIndicator = createTypingIndicator();
            elements.conversation.appendChild(typingIndicator);
            scrollToBottom();
            
            // Connect to stream endpoint
            console.log("Connecting to event stream...");
            connectToEventStream(task_id, typingIndicator);
        } catch (fetchError) {
            console.error("Fetch error:", fetchError);
            throw fetchError;
        }
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
                // First check if this is a heartbeat message
                if (typeof e.data === 'string' && e.data.trim().startsWith(': heartbeat')) {
                    // This is a heartbeat message, no need to process it
                    console.log('Received heartbeat');
                    return;
                }
                
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
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    console.log('Stream message:', parsedData);
    
    // Extract message properties
    const msgType = parsedData.type || 'log';
    const content = parsedData.content || '';
    
    // Special handling for error messages
    if (msgType === 'error') {
        // Show a more prominent error message
        const errorBox = document.createElement('div');
        errorBox.className = 'error-message my-4 p-4 border-l-4 border-red-500 bg-red-50 rounded';
        
        let errorContent = `<p class="text-red-700 font-medium">${content}</p>`;
        
        // Add details if available
        if (parsedData.details) {
            console.error('Error details:', parsedData.details);
            
            if (typeof parsedData.details === 'string') {
                errorContent += `<p class="text-red-600 mt-2 text-sm">${parsedData.details}</p>`;
            } else if (typeof parsedData.details === 'object') {
                // Format object details
                errorContent += '<div class="mt-3 bg-red-100 p-3 rounded text-sm">';
                
                if (parsedData.details.error_type) {
                    errorContent += `<p><strong>Error Type:</strong> ${parsedData.details.error_type}</p>`;
                }
                
                if (parsedData.details.message) {
                    errorContent += `<p><strong>Message:</strong> ${parsedData.details.message}</p>`;
                }
                
                if (parsedData.details.traceback && Array.isArray(parsedData.details.traceback)) {
                    errorContent += '<p><strong>Traceback:</strong></p>';
                    errorContent += '<pre class="bg-red-50 p-2 rounded overflow-x-auto">';
                    parsedData.details.traceback.forEach(line => {
                        errorContent += line + '\n';
                    });
                    errorContent += '</pre>';
                }
                
                errorContent += '</div>';
            }
        }
        
        // Add suggestion for common errors
        if (content.includes('API key')) {
            errorContent += `
                <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
                    <p class="font-medium text-yellow-700">Suggestion:</p>
                    <p class="text-sm">Check that you've entered a valid API key for the selected model. You can get an API key from the provider's website.</p>
                </div>
            `;
        }
        
        errorBox.innerHTML = errorContent;
        elements.conversation.appendChild(errorBox);
        scrollToBottom();
        
        return currentAgentMessage;
    }
    
    // Skip heartbeat messages
    if (!content) return;
    
    // Ensure content is properly formatted
    let formattedContent = content;
    // If content is an object, keep it as is for specific message types that expect objects
    if (typeof formattedContent === 'object' && !Array.isArray(formattedContent) && formattedContent !== null) {
        if (msgType !== 'browser_screenshot' && msgType !== 'browser_navigation') {
            // For message types that expect strings, convert objects to strings
            formattedContent = JSON.stringify(formattedContent);
        }
    } else if (typeof formattedContent !== 'string') {
        // Convert non-string, non-object content to string
        formattedContent = String(formattedContent);
    }
    
    // Log all messages to console for debugging
    console.log('Stream message:', formattedContent);
    
    // Special handling for success messages that might contain detailed results
    if (msgType === 'success' && parsedData.result) {
        handleSuccessWithResult(parsedData.result);
        updateUIForExecution(false);
        isExecuting = false;
        return;
    }
    
    // Track displayed questions to avoid duplicates
    if (!window.displayedQuestions) {
        window.displayedQuestions = new Set();
    }
    
    // Create a hash/id for the message based on content and type
    const messageHash = `${msgType}-${formattedContent.substring(0, 100)}`;
    
    // Handle different message types
    switch (msgType) {
        case 'question':
            // Check if this question has already been displayed
            if (!window.displayedQuestions.has(messageHash)) {
                addAgentQuestion(formattedContent);
                window.displayedQuestions.add(messageHash);
            } else {
                console.log('Skipping duplicate question:', formattedContent.substring(0, 100));
            }
            break;
            
        case 'success':
            // Final response from the agent
            displayFinalResponse(formattedContent);
            updateUIForExecution(false);
            isExecuting = false;
            break;
            
        case 'error':
            showSystemMessage(formattedContent, "error");
            updateUIForExecution(false);
            isExecuting = false;
            break;
            
        case 'reasoning':
            addReasoningMessage(formattedContent);
            break;
            
        case 'tool':
        case 'tool_usage':
            addToolUsageMessage(formattedContent);
            break;
            
        case 'tool_result':
            addToolResultMessage(formattedContent);
            break;
            
        case 'browser_screenshot':
            handleBrowserScreenshot(formattedContent);
            break;
            
        case 'browser_navigation':
            addWebBrowsingMessage(formattedContent);
            break;
            
        case 'status':
            showSystemMessage(formattedContent, "info");
            
            if (formattedContent.includes("Maximum steps reached") || 
                formattedContent.includes("Task completed successfully")) {
                updateUIForExecution(false);
                isExecuting = false;
            }
            break;
            
        case 'summary':
            // Display the summary in a collapsible section
            showStructuredSummary(formattedContent);
            break;
            
        case 'info':
            // Make info messages more visible - show all of them
            showSystemMessage(formattedContent, "info");
            break;
            
        case 'log':
            // Display all log messages to improve visibility of agent steps
            showLogMessage(formattedContent);
            break;
            
        default:
            // For other log messages, show most of them for better visibility
            showSystemMessage(formattedContent, "info");
    }
}

/**
 * Handle a success message that contains detailed result information
 */
function handleSuccessWithResult(result) {
    // Check if result contains structured data
    if (typeof result === 'string') {
        try {
            result = JSON.parse(result);
        } catch (e) {
            // If parsing fails, just display as final response
            displayFinalResponse(result);
            return;
        }
    }
    
    // Add debug info to console
    console.log('Success result:', result);
    
    // Check if result has summary, details, and conversation fields
    if (result && result.details && Array.isArray(result.details)) {
        // Display a heading to show we're presenting the agent's steps
        const stepsHeading = document.createElement('div');
        stepsHeading.className = 'py-2 px-3 my-3 bg-accent-blue bg-opacity-10 text-center rounded-lg font-semibold';
        stepsHeading.textContent = 'Agent Steps & Reasoning';
        elements.conversation.appendChild(stepsHeading);
        
        // Display each step in the details array
        result.details.forEach((step, index) => {
            // Skip empty steps
            if (!step || typeof step !== 'object') {
                return;
            }
            
            const stepType = step.type || 'step';
            let stepContent = step.content || JSON.stringify(step);
            
            // Ensure stepContent is a string
            if (typeof stepContent !== 'string') {
                stepContent = JSON.stringify(stepContent);
            }
            
            // Add a step number prefix for better readability
            const stepNumberPrefix = `Step ${index + 1}: `;
            console.log(`Processing ${stepNumberPrefix}${stepType}`);
            
            switch (stepType) {
                case 'reasoning':
                    addReasoningMessage(stepNumberPrefix + stepContent);
                    break;
                case 'tool_usage':
                case 'tool':
                    addToolUsageMessage(stepNumberPrefix + stepContent);
                    break;
                case 'tool_result':
                    addToolResultMessage(stepNumberPrefix + stepContent);
                    break;
                case 'question':
                    // Check if this question has already been displayed
                    const questionHash = `question-${stepContent.substring(0, 100)}`;
                    if (!window.displayedQuestions) {
                        window.displayedQuestions = new Set();
                    }
                    
                    if (!window.displayedQuestions.has(questionHash)) {
                        addAgentQuestion(stepNumberPrefix + stepContent);
                        window.displayedQuestions.add(questionHash);
                    } else {
                        console.log('Skipping duplicate question in results:', stepContent.substring(0, 100));
                    }
                    break;
                case 'browser_navigation':
                    addWebBrowsingMessage(stepContent);
                    break;
                case 'log':
                    showLogMessage(stepNumberPrefix + stepContent);
                    break;
                case 'final_response':
                    // For the final response, display it without step number
                    displayFinalResponse(stepContent);
                    break;
                case 'error':
                    showSystemMessage(stepNumberPrefix + stepContent, "error");
                    break;
                default:
                    // For any unhandled step types, show them as log messages
                    showLogMessage(`${stepNumberPrefix}[${stepType}] ${stepContent}`);
            }
        });
        
        // Finally, show the summary result
        if (result.summary && Array.isArray(result.summary) && result.summary.length > 0) {
            const summaryHtml = `
                <h3 class="font-medium text-lg mb-2">Summary of Actions</h3>
                <ul class="list-disc list-inside space-y-1 pl-4">
                    ${result.summary.map(item => `<li>${item}</li>`).join('')}
                </ul>
            `;
            
            const summaryDiv = document.createElement('div');
            summaryDiv.className = 'p-3 my-3 bg-apple-50 rounded-lg border border-apple-200';
            summaryDiv.innerHTML = summaryHtml;
            elements.conversation.appendChild(summaryDiv);
        }
    } else {
        // If there are no structured details, just show the final response
        const finalContent = typeof result === 'string' ? result : 
                           (result.content || JSON.stringify(result));
        displayFinalResponse(finalContent);
    }
}

/**
 * Display a log message
 */
function showLogMessage(content) {
    // Skip empty messages
    if (!content || content.trim() === '') {
        return;
    }
    
    // Create a more visible log message element
    const logElement = document.createElement('div');
    logElement.className = 'p-3 my-2 rounded-lg bg-apple-50 border border-apple-100 text-sm';
    
    // Format the log message content
    let formattedContent = content;
    
    // Check if this is a step log
    if (content.includes('Step ') && (content.includes('Thinking about') || content.includes('Using tool'))) {
        logElement.className = 'p-3 my-2 rounded-lg bg-apple-100 border border-apple-200 text-sm font-medium';
    }
    
    // Format tool execution logs
    if (content.includes('Executing tool')) {
        logElement.className = 'p-3 my-2 rounded-lg bg-accent-blue bg-opacity-10 border border-accent-blue border-opacity-20 text-sm';
        
        // Add an icon for tool execution
        formattedContent = `
            <div class="flex items-center">
                <svg class="w-4 h-4 mr-2 text-accent-blue" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>${formattedContent}</span>
            </div>
        `;
    }
    
    // Format reasoning logs
    if (content.includes('Reasoning:') || content.includes('Planning:')) {
        logElement.className = 'p-3 my-2 rounded-lg bg-accent-green bg-opacity-10 border border-accent-green border-opacity-20 text-sm';
        
        // Add an icon for reasoning
        formattedContent = `
            <div class="flex items-center">
                <svg class="w-4 h-4 mr-2 text-accent-green" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 3V4m6-1v1M9 20v1m6-1v1M4 9H3m1 6H3m18-6h-1m1 6h-1m-2-8a6 6 0 00-12 0c0 5 7 8 8 11h4s-2-2-2-4a6 6 0 002-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span>${formattedContent}</span>
            </div>
        `;
    }
    
    // Set the HTML content
    logElement.innerHTML = formattedContent;
    
    // Add to the conversation
    elements.conversation.appendChild(logElement);
    
    // Scroll to bottom
    scrollToBottom();
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
    
    // Ensure the export conversation button has the correct event listener
    const exportButton = document.getElementById('export-conversation');
    if (exportButton) {
        exportButton.addEventListener('click', function() {
            // Show export options dropdown or directly export to PDF
            if (elements.exportOptions) {
                // Position the options dropdown
                const rect = exportButton.getBoundingClientRect();
                elements.exportOptions.style.top = `${rect.bottom}px`;
                elements.exportOptions.style.right = `${window.innerWidth - rect.right}px`;
                
                // Show the options
                elements.exportOptions.classList.remove('hidden');
            } else {
                // Fallback to direct PDF export
                exportConversationToPdf();
            }
        });
    }
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
    
    // Show the browser toggle button when browser is active
    if (elements.embeddedBrowserToggle) {
        elements.embeddedBrowserToggle.classList.remove('hidden');
    }
    
    // Show the floating browser panel automatically on first screenshot
    if (!isFloatingBrowserVisible) {
        showFloatingBrowserPanel();
    }
    
    // Start screenshot interval if auto-update is enabled
    if (autoUpdateScreenshots && !screenshotInterval) {
        startScreenshotInterval();
    }
    
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
        
        // Store the browser URL for iframe use
        browserRemoteUrl = data.url;
        
        // Update the browser view with the screenshot data
        updateBrowserView(data);
        
        // Update the floating browser panel
        updateFloatingBrowserPanel(data);
        
        // Add a browser message with screenshot preview (only if it's a new screenshot)
        if (!window.lastScreenshotTimestamp || window.lastScreenshotTimestamp !== data.timestamp) {
            addBrowserScreenshotMessage(data);
            window.lastScreenshotTimestamp = data.timestamp;
        }
        
        // Update iframe src if in live view mode
        if (isLiveViewActive && elements.browserIframe) {
            updateLiveBrowserView();
        }
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
 * Update the floating browser panel with screenshot data
 */
function updateFloatingBrowserPanel(data) {
    if (!elements.floatingBrowserImage || !elements.floatingBrowserUrl || !elements.floatingBrowserTitle) return;
    
    // Set the image source
    elements.floatingBrowserImage.src = `data:image/png;base64,${data.image_data}`;
    
    // Set the URL and title
    elements.floatingBrowserUrl.textContent = data.url || 'Unknown URL';
    elements.floatingBrowserTitle.textContent = data.title || 'Browser View';
}

/**
 * Show the floating browser panel
 */
function showFloatingBrowserPanel() {
    if (!elements.floatingBrowserPanel) return;
    
    // Hide the toggle button
    if (elements.embeddedBrowserToggle) {
        elements.embeddedBrowserToggle.classList.add('hidden');
    }
    
    // Show the panel
    elements.floatingBrowserPanel.classList.remove('hidden');
    isFloatingBrowserVisible = true;
}

/**
 * Close the floating browser panel
 */
function closeFloatingBrowserPanel() {
    if (!elements.floatingBrowserPanel) return;
    
    // Hide the panel
    elements.floatingBrowserPanel.classList.add('hidden');
    isFloatingBrowserVisible = false;
    
    // Show the toggle button
    if (elements.embeddedBrowserToggle) {
        elements.embeddedBrowserToggle.classList.remove('hidden');
    }
    
    // Stop screenshot interval
    stopScreenshotInterval();
}

/**
 * Toggle the floating browser panel
 */
function toggleFloatingBrowserPanel() {
    if (isFloatingBrowserVisible) {
        closeFloatingBrowserPanel();
    } else {
        showFloatingBrowserPanel();
    }
}

/**
 * Expand the floating browser panel to the full modal
 */
function expandToBrowserModal() {
    // Hide the floating panel
    closeFloatingBrowserPanel();
    
    // Show the full modal
    openBrowserView();
}

/**
 * Start the screenshot interval for auto-updating
 */
function startScreenshotInterval() {
    if (screenshotInterval) {
        clearInterval(screenshotInterval);
    }
    
    // Update screenshots every 3 seconds
    screenshotInterval = setInterval(fetchBrowserScreenshot, 3000);
}

/**
 * Stop the screenshot interval
 */
function stopScreenshotInterval() {
    if (screenshotInterval) {
        clearInterval(screenshotInterval);
        screenshotInterval = null;
    }
}

/**
 * Toggle between screenshot view and live browser view
 */
function toggleLiveBrowserView() {
    if (!elements.liveBrowserView || !elements.browserViewContent) return;
    
    isLiveViewActive = !isLiveViewActive;
    
    if (isLiveViewActive) {
        // Switch to live view
        elements.browserViewContent.classList.add('hidden');
        elements.liveBrowserView.classList.remove('hidden');
        elements.screenshotModeText.classList.add('hidden');
        elements.liveModeText.classList.remove('hidden');
        elements.toggleLiveViewBtn.textContent = 'Show Screenshot';
        elements.toggleLiveViewBtn.classList.remove('bg-accent-green');
        elements.toggleLiveViewBtn.classList.add('bg-accent-blue');
        
        // Update the iframe src
        updateLiveBrowserView();
    } else {
        // Switch to screenshot view
        elements.browserViewContent.classList.remove('hidden');
        elements.liveBrowserView.classList.add('hidden');
        elements.screenshotModeText.classList.remove('hidden');
        elements.liveModeText.classList.add('hidden');
        elements.toggleLiveViewBtn.textContent = 'Show Live View';
        elements.toggleLiveViewBtn.classList.remove('bg-accent-blue');
        elements.toggleLiveViewBtn.classList.add('bg-accent-green');
    }
}

/**
 * Update the live browser view iframe
 */
function updateLiveBrowserView() {
    if (!elements.browserIframe || !browserRemoteUrl) return;
    
    // Set the iframe src to the current browser URL
    // We use a proxy endpoint to avoid CORS issues
    elements.browserIframe.src = `/browser_proxy?url=${encodeURIComponent(browserRemoteUrl)}`;
}

/**
 * Toggle the embedded browser view (fixed position)
 */
function toggleEmbeddedBrowser() {
    if (elements.browserViewModal.classList.contains('hidden')) {
        openBrowserView();
    } else {
        closeBrowserView();
    }
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
    if (elements.deploymentSelect.value === 'local') {
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
        elements.deploymentSelect.disabled = true;
        elements.maxSteps.disabled = true;
    } else {
        elements.executeBtn.disabled = false;
        elements.executeBtn.classList.remove('opacity-50');
        elements.stopBtn.disabled = true;
        elements.stopBtn.classList.add('opacity-50');
        elements.input.disabled = false;
        elements.input.classList.remove('bg-apple-50');
        elements.deploymentSelect.disabled = false;
        elements.maxSteps.disabled = false;
    }
}

/**
 * Format content for display
 */
function formatContent(content) {
    if (!content) return '';
    
    // Escape HTML
    let escaped = content.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    
    // Detect file format first
    const isPythonScript = content.includes('import ') && (content.includes('def ') || content.includes('class '));
    const isHtmlContent = content.includes('<!DOCTYPE') || content.includes('<html') || content.includes('<body>');
    const isMarkdown = content.includes('# ') && content.includes('## ') && !content.includes('import');
    
    // Special handling for tool outputs that contain code
    if (content.includes('Using pythonexecute with input:')) {
        // Extract the code content from the pythonexecute tool
        const codeMatch = content.match(/Using pythonexecute with input: (.*?)(?=\n\nResult:|$)/s);
        if (codeMatch && codeMatch[1]) {
            try {
                const codeData = JSON.parse(codeMatch[1]);
                if (codeData.code) {
                    // Determine file type
                    let language = 'python';
                    let hasHtmlOutput = false;
                    
                    if (codeData.code.includes('<!DOCTYPE html>') || 
                        codeData.code.includes('<html>') || 
                        codeData.code.includes('<head>')) {
                        language = 'html';
                        hasHtmlOutput = true;
                    } else if (codeData.code.includes('function') || codeData.code.includes('const ') || codeData.code.includes('let ')) {
                        language = 'javascript';
                    } else if (codeData.code.includes('import React') || codeData.code.includes('from "react"')) {
                        language = 'jsx';
                    } else if (codeData.code.includes('public class') || codeData.code.includes('private class')) {
                        language = 'java';
                    } else if (codeData.code.includes('#include')) {
                        language = 'cpp';
                    }
                    
                    // Create a formatted display for the code
                    const formattedCode = `<div class="code-execution-result">
                        <div class="flex items-center mb-2">
                            <div class="text-accent-blue font-medium">Generated ${language.toUpperCase()} Code:</div>
                            <button class="ml-auto px-2 py-1 text-xs bg-apple-100 hover:bg-apple-200 rounded-md flex items-center copy-code-btn">
                                <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.342a2 2 0 0 0-.602-1.43l-4.31-4.31A2 2 0 0 0 13.658 2H10a2 2 0 0 0-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    <path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                                Copy
                            </button>
                        </div>
                        <div class="code-container overflow-auto max-h-96 mb-4 border border-apple-200 rounded-lg">
                            <pre><code class="language-${language}">${codeData.code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                        </div>
                        ${hasHtmlOutput ? `
                        <div class="mb-2 text-accent-green font-medium">Preview:</div>
                        <div class="html-preview border border-apple-200 p-4 rounded-lg bg-white">
                            ${codeData.code}
                        </div>` : ''}
                    </div>`;
                    
                    // Extract and add execution result if present
                    const resultMatch = content.match(/Result:([\s\S]*?)$/);
                    if (resultMatch) {
                        return formattedCode + '<div class="mt-4 pt-4 border-t border-apple-200"><div class="text-accent-green font-medium">Execution Result:</div>' + resultMatch[1] + '</div>';
                    } else {
                        return formattedCode;
                    }
                }
            } catch (e) {
                console.error('Error parsing code data:', e);
            }
        }
    }
    
    // Format code blocks with language tags
    escaped = escaped.replace(/```(\w+)?\n([\s\S]*?)```/g, function(match, language, code) {
        const lang = language || detectLanguage(code) || 'plaintext';
        return `<div class="code-block-container">
            <div class="flex items-center px-2 py-1 bg-slate-100 text-slate-700 text-xs rounded-t-lg">
                <span>${lang.toUpperCase()}</span>
                <button class="ml-auto px-2 py-0.5 bg-apple-100 hover:bg-apple-200 rounded-md flex items-center copy-code-btn">
                    <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 4v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.342a2 2 0 0 0-.602-1.43l-4.31-4.31A2 2 0 0 0 13.658 2H10a2 2 0 0 0-2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        <path d="M16 18v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Copy
                </button>
            </div>
            <pre class="m-0"><code class="language-${lang}">${code}</code></pre>
        </div>`;
    });
    
    // Format inline code
    escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-slate-100 px-1 rounded text-apple-700">$1</code>');
    
    // Convert URLs to links
    escaped = escaped.replace(
        /(https?:\/\/[^\s]+)/g, 
        '<a href="$1" target="_blank" class="text-accent-blue hover:underline">$1</a>'
    );
    
    // Initialize copy functionality when the DOM is updated
    setTimeout(() => {
        document.querySelectorAll('.copy-code-btn').forEach(btn => {
            if (!btn.hasListener) {
                btn.addEventListener('click', function() {
                    const codeBlock = this.closest('.code-block-container, .code-execution-result').querySelector('code');
                    const code = codeBlock.textContent;
                    
                    navigator.clipboard.writeText(code).then(() => {
                        const originalText = this.innerHTML;
                        this.innerHTML = `
                            <svg class="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                            Copied!
                        `;
                        setTimeout(() => {
                            this.innerHTML = originalText;
                        }, 2000);
                    });
                });
                btn.hasListener = true;
            }
        });
    }, 0);
    
    return escaped;
}

/**
 * Detect language based on code content
 */
function detectLanguage(code) {
    // Simple language detection based on content
    if (code.includes('import ') && (code.includes('def ') || code.includes('class '))) {
        return 'python';
    } else if (code.includes('<!DOCTYPE') || code.includes('<html') || code.includes('<body>')) {
        return 'html';
    } else if (code.includes('function') || code.includes('const ') || code.includes('let ')) {
        return 'javascript';
    } else if (code.includes('import React') || code.includes('from "react"')) {
        return 'jsx';
    } else if (code.includes('public class') || code.includes('private class')) {
        return 'java';
    } else if (code.includes('#include')) {
        return 'cpp';
    } else if (code.match(/^#\s+[\w\s]+/m) && code.match(/^##\s+[\w\s]+/m)) {
        return 'markdown';
    }
    
    return 'plaintext';
}

/**
 * Add an agent question to the conversation
 */
function addAgentQuestion(content) {
    // Generate a unique ID for this question
    const questionId = 'question-' + Date.now();
    
    // Create the question container
    const questionDiv = document.createElement('div');
    questionDiv.className = 'agent-question p-4 my-3 rounded-lg';
    questionDiv.id = questionId;
    
    // Create the question content
    questionDiv.innerHTML = `
        <div class="flex items-start">
            <div class="flex-shrink-0 mr-2">
                <svg class="w-5 h-5 text-accent-purple" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8.22766 9C8.77678 7.83481 10.2584 7 12.0001 7C14.2092 7 16.0001 8.34315 16.0001 10C16.0001 11.3994 14.7224 12.5751 12.9943 12.9066C12.4519 13.0106 12.0001 13.4477 12.0001 14M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
            <div class="flex-1">
                <div class="font-medium mb-2">I have a question:</div>
                <div>${formatContent(content)}</div>
                
                <div class="mt-4 mb-2">
                    <label for="response-${questionId}" class="block text-sm font-medium text-apple-600 mb-1">
                        Your Response:
                    </label>
                    <textarea 
                        id="response-${questionId}" 
                        rows="3" 
                        class="w-full px-3 py-2 bg-white border border-apple-200 rounded-lg text-apple-800 focus:outline-none focus:ring-2 focus:ring-accent-blue focus:border-transparent transition resize-none"
                        placeholder="Type your response here..."
                    ></textarea>
                </div>
                
                <div>
                    <button 
                        id="submit-${questionId}" 
                        class="px-4 py-2 bg-accent-purple text-white rounded-lg hover:bg-purple-600 transition flex items-center"
                        onclick="handleUserResponseSubmit('${questionId}')"
                    >
                        <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 12H19M19 12L12 5M19 12L12 19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Submit Response
                    </button>
                </div>
            </div>
        </div>
    `;
    
    // Add to the conversation
    elements.conversation.appendChild(questionDiv);
    
    // Focus the textarea
    setTimeout(() => {
        const textarea = document.getElementById(`response-${questionId}`);
        if (textarea) {
            textarea.focus();
        }
    }, 100);
    
    // Scroll to the question
    scrollToBottom();
    
    return questionId;
}

/**
 * Handle the submission of a user response to an agent question
 */
async function handleUserResponseSubmit(questionId) {
    // Get the input field for this question
    const inputField = document.getElementById(`response-${questionId}`);
    if (!inputField) return;
    
    // Get the response text
    const response = inputField.value.trim();
    if (!response) {
        showSystemMessage("Please enter a response", "warning");
        return;
    }
    
    try {
        // Show the user's response in the conversation
        addUserMessage(response);
        
        // Disable the input field and button
        inputField.disabled = true;
        const submitButton = document.getElementById(`submit-${questionId}`);
        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "Submitted";
        }
        
        // Send the response to the server
        if (!currentTaskId) {
            showSystemMessage("No active task to respond to", "error");
            return;
        }
        
        // Make the API call to submit the response
        const response_data = await fetch(`/user_response/${currentTaskId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                response: response
            })
        });
        
        if (!response_data.ok) {
            const errorData = await response_data.json();
            throw new Error(errorData.detail || 'Failed to submit response');
        }
        
        // Show a confirmation
        const typingIndicator = createTypingIndicator();
        elements.conversation.appendChild(typingIndicator);
        scrollToBottom();
        
    } catch (err) {
        console.error('Error submitting user response:', err);
        showSystemMessage(`Error sending response: ${err.message}`, 'error');
    }
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
    
    // Try to extract tool name and input from content
    let toolName = "Tool";
    let toolInput = "";
    let displayContent = content;
    
    try {
        // Check if content is a string or object
        if (typeof content === 'object' && content !== null) {
            // If content is an object with tool property, extract it
            if (content.tool) {
                toolName = content.tool;
            }
            if (content.input) {
                toolInput = typeof content.input === 'object' ? JSON.stringify(content.input, null, 2) : content.input;
            }
            if (content.content) {
                displayContent = content.content;
            } else {
                displayContent = JSON.stringify(content, null, 2);
            }
        } else if (typeof content === 'string') {
            // Try to extract tool name from the string
            const toolMatch = content.match(/Using tool: ([^\n]+)/);
            if (toolMatch && toolMatch[1]) {
                toolName = toolMatch[1];
            }
            
            // Try to extract input from string
            const inputMatch = content.match(/Input: ({[^}]+})/);
            if (inputMatch && inputMatch[1]) {
                try {
                    const parsedInput = JSON.parse(inputMatch[1]);
                    toolInput = JSON.stringify(parsedInput, null, 2);
                } catch (e) {
                    toolInput = inputMatch[1];
                }
            }
        }
    } catch (e) {
        console.error("Error parsing tool usage message:", e);
        // Fall back to original content
        displayContent = content;
    }
    
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-blue font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="mr-1">Using Tool:</span>
            <span class="px-2 py-0.5 bg-accent-blue bg-opacity-10 rounded text-sm font-mono">${toolName}</span>
        </div>
        <div class="tool-content">${formatContent(displayContent)}</div>
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
    
    // Try to extract tool name from content
    let toolName = "Tool";
    let displayContent = content;
    
    try {
        // Check if content is a string or object
        if (typeof content === 'object' && content !== null) {
            // If content is an object with tool property, extract it
            if (content.tool) {
                toolName = content.tool;
            }
            if (content.content) {
                displayContent = content.content;
            } else {
                displayContent = JSON.stringify(content, null, 2);
            }
        }
    } catch (e) {
        console.error("Error parsing tool result message:", e);
        // Fall back to original content
        displayContent = content;
    }
    
    messageDiv.innerHTML = `
        <div class="flex items-center text-accent-green font-medium mb-1">
            <svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10.3432 5.65686L5.65686 10.3432C4.78033 11.2198 4.78033 12.6262 5.65686 13.5027L10.3432 18.1891C11.2198 19.0657 12.6262 19.0657 13.5027 18.1891L18.1891 13.5027C19.0657 12.6262 19.0657 11.2198 18.1891 10.3432L13.5027 5.65686C12.6262 4.78033 11.2198 4.78033 10.3432 5.65686Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 9L12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 15.01L12.01 14.999" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="mr-1">Tool Result:</span>
            <span class="px-2 py-0.5 bg-accent-green bg-opacity-10 rounded text-sm font-mono">${toolName}</span>
        </div>
        <div class="tool-result-content p-2 bg-white rounded border border-apple-200">${formatContent(displayContent)}</div>
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
        case 'question':
            addAgentQuestion(message.content);
            break;
        case 'file_display':
            displayGeneratedFile(message.content);
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
 * Display a generated file in the UI
 */
function displayGeneratedFile(fileInfo) {
    // Create the file display container
    const fileDisplayDiv = document.createElement('div');
    
    // Get file type and path
    const filePath = fileInfo.file_path || '';
    const fileName = fileInfo.file_name || 'Unknown';
    const mimeType = fileInfo.mime_type || 'text/plain';
    const content = fileInfo.content || '';
    const projectName = fileInfo.project_name || 'default';
    
    // Add project name as data attribute for filtering
    fileDisplayDiv.setAttribute('data-project', projectName);
    
    // Add the project to our list if it's new
    if (projectName && projectName !== 'default') {
        const project = addProject(projectName);
        if (project && filePath) {
            // Add file to project's files list if not already there
            if (!project.files.includes(filePath)) {
                project.files.push(filePath);
                localStorage.setItem('projectList', JSON.stringify(projectList));
            }
        }
    }
    
    // Determine file type class for styling
    let fileTypeClass = 'file-type-generic';
    let language = 'plaintext';
    
    // Determine file type and language for syntax highlighting
    if (mimeType.startsWith('text/html')) {
        fileTypeClass = 'file-type-html';
        language = 'html';
    } else if (mimeType === 'text/markdown') {
        fileTypeClass = 'file-type-markdown';
        language = 'markdown';
    } else if (mimeType.startsWith('image/')) {
        fileTypeClass = 'file-type-image';
    } else if (mimeType === 'text/javascript' || fileName.endsWith('.js')) {
        fileTypeClass = 'file-type-code';
        language = 'javascript';
    } else if (mimeType === 'text/css' || fileName.endsWith('.css')) {
        fileTypeClass = 'file-type-code';
        language = 'css';
    } else if (fileName.endsWith('.py')) {
        fileTypeClass = 'file-type-code';
        language = 'python';
    } else if (fileName.endsWith('.json')) {
        fileTypeClass = 'file-type-code';
        language = 'json';
    } else if (fileName.endsWith('.ts') || fileName.endsWith('.tsx')) {
        fileTypeClass = 'file-type-code';
        language = 'typescript';
    } else if (fileName.endsWith('.jsx')) {
        fileTypeClass = 'file-type-code';
        language = 'jsx';
    } else if (fileName.endsWith('.java')) {
        fileTypeClass = 'file-type-code';
        language = 'java';
    } else if (fileName.endsWith('.go')) {
        fileTypeClass = 'file-type-code';
        language = 'go';
    } else if (fileName.endsWith('.php')) {
        fileTypeClass = 'file-type-code';
        language = 'php';
    } else if (fileName.endsWith('.rb')) {
        fileTypeClass = 'file-type-code';
        language = 'ruby';
    } else if (fileName.endsWith('.c') || fileName.endsWith('.cpp') || fileName.endsWith('.h')) {
        fileTypeClass = 'file-type-code';
        language = 'cpp';
    }
    
    // Add classes including the file type
    fileDisplayDiv.className = `file-display new-file ${fileTypeClass}`;
    
    // Create header based on file type
    let headerIcon = '';
    let headerTitle = '';
    
    if (mimeType.startsWith('text/html')) {
        headerIcon = `
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 5H20V19H14M10 19L4 12L10 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        headerTitle = 'HTML Document';
    } else if (mimeType === 'text/markdown') {
        headerIcon = `
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 4V16C20 17.1046 19.1046 18 18 18H6C4.89543 18 4 17.1046 4 16V8C4 6.89543 4.89543 6 6 6H12L14 4H20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        headerTitle = 'Markdown Document';
    } else if (mimeType.startsWith('image/')) {
        headerIcon = `
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M6 20H18C19.1046 20 20 19.1046 20 18V6C20 4.89543 19.1046 4 18 4H6C4.89543 4 4 4.89543 4 6V18C4 19.1046 4.89543 20 6 20Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M8.5 10C9.32843 10 10 9.32843 10 8.5C10 7.67157 9.32843 7 8.5 7C7.67157 7 7 7.67157 7 8.5C7 9.32843 7.67157 10 8.5 10Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M20 15L16 11L6 20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        headerTitle = 'Image';
    } else if (fileTypeClass === 'file-type-code') {
        headerIcon = `
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 3L6 21M18 3L16 21M3 8H21M3 16H21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        headerTitle = 'Code File';
    } else {
        headerIcon = `
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 3V7C14 7.55228 14.4477 8 15 8H19M14 3H7C6.44772 3 6 3.44772 6 4V20C6 20.5523 6.44772 21 7 21H17C17.5523 21 18 20.5523 18 20V7M14 3L18 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
        headerTitle = 'File';
    }
    
    // File header HTML
    const headerHtml = `
        <div class="file-display-header">
            <div class="file-icon">
                ${headerIcon}
            </div>
            <div class="file-title">
                <h3>${headerTitle}: ${fileName} <span class="file-status new">New</span></h3>
                <div class="file-path">${filePath}</div>
                ${projectName !== 'default' ? `<div class="file-project">Project: ${projectName}</div>` : ''}
            </div>
            <div class="file-actions">
                <button onclick="copyToClipboard('${filePath}')" title="Copy file path">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M8 5H6C4.89543 5 4 5.89543 4 7V19C4 20.1046 4.89543 21 6 21H16C17.1046 21 18 20.1046 18 19V17M8 5C8 6.10457 8.89543 7 10 7H12C13.1046 7 14 6.10457 14 5M8 5C8 3.89543 8.89543 3 10 3H12C13.1046 3 14 3.89543 14 5M14 5H16C17.1046 5 18 5.89543 18 7V10M20 14H10M10 14L13 11M10 14L13 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Copy Path
                </button>
                <button onclick="copyToClipboard(${JSON.stringify(content)})" title="Copy content">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 9H15M9 13H15M9 17H13M17 17H20C21.1046 17 22 16.1046 22 15V5C22 3.89543 21.1046 3 20 3H8C6.89543 3 6 3.89543 6 5V15C6 16.1046 6.89543 17 8 17H11M9 21H15M9 21C9 21.5523 9.44772 22 10 22H14C14.5523 22 15 21.5523 15 21M9 21C9 20.4477 9.44772 20 10 20H14C14.5523 20 15 20.4477 15 21" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Copy Content
                </button>
                <button onclick="window.open('${filePath.replace(/\\/g, '/')}', '_blank')">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M10 6H6C4.89543 6 4 6.89543 4 8V18C4 19.1046 4.89543 20 6 20H16C17.1046 20 18 19.1046 18 18V14M14 4H20M20 4V10M20 4L10 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    Open
                </button>
                <button onclick="continueExecution()">
                    Continue
                </button>
            </div>
        </div>
    `;
    
    // File content preview based on file type
    let contentHtml = '';
    
    if (mimeType.startsWith('text/html')) {
        // HTML preview with iframe
        contentHtml = `
            <div class="file-display-content">
                <div class="html-preview">
                    <iframe 
                        sandbox="allow-scripts" 
                        srcdoc="${content.replace(/"/g, '&quot;')}" 
                        title="${fileName} preview"
                    ></iframe>
                    <div class="preview-controls">
                        <button class="preview-control-button" onclick="resizeIframeHeight(this.closest('.html-preview').querySelector('iframe'), 500)">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="7 11 12 6 17 11"></polyline>
                                <polyline points="7 17 12 12 17 17"></polyline>
                            </svg>
                            Resize
                        </button>
                        <button class="preview-control-button" onclick="window.open('${filePath.replace(/\\/g, '/')}', '_blank')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            Full View
                        </button>
                    </div>
                </div>
            </div>
        `;
    } else if (mimeType === 'text/markdown') {
        // Markdown preview 
        contentHtml = `
            <div class="file-display-content">
                <div class="markdown-content p-3 bg-white border border-apple-100 rounded">
                    <pre class="whitespace-pre-wrap">${content}</pre>
                </div>
            </div>
        `;
    } else if (mimeType.startsWith('image/')) {
        // Image preview
        contentHtml = `
            <div class="file-display-content">
                <div class="p-3 bg-white border border-apple-100 rounded">
                    <img src="${filePath}" class="max-w-full h-auto max-h-96 mx-auto" alt="${fileName}" />
                </div>
            </div>
        `;
    } else if (fileTypeClass === 'file-type-code') {
        // Code preview with syntax highlighting
        contentHtml = `
            <div class="file-display-content">
                <div class="code-preview">
                    <div class="code-controls">
                        <div class="code-language">${language.toUpperCase()}</div>
                        <div class="code-actions">
                            <button class="code-action-button" onclick="toggleLineNumbers(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="9" y1="6" x2="20" y2="6"></line>
                                    <line x1="9" y1="12" x2="20" y2="12"></line>
                                    <line x1="9" y1="18" x2="20" y2="18"></line>
                                    <line x1="5" y1="6" x2="5" y2="6"></line>
                                    <line x1="5" y1="12" x2="5" y2="12"></line>
                                    <line x1="5" y1="18" x2="5" y2="18"></line>
                                </svg>
                                Toggle Line Numbers
                            </button>
                            <button class="code-action-button" onclick="toggleWrap(this)">
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M3 12h18"></path>
                                    <polyline points="3 18 5 18 21 18"></polyline>
                                </svg>
                                Toggle Wrap
                            </button>
                        </div>
                    </div>
                    <pre class="code-content"><code class="language-${language}">${escapeHtml(content)}</code></pre>
                </div>
            </div>
        `;
    } else {
        // Generic file (no preview)
        contentHtml = `
            <div class="file-display-content">
                <div class="p-3 bg-white border border-apple-100 rounded">
                    <p>File type: ${mimeType}</p>
                    <p>Saved at: ${filePath}</p>
                </div>
            </div>
        `;
    }
    
    // Combine header and content
    fileDisplayDiv.innerHTML = headerHtml + contentHtml;
    
    // Add to the conversation
    elements.conversation.appendChild(fileDisplayDiv);
    
    // Initialize syntax highlighting if it's a code file
    if (fileTypeClass === 'file-type-code') {
        if (window.Prism) {
            Prism.highlightAllUnder(fileDisplayDiv);
        } else {
            console.warn('Prism.js not loaded for syntax highlighting');
        }
    }
    
    // Scroll to the file display
    scrollToBottom();
    
    // Update the project selector if needed
    if (projectName && projectName !== 'default' && elements.projectSelect && 
        !Array.from(elements.projectSelect.options).some(opt => opt.value === projectName)) {
        updateProjectSelector();
        // Update selection to the current project
        elements.projectSelect.value = projectName;
        currentProject = projectName;
    }
}

/**
 * Resize an iframe's height
 */
function resizeIframeHeight(iframe, increment) {
    if (!iframe) return;
    
    const currentHeight = parseInt(iframe.style.height) || 500;
    const newHeight = currentHeight + increment;
    
    // Set a minimum and maximum height
    if (newHeight < 200) {
        iframe.style.height = '200px';
    } else if (newHeight > 800) {
        iframe.style.height = '800px';
    } else {
        iframe.style.height = newHeight + 'px';
    }
}

/**
 * Continue execution after viewing a file
 */
function continueExecution() {
    showSystemMessage("Continuing execution...", "info");
    // The stream will continue naturally as it's still connected
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
    const inputFields = conversationClone.querySelectorAll('input, button, .typing-indicator');
    inputFields.forEach(field => field.parentNode ? field.parentNode.removeChild(field) : null);
    
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
            markdown += `## User Input\n\n${htmlToMarkdown(element.innerHTML)}\n\n`;
        } else if (element.classList.contains('agent-message')) {
            markdown += `## Agent Response\n\n${htmlToMarkdown(element.innerHTML)}\n\n`;
        } else if (element.classList.contains('agent-question')) {
            markdown += `### Agent Question\n\n${htmlToMarkdown(element.innerHTML)}\n\n`;
        } else if (element.classList.contains('web-browsing')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Web Browsing';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `### ${title}\n\n${htmlToMarkdown(content)}\n\n`;
        } else if (element.classList.contains('reasoning')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Reasoning';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `#### ${title}\n\n${htmlToMarkdown(content)}\n\n`;
        } else if (element.classList.contains('tool-usage')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Tool Usage';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `#### ${title}\n\n${htmlToMarkdown(content)}\n\n`;
        } else if (element.classList.contains('tool-result')) {
            const title = element.querySelector('.flex.items-center')?.textContent.trim() || 'Tool Result';
            const content = element.querySelector('.flex.items-center + div')?.innerHTML || '';
            markdown += `##### ${title}\n\n${htmlToMarkdown(content)}\n\n`;
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
    
    // Replace headers with markdown headers at different levels
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5>(.*?)<\/h5>/gi, '##### $1\n\n');
    
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
    exportOptionsDiv.id = 'exportOptions';
    exportOptionsDiv.className = 'export-options hidden absolute right-0 mt-2 bg-white rounded-lg shadow-apple-lg border border-apple-200 z-50';
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
                    <path d="M10 3H6C4.89543 3 4 3.89543 4 5V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V5C20 3.89543 19.1046 3 18 3H14M10 3V5C10 6.10457 10.8954 7 12 7C13.1046 7 14 6.10457 14 5V3M10 3H14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Save as HTML
            </button>
        </div>
    `;
    
    // Add to the DOM
    document.body.appendChild(exportOptionsDiv);
    
    // Store reference to the export options
    elements.exportOptions = exportOptionsDiv;
    
    // Update the export button to show options
    if (elements.exportPdfBtn) {
        elements.exportPdfBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            
            // Position the options dropdown
            const rect = elements.exportPdfBtn.getBoundingClientRect();
            elements.exportOptions.style.top = `${rect.bottom + 5}px`;
            elements.exportOptions.style.right = `${window.innerWidth - rect.right}px`;
            
            // Toggle visibility
            elements.exportOptions.classList.toggle('hidden');
        });
    }
    
    // Add event listeners for export options
    document.getElementById('exportPdfOption')?.addEventListener('click', function() {
        elements.exportOptions.classList.add('hidden');
        exportConversationToPdf();
    });
    
    document.getElementById('exportMarkdownOption')?.addEventListener('click', function() {
        elements.exportOptions.classList.add('hidden');
        exportConversationToMarkdown();
    });
    
    document.getElementById('exportHtmlOption')?.addEventListener('click', function() {
        elements.exportOptions.classList.add('hidden');
        exportConversationToHtml();
    });
    
    // Close dropdown when clicking elsewhere
    document.addEventListener('click', function(e) {
        if (elements.exportOptions && !elements.exportOptions.contains(e.target) && e.target !== elements.exportPdfBtn) {
            elements.exportOptions.classList.add('hidden');
        }
    });
}

/**
 * Export conversation to HTML file
 */
function exportConversationToHtml() {
    // Create a simplified copy of the conversation
    const conversationClone = elements.conversation.cloneNode(true);
    
    // Create HTML file content
    const htmlContent = `<!DOCTYPE html>
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
        .tool-usage, .tool-result, .reasoning, .web-browsing {
            background-color: #f5f5f7;
            padding: 8px 12px;
            margin: 8px 0;
            border-radius: 4px;
        }
        .tool-usage {
            border-left: 3px solid #0071e3;
        }
        .tool-result {
            border-left: 3px solid #34c759;
        }
        .reasoning {
            border-left: 3px solid #bf5af2;
        }
        .web-browsing {
            border-left: 3px solid #68cc45;
        }
        pre {
            background-color: #f0f0f0;
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
        }
        code {
            font-family: monospace;
        }
        .browser-screenshot-preview img {
            max-width: 100%;
            height: auto;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        h1 {
            color: #333;
            text-align: center;
        }
    </style>
</head>
<body>
    <h1>OpenManus Conversation</h1>
    <div class="conversation-export">
        ${conversationClone.innerHTML}
    </div>
    <div class="footer">
        <p style="text-align: center; color: #888; margin-top: 40px;">
            Generated by OpenManus on ${new Date().toLocaleString()}
        </p>
    </div>
</body>
</html>`;
    
    // Create a blob and trigger download
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `OpenManus_Conversation_${formatDateForFilename(new Date())}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Show confirmation
    showSystemMessage("Conversation saved as HTML", "success");
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
            <span class="text-apple-700">${data.url || 'Current webpage'}</span>
        </div>
        <div class="browser-screenshot-preview cursor-pointer" onclick="openBrowserView()">
            <img src="data:image/png;base64,${data.image_data}" alt="Browser screenshot" class="max-h-48 rounded-lg border border-apple-200 hover:border-accent-blue transition">
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
 * Toggle between screenshot view and live browser view
 */
function toggleLiveBrowserView() {
    if (!elements.liveBrowserView || !elements.browserViewContent) return;
    
    isLiveViewActive = !isLiveViewActive;
    
    if (isLiveViewActive) {
        // Switch to live view
        elements.browserViewContent.classList.add('hidden');
        elements.liveBrowserView.classList.remove('hidden');
        elements.screenshotModeText.classList.add('hidden');
        elements.liveModeText.classList.remove('hidden');
        elements.toggleLiveViewBtn.textContent = 'Show Screenshot';
        elements.toggleLiveViewBtn.classList.remove('bg-accent-green');
        elements.toggleLiveViewBtn.classList.add('bg-accent-blue');
        
        // Update the iframe src
        updateLiveBrowserView();
    } else {
        // Switch to screenshot view
        elements.browserViewContent.classList.remove('hidden');
        elements.liveBrowserView.classList.add('hidden');
        elements.screenshotModeText.classList.remove('hidden');
        elements.liveModeText.classList.add('hidden');
        elements.toggleLiveViewBtn.textContent = 'Show Live View';
        elements.toggleLiveViewBtn.classList.remove('bg-accent-blue');
        elements.toggleLiveViewBtn.classList.add('bg-accent-green');
    }
}

/**
 * Update the live browser view iframe
 */
function updateLiveBrowserView() {
    if (!elements.browserIframe || !browserRemoteUrl) return;
    
    // Set the iframe src to the current browser URL
    // We use a proxy endpoint to avoid CORS issues
    elements.browserIframe.src = `/browser_proxy?url=${encodeURIComponent(browserRemoteUrl)}`;
}

/**
 * Toggle the embedded browser view (fixed position)
 */
function toggleEmbeddedBrowser() {
    if (elements.browserViewModal.classList.contains('hidden')) {
        openBrowserView();
    } else {
        closeBrowserView();
    }
}

/**
 * Trigger a browser screenshot from the server
 */
async function triggerBrowserScreenshot() {
    if (!currentTaskId) return;
    
    try {
        // Show loading state
        if (elements.takeBrowserScreenshotBtn) {
            elements.takeBrowserScreenshotBtn.textContent = 'Taking...';
            elements.takeBrowserScreenshotBtn.disabled = true;
        }
        
        // Call the trigger screenshot endpoint
        const response = await fetch(`/trigger_screenshot/${currentTaskId}`, {
            method: 'POST'
        });
        
        if (!response.ok) {
            console.error('Failed to trigger screenshot');
            showSystemMessage('Failed to trigger screenshot', 'error');
        } else {
            // Wait a moment for the screenshot to be processed
            setTimeout(fetchBrowserScreenshot, 1000);
        }
    } catch (error) {
        console.error('Error triggering screenshot:', error);
        showSystemMessage('Error triggering screenshot', 'error');
    } finally {
        // Reset button state
        if (elements.takeBrowserScreenshotBtn) {
            elements.takeBrowserScreenshotBtn.textContent = 'Take Screenshot';
            elements.takeBrowserScreenshotBtn.disabled = false;
        }
    }
}

/**
 * Save the verbosity preference to localStorage
 */
function saveVerbosityPreference() {
    if (elements.verbosityControl) {
        localStorage.setItem('verbosityPreference', elements.verbosityControl.value);
        console.log(`Saved verbosity preference: ${elements.verbosityControl.value}`);
    }
}

/**
 * Load the verbosity preference from localStorage
 */
function loadVerbosityPreference() {
    const savedVerbosity = localStorage.getItem('verbosityPreference');
    if (savedVerbosity && elements.verbosityControl) {
        elements.verbosityControl.value = savedVerbosity;
        console.log(`Loaded verbosity preference: ${savedVerbosity}`);
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM content loaded, initializing application...");
    
    // Initialize UI elements
    initializeElements();
    
    // Load saved preferences
    loadSavedApiKeys();
    loadVerbosityPreference();
    
    // Initialize UI
    init();
    
    console.log("Application initialized successfully");
});

/**
 * Initialize all UI elements
 */
function initializeElements() {
    console.log("Initializing UI elements...");
    
    // Main UI elements
    elements.input = document.getElementById('prompt-input');
    elements.conversation = document.getElementById('conversation');
    elements.executeBtn = document.getElementById('execute-btn');
    elements.stopBtn = document.getElementById('stop-btn');
    elements.clearBtn = document.getElementById('clear-btn');
    elements.exportPdfBtn = document.getElementById('export-pdf-btn');
    elements.exportOptions = document.getElementById('export-options');
    
    // Configuration elements
    elements.deploymentSelect = document.getElementById('deployment-select');
    elements.localModelSelect = document.getElementById('local-model-select');
    elements.cloudModelSelect = document.getElementById('cloud-model-select');
    elements.cloudConfig = document.getElementById('cloudConfig');
    elements.localModels = document.getElementById('localModels');
    elements.apiKey = document.getElementById('api-key-input');
    elements.saveKeyBtn = document.getElementById('save-key-btn');
    elements.clearKeyBtn = document.getElementById('clear-key-btn');
    elements.maxSteps = document.getElementById('max-steps');
    elements.verbosityControl = document.getElementById('verbosity-control');
    
    // Browser elements
    elements.browserViewModal = document.getElementById('browserViewModal');
    elements.browserViewTitle = document.getElementById('browserViewTitle');
    elements.browserViewUrl = document.getElementById('browserViewUrl');
    elements.browserViewFrame = document.getElementById('browserViewFrame');
    elements.closeBrowserViewBtn = document.getElementById('closeBrowserViewBtn');
    elements.toggleLiveViewBtn = document.getElementById('toggleLiveViewBtn');
    elements.embeddedBrowserToggle = document.getElementById('embeddedBrowserToggle');
    elements.closeFloatingBrowserBtn = document.getElementById('closeFloatingBrowserBtn');
    elements.expandBrowserBtn = document.getElementById('expandBrowserBtn');
    elements.autoUpdateToggle = document.getElementById('autoUpdateToggle');
    elements.takeBrowserScreenshotBtn = document.getElementById('takeBrowserScreenshotBtn');
    
    // Debug element initialization
    console.log("UI elements initialized:", Object.keys(elements).length);
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
    
    elements.conversation.appendChild(messageDiv);
    scrollToBottom();
    
    // Automatically open the browser view modal
    openBrowserView();
}

/**
 * Set up all event handlers for the UI
 */
function setupEventHandlers() {
    // Main action buttons
    if (elements.executeBtn) {
        elements.executeBtn.addEventListener('click', executePrompt);
    }
    
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
    
    // Deployment type changes
    if (elements.deploymentSelect) {
        elements.deploymentSelect.addEventListener('change', function(e) {
            if (elements.cloudConfig && elements.localModels) {
                if (e.target.value === 'cloud') {
                    elements.cloudConfig.classList.remove('hidden');
                    elements.localModels.classList.add('hidden');
                    // Update API key field if available
                    updateApiKeyField();
                } else {
                    elements.cloudConfig.classList.add('hidden');
                    elements.localModels.classList.remove('hidden');
                }
            }
        });
    }
    
    // API key management
    if (elements.saveKeyBtn) {
        elements.saveKeyBtn.addEventListener('click', saveApiKey);
    }
    
    if (elements.clearKeyBtn) {
        elements.clearKeyBtn.addEventListener('click', clearSavedApiKey);
    }
    
    // Browser view handlers
    if (elements.closeBrowserViewBtn) {
        elements.closeBrowserViewBtn.addEventListener('click', closeBrowserView);
    }
    
    if (elements.toggleLiveViewBtn) {
        elements.toggleLiveViewBtn.addEventListener('click', toggleLiveBrowserView);
    }
    
    if (elements.embeddedBrowserToggle) {
        elements.embeddedBrowserToggle.addEventListener('click', toggleEmbeddedBrowser);
    }
    
    // Floating browser panel handlers
    if (elements.closeFloatingBrowserBtn) {
        elements.closeFloatingBrowserBtn.addEventListener('click', closeFloatingBrowserPanel);
    }
    
    if (elements.expandBrowserBtn) {
        elements.expandBrowserBtn.addEventListener('click', expandToBrowserModal);
    }
    
    if (elements.autoUpdateToggle) {
        elements.autoUpdateToggle.addEventListener('change', function() {
            autoUpdateScreenshots = this.checked;
            if (autoUpdateScreenshots) {
                startScreenshotInterval();
            } else {
                stopScreenshotInterval();
            }
        });
    }
    
    if (elements.takeBrowserScreenshotBtn) {
        elements.takeBrowserScreenshotBtn.addEventListener('click', triggerBrowserScreenshot);
    }
    
    // Add export options
    addExportOptions();
    
    // Update UI state
    updateUIForExecution(false);
    
    // Cloud model changes for API key updating
    if (elements.cloudModelSelect) {
        elements.cloudModelSelect.addEventListener('change', updateApiKeyField);
    }
}

/**
 * Function to initialize projects
 */
function initializeProjects() {
    // Create projects dropdown in the header
    const projectSelector = document.createElement('div');
    projectSelector.id = 'project-selector';
    projectSelector.className = 'ml-4 flex items-center';
    projectSelector.innerHTML = `
        <label for="project-select" class="text-sm text-apple-600 mr-2">Project:</label>
        <select id="project-select" class="text-sm border border-apple-200 rounded-md px-2 py-1">
            <option value="all">All Projects</option>
        </select>
    `;
    
    // Insert before the export options
    const conversationHeader = document.querySelector('.conversation-header');
    if (conversationHeader) {
        conversationHeader.insertBefore(
            projectSelector, 
            document.querySelector('.export-options')
        );
    } else {
        console.warn('Could not find conversation header to add project selector');
    }
    
    // Store reference to the select element
    elements.projectSelect = document.getElementById('project-select');
    
    // Add event listener for project change
    if (elements.projectSelect) {
        elements.projectSelect.addEventListener('change', function() {
            const selectedProject = this.value;
            filterFilesByProject(selectedProject);
        });
    }
    
    // Check for existing projects in local storage
    const savedProjects = localStorage.getItem('projectList');
    if (savedProjects) {
        try {
            projectList = JSON.parse(savedProjects);
            updateProjectSelector();
        } catch (e) {
            console.error('Error parsing saved projects:', e);
            projectList = {};
        }
    }
}

/**
 * Add a project to the list
 */
function addProject(projectName, projectFiles = []) {
    if (!projectName) return;
    
    if (!projectList[projectName]) {
        projectList[projectName] = {
            name: projectName,
            files: projectFiles,
            created: new Date().toISOString()
        };
        
        // Save to local storage
        localStorage.setItem('projectList', JSON.stringify(projectList));
        
        // Update the UI
        updateProjectSelector();
    }
    
    // Set as current project if none is selected
    if (!currentProject) {
        currentProject = projectName;
        if (elements.projectSelect) {
            elements.projectSelect.value = projectName;
        }
    }
    
    return projectList[projectName];
}

/**
 * Update the project selector dropdown
 */
function updateProjectSelector() {
    if (!elements.projectSelect) return;
    
    // Clear existing options except "All Projects"
    while (elements.projectSelect.options.length > 1) {
        elements.projectSelect.remove(1);
    }
    
    // Add project options
    for (const project in projectList) {
        const option = document.createElement('option');
        option.value = project;
        option.textContent = project;
        elements.projectSelect.appendChild(option);
    }
}

/**
 * Filter displayed files by project
 */
function filterFilesByProject(projectName) {
    // Get all file displays
    const fileDisplays = document.querySelectorAll('.file-display');
    
    if (projectName === 'all') {
        // Show all files
        fileDisplays.forEach(file => {
            file.style.display = 'block';
        });
    } else {
        // Show only files for the selected project
        fileDisplays.forEach(file => {
            const fileProject = file.getAttribute('data-project');
            if (fileProject === projectName) {
                file.style.display = 'block';
            } else {
                file.style.display = 'none';
            }
        });
    }
    
    // Update current project
    currentProject = projectName;
} 

/**
 * OpenManus Frontend Application
 * (Existing code remains unchanged above this section.)
 */

/* --- New: Typewriter Effect Function --- */
function typewriterEffect(element, text, delay = 50) {
  let i = 0;
  element.innerHTML = "";
  const interval = setInterval(() => {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
    } else {
      clearInterval(interval);
    }
  }, delay);
}

/* --- Updated: Add Agent Message with Typewriter Effect --- */
function addAgentMessage(content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message-bubble agent-message";
  const contentSpan = document.createElement("span");
  messageDiv.appendChild(contentSpan);
  elements.conversation.appendChild(messageDiv);
  typewriterEffect(contentSpan, content);
  scrollToBottom();
}

/* --- Updated: Display Final Response with Typewriter Effect --- */
function displayFinalResponse(content) {
  const messageDiv = document.createElement("div");
  messageDiv.className = "message-bubble agent-message final-response";
  
  const headerDiv = document.createElement("div");
  headerDiv.className = "flex items-center text-accent-green font-medium mb-2";
  headerDiv.innerHTML = `<svg class="w-4 h-4 mr-1" viewBox="0 0 24 24" fill="none"
          xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12L11 14L15 10M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z"
              stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg> Final Response`;
  messageDiv.appendChild(headerDiv);
  
  const contentDiv = document.createElement("div");
  contentDiv.className = "pb-2 mb-2 border-b border-apple-200";
  messageDiv.appendChild(contentDiv);
  
  elements.conversation.appendChild(messageDiv);
  typewriterEffect(contentDiv, content);
  scrollToBottom();
}

/* --- New: Theme Toggle Initialization --- */
document.addEventListener("DOMContentLoaded", function () {
  // Existing initialization code…
  if (document.getElementById("theme-toggle")) {
    document
      .getElementById("theme-toggle")
      .addEventListener("click", function () {
        document.body.classList.toggle("dark");
      });
  }
  
  // Other initialization code (e.g., executeBtn listeners) remains unchanged.
});

/**
 * Existing functions like executePrompt, connectToEventStream, etc.
 * remain unchanged unless further modifications are required.
 */
