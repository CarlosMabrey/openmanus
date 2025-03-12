# OpenManus: AI Agent Platform Documentation

## 1. Introduction

OpenManus is a versatile AI agent platform that provides a framework for building, deploying, and interacting with AI agents capable of solving complex tasks. The platform combines language model capabilities with a rich set of tools, allowing agents to browse the web, execute Python code, search Google, save files, and more.

## 2. System Architecture

OpenManus follows a client-server architecture:

- **Backend**: Built with FastAPI, the backend manages agent execution, tool integration, and real-time communication with the frontend.
- **Frontend**: A web interface that allows users to input prompts, view agent responses, and interact with the agent during execution.
- **Communication**: Uses Server-Sent Events (SSE) for real-time streaming of agent progress and results.

## 3. File Structure

```
OpenManus/
├── app/                      # Core application code
│   ├── agent/                # Agent implementations
│   │   ├── base.py           # Base agent abstract class
│   │   ├── manus.py          # Main Manus agent implementation
│   │   ├── react.py          # ReAct pattern agent implementation
│   │   └── toolcall.py       # Tool-calling agent implementation
│   ├── prompt/               # Prompt templates
│   │   └── manus.py          # Manus agent prompts
│   ├── tool/                 # Tool implementations
│   │   ├── base.py           # Base tool abstract class
│   │   ├── browser_use_tool.py # Web browsing capabilities
│   │   ├── file_saver.py     # File manipulation
│   │   ├── google_search.py  # Web search functionality
│   │   ├── python_execute.py # Python code execution
│   │   └── str_replace_editor.py # String replacement tool
│   ├── compat.py             # Python version compatibility
│   ├── config.py             # Configuration settings
│   ├── exceptions.py         # Custom exceptions
│   ├── httpx_helper.py       # Helper for httpx client management
│   ├── llm.py                # Language model interface (multi-provider)
│   ├── logger.py             # Logging configuration
│   └── schema.py             # Data models and schemas
├── static/                   # Frontend assets
│   ├── js/                   # JavaScript files
│   │   └── app.js            # Main frontend application
│   ├── css/                  # Stylesheets
│   └── index.html            # Main HTML page
├── config/                   # Configuration directory
│   └── config.example.toml   # Example configuration with multi-provider support
├── main.py                   # Main application entry point
├── run_web.py                # Convenience script to start the web server
├── web.py                    # Extended web interface with more features
└── app.py                    # Simplified application version
```

## 4. Core Components

### 4.1 Agents

Agents are the central components that drive the system's intelligence:

- **BaseAgent**: Abstract base class defining the core agent interface and execution loop.
- **ReActAgent**: Implements the ReAct (Reasoning + Acting) pattern for step-by-step problem-solving.
- **ToolCallAgent**: Extends ReActAgent with the ability to call external tools.
- **Manus**: The main agent implementation with a comprehensive set of tools for general tasks.

### 4.2 Language Model Interface

The `LLM` class in `app/llm.py` provides a unified interface to multiple language model providers:

- **Multiple Provider Support**:
  - OpenAI (GPT models)
  - Anthropic (Claude models)
  - Azure OpenAI (hosted GPT models)
  - Google (Gemini models) - coming soon
  - Meta (Llama models) - coming soon

- **Features**:
  - Automatic provider detection based on model name
  - Provider-specific client creation and API handling
  - Unified interface for sending prompts and receiving responses
  - Error handling with specific error messages for authentication issues
  - Support for both synchronous and asynchronous operations

### 4.3 Tools

Tools extend the agent's capabilities beyond text generation:

- **BaseTool**: Abstract base class for all tools
- **BrowserUseTool**: Enables web browsing and screenshot capabilities
- **GoogleSearch**: Performs web searches
- **PythonExecute**: Executes Python code
- **FileSaver**: Manages file operations
- **Terminate**: Allows the agent to end execution

### 4.4 Memory System

The `Memory` class in `app/schema.py` handles conversation history:

- Stores messages with their roles (user, system, assistant, tool)
- Manages conversation context window limits
- Provides methods for manipulating and converting messages

### 4.5 Compatibility and Error Handling

The system includes several enhancements for reliability and compatibility:

- **Python Compatibility**: The `compat.py` module provides compatibility for Python 3.10+ by handling moved abstract base classes
- **HTTP Client Management**: The `httpx_helper.py` module ensures proper lifecycle management of HTTP clients
- **Error Handling**: Comprehensive error handling for API authentication, rate limits, and other common issues
- **Asyncio Task Management**: Improved management of asynchronous tasks with cleanup to prevent resource leaks

## 5. Data Flow

### 5.1 Request Processing Flow

1. User submits a prompt through the web interface
2. The server creates a new task with a unique ID
3. The agent initializes and begins processing the prompt
4. Each step of the agent's execution is streamed to the frontend in real-time
5. The agent may use tools, ask questions, or provide reasoning
6. Finally, the agent provides a response and the task completes

### 5.2 Message Format

Server-sent events follow this structure:

```json
{
  "type": "message_type",  // info, log, error, success, question, reasoning, tool, tool_result
  "content": "message content",
  "timestamp": "ISO timestamp"
}
```

For tool execution, additional fields may be included:
```json
{
  "type": "tool_usage",
  "tool": "tool_name",
  "input": {/* tool parameters */},
  "content": "formatted message",
  "step": 3  // Step number
}
```

## 6. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Redirects to the web interface |
| `/execute` | POST | Starts a new agent task |
| `/stream/{task_id}` | GET | Streams task execution results (SSE) |
| `/stop/{task_id}` | POST | Stops a running task |
| `/browser_screenshot/{task_id}` | POST/GET | Manages browser screenshots |
| `/pause/{task_id}` | POST | Pauses task execution |
| `/resume/{task_id}` | POST | Resumes a paused task with user input |

## 7. Frontend Implementation

The frontend (in `static/js/app.js`) handles:

- User input form and API key management
- Connection to the event stream for real-time updates
- Rendering different message types (questions, reasoning, tool usage)
- Browser view integration for web browsing capabilities
- Conversation export options (PDF, Markdown, HTML)
- Responsive UI for different device sizes

## 8. Configuration System

OpenManus uses a flexible configuration system:

- **TOML Configuration**: Configuration settings are stored in TOML format
- **Multi-Provider Support**: Configure multiple LLM providers simultaneously
- **Provider Detection**: Automatic detection of the appropriate provider based on model name
- **Default Settings**: Sensible defaults with the ability to override for specific use cases

Example configuration:

```toml
# Global LLM configuration (default provider)
[llm]
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
api_key = "sk-..."  # Your OpenAI API key
max_tokens = 4096
temperature = 0.0

# Anthropic provider configuration
[llm.anthropic]
model = "claude-3-5-sonnet"
api_type = "anthropic"
base_url = "https://api.anthropic.com"
api_key = "sk-ant-..."  # Your Anthropic API key
max_tokens = 4096
temperature = 0.0
```

## 9. Agent Execution Loop

The agent execution follows this pattern:

1. Initialize agent with the user prompt
2. For each step (up to max_steps):
   - Generate the next action using the LLM
   - If the action is to respond, return the response and terminate
   - If the action is to ask a question, wait for user input
   - Otherwise, execute a tool with the provided parameters
   - Add the tool result to the conversation history
3. Return a structured result containing summaries and details

## 10. Getting Started

### Prerequisites

- Python 3.8+ (recommended)
- API keys for language models (if using external providers)

### Installation

1. Clone the repository
2. Create a virtual environment: `python -m venv .venv`
3. Activate the environment:
   - Windows: `.venv\Scripts\activate`
   - Unix/macOS: `source .venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`

### Running the Application

```bash
python run_web.py
```

Then navigate to http://localhost:8080 in your browser.

## 11. Extension Points

### Adding New Tools

Create a new class that inherits from `BaseTool` in `app/tool/base.py`:

```python
from app.tool.base import BaseTool

class MyNewTool(BaseTool):
    name: str = "my_new_tool"
    description: str = "Description of what my tool does"
    
    async def execute(self, **params):
        # Implement tool functionality
        return result
```

Then add your tool to the Manus agent's available tools.

### Adding a New Provider

To add support for a new LLM provider:

1. Update the `get_provider_from_model` function in `app/config.py`
2. Add the base URL in `get_base_url_for_provider`
3. Modify the `_create_client` and `ask` methods in the `LLM` class to handle the new provider

### Custom Agents

Extend one of the base agent classes to create your own specialized agent:

```python
from app.agent.toolcall import ToolCallAgent

class MySpecialAgent(ToolCallAgent):
    name: str = "MyAgent"
    system_prompt: str = "Custom system prompt for specialized tasks"
    
    # Override methods as needed
```

## 12. Recent Improvements

### Python 3.10+ Compatibility
- Added compatibility layer for collections abstract base classes moved in Python 3.10+
- Applied patches for MutableMapping, MutableSet, and other ABCs

### Multi-Provider Support
- Added support for multiple LLM providers (OpenAI, Anthropic, Azure)
- Implemented automatic provider detection based on model name
- Added provider-specific API handling

### HTTP Client Management
- Created httpx_helper module for proper httpx client lifecycle management
- Added context managers for safe client usage
- Implemented cleanup functions to prevent client resource leaks

### Error Handling
- Improved API authentication error handling with clear error messages
- Enhanced thread and asyncio task management
- Added proper cleanup for all resources on application shutdown

### Configuration
- Updated configuration system to support multiple providers
- Enhanced documentation with provider-specific examples
- Added validation for API keys and configuration parameters

## 13. Known Issues and Limitations

- Browser screenshots may not work in all environments, particularly in headless mode.
- Language model responses may vary depending on the provider and model used.
- Meta AI and Google AI providers are not fully implemented yet.
- API keys must be provided in the correct format for each provider.

---

This documentation provides an overview of the OpenManus platform. For more detailed information on specific components, refer to the code comments and docstrings within each module. 