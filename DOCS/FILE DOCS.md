<think>
The user is asking me to create a markdown document that summarizes the purpose of the OpenManus codebase and provides documentation about its file format and logical structure. I'll need to analyze the codebase to provide a comprehensive overview.

From the code I've seen so far, OpenManus appears to be an AI agent platform that can perform various tasks using a collection of tools. It has a web interface for interacting with the agent, and it uses Server-Sent Events (SSE) for real-time communication between the server and client.

Let me structure the documentation to include:
1. Introduction and Project Overview
2. System Architecture
3. Key Components
4. File Structure
5. Data Flow
6. API Endpoints
7. Frontend Implementation
8. Agent Implementation
9. Tool System
10. Getting Started

I'll create this as a comprehensive markdown document based on what I've learned from examining the codebase.
</think>

# OpenManus: AI Agent Platform Documentation

## 1. Introduction

OpenManus is a versatile AI agent platform that provides a framework for building, deploying, and interacting with AI agents capable of solving complex tasks. The platform combines language model capabilities with a rich set of tools, allowing agents to browse the web, execute Python code, search Google, save files, and more.

## 2. System Architecture

OpenManus follows a client-server architecture with several key components:

- **Backend**: Built with FastAPI, the backend manages agent execution, tool integration, and real-time communication with the frontend.
- **Frontend**: A web interface that allows users to input prompts, view agent responses, and interact with the agent during execution.
- **Communication**: Uses Server-Sent Events (SSE) for real-time streaming of agent progress and results.
- **Agent System**: A hierarchical system of agent classes that implement different reasoning patterns.
- **Tool System**: A pluggable tool architecture that extends agent capabilities.
- **LLM Interface**: A unified interface for interacting with multiple language model providers.

### 2.1 Architectural Flow

1. **User Request Flow**:
   - User submits a prompt through the web interface
   - Request is sent to the `/execute` endpoint
   - Server creates a new task with a unique ID
   - Client connects to the `/stream/{task_id}` endpoint for real-time updates
   - Agent processes the request and streams results back to the client

2. **Agent Execution Flow**:
   - Agent initializes with the user prompt
   - For each step (up to max_steps):
     - Agent generates the next action using the LLM
     - If the action is to respond, it returns the response and terminates
     - If the action is to ask a question, it waits for user input
     - Otherwise, it executes a tool with the provided parameters
     - Tool results are added to the conversation history
   - Agent returns a structured result containing summaries and details

3. **Browser Integration Flow**:
   - When the agent uses the browser tool, screenshots are captured
   - Screenshots are sent to the frontend via the event stream
   - Frontend displays the screenshots in a floating panel or modal
   - Users can manually trigger screenshots or toggle auto-update

## 3. File Structure and Component Relationships

```
OpenManus/
├── app/                      # Core application code
│   ├── agent/                # Agent implementations
│   │   ├── base.py           # Base agent abstract class - defines core agent interface
│   │   ├── manus.py          # Main Manus agent implementation - extends ToolCallAgent with specialized tools
│   │   ├── react.py          # ReAct pattern agent implementation - implements reasoning and acting pattern
│   │   └── toolcall.py       # Tool-calling agent implementation - extends ReAct with tool execution
│   ├── prompt/               # Prompt templates
│   │   └── manus.py          # Manus agent prompts - system and step prompts
│   ├── tool/                 # Tool implementations
│   │   ├── base.py           # Base tool abstract class - defines tool interface
│   │   ├── browser_use_tool.py # Web browsing capabilities - enables web navigation and screenshots
│   │   ├── file_saver.py     # File manipulation - saves content to files
│   │   ├── google_search.py  # Web search functionality - performs Google searches
│   │   ├── python_execute.py # Python code execution - runs Python code
│   │   └── str_replace_editor.py # String replacement tool - edits text content
│   ├── config.py             # Configuration settings - manages app configuration
│   ├── compat.py             # Python version compatibility - ensures compatibility across Python versions
│   ├── exceptions.py         # Custom exceptions - defines app-specific exceptions
│   ├── httpx_helper.py       # Helper for httpx client management - manages HTTP client lifecycle
│   ├── llm.py                # Language model interface - provides unified access to multiple LLM providers
│   ├── logger.py             # Logging configuration - sets up application logging
│   └── schema.py             # Data models and schemas - defines core data structures
├── static/                   # Frontend assets
│   ├── js/                   # JavaScript files
│   │   └── app.js            # Main frontend application - handles UI and communication
│   ├── css/                  # Stylesheets - defines application styling
│   └── index.html            # Main HTML page - defines application structure
├── config/                   # Configuration directory
│   └── config.toml           # Configuration file with multi-provider support
├── main.py                   # Main application entry point - simplified API
├── run_web.py                # Convenience script to start the web server
├── web.py                    # Extended web interface with more features - full-featured API
└── app.py                    # Simplified application version - minimal API
```

