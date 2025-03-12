# OpenManus: AI Agent Platform

OpenManus is a versatile AI agent platform that can solve complex tasks using multiple tools including web browsing, code execution, file management, and information retrieval.

## Features

- **Autonomous Agent**: Solve complex tasks through multi-step reasoning
- **Tool Integration**: Web browsing, code execution, Google search, file management
- **Multiple LLM Support**: Works with multiple language model providers:
  - OpenAI (GPT-4, GPT-3.5)
  - Anthropic (Claude)
  - More providers coming soon
- **Rate Limit Management**: Built-in token budget management to prevent API rate limits
- **Verbosity Control**: Adjust response detail level to balance between token usage and depth
- **Browser Integration**: See what the agent sees with browser screenshots
- **Interactive Interface**: Chat-like interface with rich formatting

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Set up your API keys:
   - For OpenAI: Set `OPENAI_API_KEY` in your environment variables
   - For Anthropic: Set `ANTHROPIC_API_KEY` in your environment variables
   - Or enter them directly in the web UI

## Usage

1. Start the server:
   ```
   python run_web.py
   ```
2. Open your browser at `http://localhost:8080`
3. Configure your model and enter your prompt
4. Use the verbosity control to manage token usage:
   - **Concise**: Minimal responses, fewer tokens
   - **Normal**: Balanced responses (default)
   - **Detailed**: Comprehensive explanations, more tokens

## Rate Limiting

OpenManus includes a token budget system to prevent hitting rate limits with providers like Anthropic:

- Automatically manages token consumption
- Applies exponential backoff for retries
- Adjusts response verbosity based on your settings

## Development

- The codebase is organized into modules for agents, tools, and UI
- Check out the DOCS directory for architecture details
- Contributions welcome!

## License

This project is licensed under the MIT License - see the LICENSE file for details. 