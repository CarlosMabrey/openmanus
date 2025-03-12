English | [中文](README_zh.md)

[![GitHub stars](https://img.shields.io/github/stars/mannaandpoem/OpenManus?style=social)](https://github.com/mannaandpoem/OpenManus/stargazers)
&ensp;
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT) &ensp;
[![Discord Follow](https://dcbadge.vercel.app/api/server/DYn29wFk9z?style=flat)](https://discord.gg/DYn29wFk9z)

# OpenManus: AI Agent Platform

![OpenManus Logo](assets/logo.png)

OpenManus is a versatile AI agent platform that provides a framework for building, deploying, and interacting with AI agents capable of solving complex tasks. The platform combines language model capabilities with a rich set of tools, allowing agents to browse the web, execute Python code, search Google, save files, and more.

## 🌟 Features

- **Multi-Provider Support**: Works with OpenAI, Anthropic, Azure, and more
- **Powerful Tools**: Web browsing, Google Search, Python code execution, file operations
- **Real-Time Interface**: Server-Sent Events for live streaming of agent progress
- **Robust Error Handling**: Comprehensive error handling for API issues and rate limits
- **Extensible Design**: Easy to add new tools and agent capabilities
- **Compatibility**: Works with Python 3.8+ including fixes for Python 3.10+

## 📋 Requirements

- Python 3.8+ (recommended 3.10+)
- API keys for language model providers (OpenAI, Anthropic, etc.)

## 🚀 Quick Start

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/OpenManus.git
   cd OpenManus
   ```

2. Create and activate a virtual environment:
   ```bash
   # Windows
   python -m venv .venv
   .venv\Scripts\activate

   # macOS/Linux
   python -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure your API keys:
   - Create a file at `config/config.toml` based on the example below
   - Or set environment variables like `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.

### Configuration

Create a `config/config.toml` file with your API keys:

```toml
# Global LLM configuration (default provider)
[llm.default]
model = "gpt-4o"
api_type = "openai"
api_key = "your_openai_api_key"
max_tokens = 4096
temperature = 0.7

# Anthropic provider configuration
[llm.anthropic]
model = "claude-3-5-sonnet"
api_type = "anthropic"
api_key = "your_anthropic_api_key"
```

### Running the Application

Start the web server:

```bash
python run_web.py
```

Then open your browser to [http://localhost:8080](http://localhost:8080)

## 🧩 Project Structure

```
OpenManus/
├── app/                      # Core application code
│   ├── agent/                # Agent implementations
│   ├── prompt/               # Prompt templates
│   ├── tool/                 # Tool implementations
│   ├── compat.py             # Python version compatibility
│   ├── config.py             # Configuration settings
│   ├── httpx_helper.py       # HTTP client management
│   ├── llm.py                # Language model interface
│   └── schema.py             # Data models and schemas
├── static/                   # Frontend assets
├── config/                   # Configuration files
├── main.py                   # Main application entry point
└── run_web.py                # Convenience script to start the web server
```

## 🔧 Key Components

### Agents

Agents are the central components that drive the system's intelligence:

- **BaseAgent**: Abstract base class defining the core agent interface and execution loop
- **ReActAgent**: Implements the ReAct (Reasoning + Acting) pattern for step-by-step problem-solving
- **ToolCallAgent**: Extends ReActAgent with the ability to call external tools
- **Manus**: The main agent implementation with a comprehensive set of tools for general tasks

### Language Model Interface

The `LLM` class in `app/llm.py` provides a unified interface to language models:

- Supports different providers (OpenAI, Azure, Anthropic)
- Handles authentication, retries, and error management
- Provides both synchronous and asynchronous methods for generating text

### Tools

Tools extend the agent's capabilities beyond text generation:

- **BaseTool**: Abstract base class for all tools
- **BrowserUseTool**: Enables web browsing and screenshot capabilities
- **GoogleSearch**: Performs web searches
- **PythonExecute**: Executes Python code
- **FileSaver**: Manages file operations

## 🛠️ Recent Improvements

- **Enhanced Error Handling**: Better error detection, reporting, and recovery
- **Multi-Provider Support**: Seamless switching between different LLM providers
- **Robust HTTP Client Management**: Proper lifecycle management for HTTP clients
- **Python 3.10+ Compatibility**: Fixed collections ABC compatibility issues
- **Dynamic Port Management**: Automatic detection of free ports to prevent conflicts
- **Improved Configuration**: Environment variable fallbacks and better validation
- **Comprehensive Logging**: Better logging for debugging and monitoring

## 🧪 Development

### Adding a New Tool

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

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Project Demo

<video src="https://private-user-images.githubusercontent.com/61239030/420168772-6dcfd0d2-9142-45d9-b74e-d10aa75073c6.mp4?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDEzMTgwNTksIm5iZiI6MTc0MTMxNzc1OSwicGF0aCI6Ii82MTIzOTAzMC80MjAxNjg3NzItNmRjZmQwZDItOTE0Mi00NWQ5LWI3NGUtZDEwYWE3NTA3M2M2Lm1wND9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTAzMDclMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwMzA3VDAzMjIzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTdiZjFkNjlmYWNjMmEzOTliM2Y3M2VlYjgyNDRlZDJmOWE3NWZhZjE1MzhiZWY4YmQ3NjdkNTYwYTU5ZDA2MzYmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.UuHQCgWYkh0OQq9qsUWqGsUbhG3i9jcZDAMeHjLt5T4" data-canonical-src="https://private-user-images.githubusercontent.com/61239030/420168772-6dcfd0d2-9142-45d9-b74e-d10aa75073c6.mp4?jwt=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NDEzMTgwNTksIm5iZiI6MTc0MTMxNzc1OSwicGF0aCI6Ii82MTIzOTAzMC80MjAxNjg3NzItNmRjZmQwZDItOTE0Mi00NWQ5LWI3NGUtZDEwYWE3NTA3M2M2Lm1wND9YLUFtei1BbGdvcml0aG09QVdTNC1ITUFDLVNIQTI1NiZYLUFtei1DcmVkZW50aWFsPUFLSUFWQ09EWUxTQTUzUFFLNFpBJTJGMjAyNTAzMDclMkZ1cy1lYXN0LTElMkZzMyUyRmF3czRfcmVxdWVzdCZYLUFtei1EYXRlPTIwMjUwMzA3VDAzMjIzOVomWC1BbXotRXhwaXJlcz0zMDAmWC1BbXotU2lnbmF0dXJlPTdiZjFkNjlmYWNjMmEzOTliM2Y3M2VlYjgyNDRlZDJmOWE3NWZhZjE1MzhiZWY4YmQ3NjdkNTYwYTU5ZDA2MzYmWC1BbXotU2lnbmVkSGVhZGVycz1ob3N0In0.UuHQCgWYkh0OQq9qsUWqGsUbhG3i9jcZDAMeHjLt5T4" controls="controls" muted="muted" class="d-block rounded-bottom-2 border-top width-fit" style="max-height:640px; min-height: 200px"></video>

## Installation

We provide two installation methods. Method 2 (using uv) is recommended for faster installation and better dependency management.

### Method 1: Using conda

1. Create a new conda environment:

```bash
conda create -n open_manus python=3.12
conda activate open_manus
```

2. Clone the repository:

```bash
git clone https://github.com/mannaandpoem/OpenManus.git
cd OpenManus
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

### Method 2: Using uv (Recommended)

1. Install uv (A fast Python package installer and resolver):

**For Unix/macOS:**
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

**For Windows:**
```powershell
# Download the latest release from GitHub
irm https://astral.sh/uv/install.ps1 | iex
```

2. Clone the repository:

```bash
git clone https://github.com/mannaandpoem/OpenManus.git
cd OpenManus
```

3. Create a new virtual environment and activate it:

**For Unix/macOS:**
```bash
uv venv
source .venv/bin/activate
```

**For Windows:**
```powershell
uv venv
.venv\Scripts\activate
```

4. Install dependencies:

```bash
uv pip install -r requirements.txt
```

## Configuration

OpenManus requires configuration for the LLM APIs it uses. Follow these steps to set up your configuration:

1. Create a `config.toml` file in the `config` directory (you can copy from the example):

```bash
cp config/config.example.toml config/config.toml
```

2. Edit `config/config.toml` to add your API keys and customize settings:

```toml
# Global LLM configuration
[llm]
model = "gpt-4o"
base_url = "https://api.openai.com/v1"
api_key = "sk-..."  # Replace with your actual API key
max_tokens = 4096
temperature = 0.0

# Optional configuration for specific LLM providers
[llm.anthropic]
model = "claude-3-5-sonnet"
base_url = "https://api.anthropic.com"
api_key = "sk-ant-..."  # Replace with your Anthropic API key
max_tokens = 4096
temperature = 0.0

[llm.azure]
model = "gpt-4o"
api_type = "azure"
base_url = "https://YOUR_AZURE_ENDPOINT.openai.azure.com"
api_key = "..."  # Your Azure OpenAI API key
api_version = "2023-07-01"
```

### Supported LLM Providers

OpenManus now supports multiple LLM providers:

1. **OpenAI** - Models like `gpt-4o`, `gpt-4-turbo`, etc. (API keys start with `sk-...`)
2. **Anthropic** - Claude models like `claude-3-5-sonnet`, `claude-3-opus`, etc. (API keys start with `sk-ant-...`)
3. **Azure OpenAI** - Azure-hosted OpenAI models (requires Azure endpoint)
4. **Google** - Gemini models like `gemini-pro` (support coming soon)
5. **Meta** - Llama models like `llama-3-70b-instruct` (support coming soon)

The system will automatically detect which provider to use based on the model name prefix, but you can also explicitly set the `api_type` parameter to specify the provider.

## Quick Start

One line for run OpenManus:

```bash
python main.py
```

Then input your idea via terminal!

For unstable version, you also can run:

```bash
python run_flow.py
```

## How to contribute

We welcome any friendly suggestions and helpful contributions! Just create issues or submit pull requests.

Or contact @mannaandpoem via 📧email: mannaandpoem@gmail.com

## Community Group
Join our networking group on Feishu and share your experience with other developers!

<div align="center" style="display: flex; gap: 20px;">
    <img src="assets/community_group.jpg" alt="OpenManus 交流群" width="300" />
</div>

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=mannaandpoem/OpenManus&type=Date)](https://star-history.com/#mannaandpoem/OpenManus&Date)

## Acknowledgement

Thanks to [anthropic-computer-use](https://github.com/anthropics/anthropic-quickstarts/tree/main/computer-use-demo)
and [browser-use](https://github.com/browser-use/browser-use) for providing basic support for this project!

Additionally, we are grateful to [AAAJ](https://github.com/metauto-ai/agent-as-a-judge), [MetaGPT](https://github.com/geekan/MetaGPT) and [OpenHands](https://github.com/All-Hands-AI/OpenHands).

OpenManus is built by contributors from MetaGPT. Huge thanks to this agent community!

## Cite
```bibtex
@misc{openmanus2025,
  author = {Xinbin Liang and Jinyu Xiang and Zhaoyang Yu and Jiayi Zhang and Sirui Hong},
  title = {OpenManus: An open-source framework for building general AI agents},
  year = {2025},
  publisher = {GitHub},
  journal = {GitHub repository},
  howpublished = {\url{https://github.com/mannaandpoem/OpenManus}},
}
```