## 4. Core Components and Their Interactions

### 4.1 Agent System Hierarchy

The agent system follows a hierarchical inheritance pattern:

```
BaseAgent (abstract)
  └── ReActAgent
       └── ToolCallAgent
            └── Manus
```

- **BaseAgent** (app/agent/base.py):
  - Abstract base class that defines the core agent interface
  - Manages agent state transitions and memory
  - Implements the execution loop with step-based processing
  - Provides hooks for subclasses to implement specific behaviors

- **ReActAgent** (app/agent/react.py):
  - Implements the ReAct (Reasoning + Acting) pattern
  - Breaks down complex tasks into reasoning steps and actions
  - Manages the thought process and decision-making flow

- **ToolCallAgent** (app/agent/toolcall.py):
  - Extends ReActAgent with the ability to call external tools
  - Handles tool selection, parameter extraction, and result processing
  - Manages the tool execution lifecycle

- **Manus** (app/agent/manus.py):
  - The main agent implementation with a comprehensive set of tools
  - Implements specialized handling for different content types
  - Provides browser integration and screenshot capabilities
  - Handles user interaction and question-answering

### 4.2 Tool System Architecture

The tool system is built around the `BaseTool` abstract class:

- **BaseTool** (app/tool/base.py):
  - Abstract base class that defines the tool interface
  - Provides the `execute` method that tools must implement
  - Handles parameter validation and result formatting

- **Tool Implementations**:
  - **BrowserUseTool**: Enables web browsing with navigation and screenshot capabilities
  - **GoogleSearch**: Performs web searches and returns results
  - **PythonExecute**: Executes Python code and returns the result
  - **FileSaver**: Saves content to files with proper error handling
  - **Terminate**: Allows the agent to end execution

- **Tool Collection**:
  - Tools are organized into a collection that the agent can access
  - The agent selects tools based on the task requirements
  - Tool results are formatted and added to the conversation history

### 4.3 Language Model Interface

The `LLM` class (app/llm.py) provides a unified interface to multiple language model providers:

- **Provider Support**:
  - OpenAI (GPT models)
  - Anthropic (Claude models)
  - Azure OpenAI (hosted GPT models)
  - Google (Gemini models) - partial implementation
  - Meta (Llama models) - partial implementation

- **Key Features**:
  - Singleton pattern per configuration name
  - Automatic provider detection based on model name
  - Provider-specific client creation and API handling
  - Unified interface for sending prompts and receiving responses
  - Error handling with specific error types for different failure modes
  - Support for both synchronous and asynchronous operations
  - Retry mechanism for transient errors

### 4.4 Memory and Message System

The memory system manages conversation history and message formatting:

- **Memory** (app/schema.py):
  - Stores messages with their roles (user, system, assistant, tool)
  - Manages conversation context window limits
  - Provides methods for manipulating and converting messages

- **Message** (app/schema.py):
  - Represents a chat message in the conversation
  - Supports different message types (text, tool calls, tool results)
  - Provides conversion methods for different LLM provider formats

### 4.5 Web Server and API

The web server provides the API endpoints for interacting with the agent:

- **Main Application** (main.py):
  - Simplified API with basic functionality
  - Handles task creation, execution, and streaming

- **Extended Web Interface** (web.py):
  - Full-featured API with additional capabilities
  - Implements browser screenshot handling
  - Provides user interaction endpoints
  - Manages task lifecycle with pause/resume functionality

- **Run Script** (run_web.py):
  - Convenience script for starting the web server
  - Handles port selection and availability checking
  - Sets up logging and environment

## 5. Data Flow and Processing Logic

### 5.1 Request Processing Flow (Detailed)

1. **User Request Initiation**:
   - User enters a prompt in the web interface
   - Frontend sends a POST request to `/execute` with the prompt, model, and API key
   - Server generates a unique task ID and creates an asyncio Queue for messages
   - Server starts an asyncio task to run the agent
   - Server returns the task ID to the client

