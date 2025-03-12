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
│   ├── config.py             # Configuration settings
│   ├── compat.py             # Python version compatibility
│   ├── exceptions.py         # Custom exceptions
│   ├── llm.py                # Language model interface
│   ├── logger.py             # Logging configuration
│   └── schema.py             # Data models and schemas
├── static/                   # Frontend assets
│   ├── js/                   # JavaScript files
│   │   └── app.js            # Main frontend application
│   ├── css/                  # Stylesheets
│   └── index.html            # Main HTML page
├── main.py                   # Main application entry point
├── web.py                    # Extended web interface with more features
├── app.py                    # Simplified application version
└── run_web.py                # Convenience script to start the web server
```

## 4. Core Components

### 4.1 Agents

Agents are the central components that drive the system's intelligence:

- **BaseAgent**: Abstract base class defining the core agent interface and execution loop.
- **ReActAgent**: Implements the ReAct (Reasoning + Acting) pattern for step-by-step problem-solving.
- **ToolCallAgent**: Extends ReActAgent with the ability to call external tools.
- **Manus**: The main agent implementation with a comprehensive set of tools for general tasks.

### 4.2 Language Model Interface

The `LLM` class in `app/llm.py` provides a unified interface to language models:

- Supports different providers (OpenAI, Azure)
- Handles authentication, retries, and error management
- Provides both synchronous and asynchronous methods for generating text

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

## 8. Agent Execution Loop

The agent execution follows this pattern:

1. Initialize agent with the user prompt
2. For each step (up to max_steps):
   - Generate the next action using the LLM
   - If the action is to respond, return the response and terminate
   - If the action is to ask a question, wait for user input
   - Otherwise, execute a tool with the provided parameters
   - Add the tool result to the conversation history
3. Return a structured result containing summaries and details

## 9. Getting Started

### Prerequisites

- Python 3.8+ (recommended)
- API keys for language models (if using external providers)

### Installation

1. Clone the repository
2. Create a virtual environment: `python -m venv .venv`
3. Activate the environment:
   - Windows: `.venv\Scripts\activate`
   - Unix/MacOS: `source .venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`

### Running the Application

```bash
python run_web.py
```

Then navigate to http://localhost:8080 in your browser.

## 10. Extension Points

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

### Custom Agents

Extend one of the base agent classes to create your own specialized agent:

```python
from app.agent.toolcall import ToolCallAgent

class MySpecialAgent(ToolCallAgent):
    name: str = "MyAgent"
    system_prompt: str = "Custom system prompt for specialized tasks"
    
    # Override methods as needed
```

## 11. Known Issues and Limitations

- Python version compatibility: The codebase has been updated to work with Python 3.10+, addressing issues with removed collections classes.
- Browser screenshots may not work in all environments, particularly in headless mode.
- Language model responses may vary depending on the provider and model used.

---

This documentation provides an overview of the OpenManus platform. For more detailed information on specific components, refer to the code comments and docstrings within each module.