2. **Event Stream Connection**:
   - Client connects to `/stream/{task_id}` using EventSource
   - Server creates an event generator that pulls messages from the task's queue
   - Messages are sent to the client as they are generated by the agent
   - Client processes different message types and updates the UI accordingly

3. **Agent Execution Process**:
   - Agent initializes with the user prompt and system instructions
   - Agent enters the execution loop, processing one step at a time
   - For each step, the agent:
     - Generates the next action using the LLM
     - Processes the action based on its type (response, question, tool call)
     - Sends progress updates to the client via the message queue
   - Agent continues until it reaches a terminal state or max steps

4. **Tool Execution Flow**:
   - When the agent decides to use a tool:
     - It extracts the tool name and parameters from the LLM response
     - It looks up the tool in its available tools collection
     - It executes the tool with the provided parameters
     - It processes the tool result and adds it to the conversation history
     - It sends the tool usage and result to the client

5. **User Interaction Flow**:
   - When the agent needs user input:
     - It sends a question message to the client
     - The client displays the question and waits for user input
     - User provides a response, which is sent to `/resume/{task_id}`
     - Server adds the response to the agent's user_response_queue
     - Agent receives the response and continues execution

6. **Browser Integration Flow**:
   - When the agent uses the browser tool:
     - Browser screenshots are captured and stored in memory
     - Screenshots are sent to the client via the event stream
     - Client displays the screenshots in a floating panel or modal
     - User can manually trigger screenshots or toggle auto-update

### 5.2 Message Types and Formats

Server-sent events follow this structure:

```json
{
  "type": "message_type",  // info, log, error, success, question, reasoning, tool, tool_result, browser_screenshot
  "content": "message content",
  "timestamp": "ISO timestamp"
}
```

Special message types include:

- **Tool Usage**:
  ```json
  {
    "type": "tool_usage",
    "tool": "tool_name",
    "input": {/* tool parameters */},
    "content": "formatted message",
    "step": 3  // Step number
  }
  ```

- **Browser Screenshot**:
  ```json
  {
    "type": "browser_screenshot",
    "content": {
      "image_data": "base64_encoded_image",
      "url": "current_url",
      "title": "page_title"
    },
    "timestamp": "ISO timestamp"
  }
  ```

- **Success with Result**:
  ```json
  {
    "type": "success",
    "result": {
      "summary": "Task summary",
      "details": [/* detailed conversation */],
      "final_response": "Final agent response"
    },
    "timestamp": "ISO timestamp"
  }
  ```

## 6. Key Features and Implementation Details

### 6.1 Browser Integration

The browser integration is implemented through several components:

- **BrowserUseTool** (app/tool/browser_use_tool.py):
  - Enables web navigation with actions like navigate, click, type, etc.
  - Captures screenshots of the current browser state
  - Extracts page content and metadata

- **Browser Screenshot Handling** (web.py):
  - `/browser_screenshot/{task_id}` endpoint for saving and retrieving screenshots
  - `/trigger_screenshot/{task_id}` endpoint for manually triggering screenshots
  - In-memory storage of screenshots by task ID

- **Manus Agent Browser Methods** (app/agent/manus.py):
  - `take_browser_screenshot()`: Manually triggers a browser screenshot
  - `get_current_browser_url()`: Retrieves the current browser URL
  - `register_browser_event_handler()`: Registers a handler for browser events

- **Frontend Browser Panel** (static/js/app.js):
  - Floating browser panel that displays screenshots
  - Auto-update functionality with configurable intervals
  - Manual screenshot triggering
  - Expandable view for better visibility

### 6.2 HTML Content Handling

The Manus agent includes special handling for HTML content:

- **HTML Detection** (app/agent/manus.py):
  - Detects when Python code is actually HTML content
  - Redirects HTML content to appropriate handling methods

- **HTML Rendering Options**:
  - For complex HTML or HTML with scripts:
    - Saves to a file using the FileSaver tool
    - Returns the file path to the user
  - For simple HTML:
    - Creates a temporary HTML file
    - Uses the browser tool to navigate to the file
    - Displays the content directly in the browser panel

### 6.3 Multi-Provider LLM Support

The LLM interface supports multiple providers through a unified API:

- **Provider Detection** (app/config.py):
  - Automatically detects the appropriate provider based on model name
  - Maps model prefixes to providers (e.g., "gpt" to OpenAI, "claude" to Anthropic)

- **Provider-Specific Handling** (app/llm.py):
  - Creates the appropriate client for each provider
  - Formats messages according to provider requirements
  - Handles provider-specific API calls and responses

- **Configuration System** (app/config.py):
  - Flexible configuration with provider-specific settings
  - Environment variable fallbacks for API keys
  - Validation for API keys and configuration parameters

### 6.4 Error Handling and Resilience

The system includes comprehensive error handling:

- **LLM Errors** (app/llm.py):
  - Custom error types for different failure modes (AuthError, RateLimitError, ServiceError)
  - Retry mechanism for transient errors with exponential backoff
  - Detailed error messages for debugging

- **Tool Execution Errors** (app/tool/base.py):
  - ToolResult class for standardized error reporting
  - ToolFailure class for representing tool execution failures
  - Error propagation to the agent and client

- **Agent Error Handling** (app/agent/base.py):
  - State transitions with context managers for safe error handling
  - Stuck detection to prevent infinite loops
  - Error recovery mechanisms

### 6.5 File Saving Functionality

The FileSaver tool provides file manipulation capabilities:

- **FileSaver Tool** (app/tool/file_saver.py):
  - Saves content to files with proper directory creation
  - Supports different file modes (write, append)
  - Handles errors with detailed error messages

- **Manus Agent Integration** (app/agent/manus.py):
  - Special handling for different content types
  - Automatic file naming with timestamps
  - Error handling and fallback mechanisms

## 7. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Redirects to the web interface |
| `/execute` | POST | Starts a new agent task with the provided prompt |
| `/stream/{task_id}` | GET | Streams task execution results using SSE |
| `/stop/{task_id}` | POST | Stops a running task |
| `/pause/{task_id}` | POST | Pauses task execution |
| `/resume/{task_id}` | POST | Resumes a paused task with user input |
| `/browser_screenshot/{task_id}` | POST | Saves a browser screenshot for a task |
| `/browser_screenshot/{task_id}` | GET | Retrieves the latest browser screenshot for a task |
| `/trigger_screenshot/{task_id}` | POST | Manually triggers a browser screenshot |
| `/browser_proxy` | GET | Proxies browser requests to avoid CORS issues |

## 8. Frontend Implementation

The frontend (in `static/js/app.js`) handles:

- **User Interface**:
  - Input form for user prompts
  - API key management with secure storage
  - Real-time conversation display
  - Different message types (questions, reasoning, tool usage)
  - Responsive design for different device sizes

- **Event Stream Handling**:
  - Connection to the SSE endpoint
  - Processing of different message types
  - Real-time UI updates
  - Error handling and reconnection

- **Browser Integration**:
  - Floating browser panel for screenshot display
  - Auto-update functionality
  - Manual screenshot triggering
  - Expandable view for better visibility

- **Export Functionality**:
  - Conversation export to PDF
  - Conversation export to Markdown
  - Conversation export to HTML

## 9. Extension Points

### 9.1 Adding New Tools

Create a new class that inherits from `BaseTool` in `app/tool/base.py`:

```python
from app.tool.base import BaseTool

class MyNewTool(BaseTool):
    name: str = "my_new_tool"
    description: str = "Description of what my tool does"
    parameters: dict = {
        "type": "object",
        "properties": {
            "param1": {
                "type": "string",
                "description": "Description of parameter 1",
            },
            "param2": {
                "type": "integer",
                "description": "Description of parameter 2",
            },
        },
        "required": ["param1"],
    }
    
    async def execute(self, param1: str, param2: int = 0) -> str:
        # Implement tool functionality
        result = f"Processed {param1} with value {param2}"
        return result
```

Then add your tool to the Manus agent's available tools:

```python
from app.agent.manus import Manus
from app.tool.base import ToolCollection
from my_module import MyNewTool

# Create a custom Manus agent with the new tool
class CustomManus(Manus):
    available_tools: ToolCollection = Manus.available_tools + [MyNewTool()]
```

### 9.2 Adding a New LLM Provider

To add support for a new LLM provider:

1. Update the `get_provider_from_model` function in `app/config.py`:
   ```python
   def get_provider_from_model(model_name: str) -> str:
       model_name = model_name.lower()
       
       provider_prefixes = {
           'gpt': 'openai',
           'claude': 'anthropic',
           'gemini': 'google',
           'llama': 'meta',
           'new-model': 'new-provider',  # Add your new provider here
       }
       
       # Check against known prefixes
       for prefix, provider in provider_prefixes.items():
           if model_name.startswith(prefix):
               return provider
               
       return "openai"  # Default
   ```

2. Add the base URL in `get_base_url_for_provider`:
   ```python
   def get_base_url_for_provider(provider: str) -> str:
       provider_urls = {
           "openai": "https://api.openai.com/v1",
           "anthropic": "https://api.anthropic.com/v1",
           "google": "https://generativelanguage.googleapis.com/v1",
           "meta": "https://llama-api.meta.com/v1",
           "new-provider": "https://api.new-provider.com/v1",  # Add your new provider here
       }
       
       return provider_urls.get(provider, "https://api.openai.com/v1")
   ```

3. Modify the `_create_client` and `ask` methods in the `LLM` class to handle the new provider:
   ```python
   async def _create_client(self):
       # Existing code...
       
       elif self.api_type == "new-provider":
           try:
               # Import the new provider's client library
               import new_provider
               
               # Create the client
               self.client = new_provider.AsyncClient(
                   api_key=self.api_key,
                   base_url=self.base_url,
               )
               logger.info(f"Created New Provider client for model {self.model}")
           except ImportError:
               raise ImportError("New Provider package not installed. Install with: pip install new-provider")
           except Exception as e:
               raise AuthError(f"Failed to create New Provider client: {str(e)}")
   ```

4. Add a new method to handle the provider's API calls:
   ```python
   async def _ask_new_provider(self, messages, stream, temperature=None):
       try:
           # Format messages for the new provider
           formatted_messages = self._format_messages_for_new_provider(messages)
           
           # Call the API
           response = await self.client.chat.completions.create(
               model=self.model,
               messages=formatted_messages,
               temperature=temperature or self.temperature,
               stream=stream,
           )
           
           # Process the response
           if stream:
               full_response = ""
               async for chunk in response:
                   content = chunk.choices[0].delta.content or ""
                   full_response += content
                   yield content
               return full_response
           else:
               return response.choices[0].message.content
       except Exception as e:
           # Handle errors
           self._handle_provider_error(e)
   ```

### 9.3 Custom Agents

Extend one of the base agent classes to create your own specialized agent:

```python
from app.agent.toolcall import ToolCallAgent
from app.tool.base import ToolCollection
from my_tools import CustomTool1, CustomTool2

class MySpecialAgent(ToolCallAgent):
    name: str = "MyAgent"
    description: str = "A specialized agent for specific tasks"
    system_prompt: str = """You are a specialized agent designed to perform specific tasks.
Your goal is to help users with [specific domain] tasks efficiently and accurately.
Always explain your reasoning and approach clearly."""
    
    # Add custom tools
    available_tools: ToolCollection = [
        CustomTool1(),
        CustomTool2(),
    ]
    
    # Override methods as needed
    async def step(self):
        # Custom step implementation
        # ...
        return await super().step()
```

## 10. Known Issues and Limitations

- **Browser Integration**:
  - Browser screenshots may not work in all environments, particularly in headless mode
  - Live browser view requires specific browser configurations
  - Some websites may block automated browsing

- **LLM Providers**:
  - Language model responses may vary depending on the provider and model used
  - Some providers may have rate limits or token limitations
  - API keys must be provided in the correct format for each provider

- **File Saving**:
  - The FileSaver tool requires correct parameter names (`file_path` instead of `filename`)
  - Directory permissions may affect file saving capabilities
  - Large files may cause performance issues

- **Python Execution**:
  - Python code execution has security implications and should be used carefully
  - Long-running code may block the agent execution
  - Some libraries may not be available in the execution environment

## 11. Future Enhancements

- **Enhanced Browser Integration**:
  - Full browser automation with more advanced interactions
  - Better screenshot handling with element highlighting
  - Improved live browser view with interactive elements

- **Multi-Agent Collaboration**:
  - Support for multiple agents working together
  - Agent specialization for different tasks
  - Inter-agent communication and coordination

- **Memory Management**:
  - Long-term memory storage for persistent knowledge
  - Vector database integration for semantic search
  - Context window optimization for longer conversations

- **Tool Improvements**:
  - More sophisticated file handling with different formats
  - Enhanced web search capabilities with multiple sources
  - Image generation and processing tools

---

This documentation provides a comprehensive overview of the OpenManus platform. For more detailed information on specific components, refer to the code comments and docstrings within each module.
