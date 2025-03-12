"""Collection classes for managing multiple tools."""
from typing import Any, Dict, List

from app.exceptions import ToolError
from app.tool.base import BaseTool, ToolFailure, ToolResult


class ToolCollection:
    """A collection of defined tools."""

    def __init__(self, *tools: BaseTool):
        self.tools = tools
        self.tool_map = {tool.name: tool for tool in tools}

    def __iter__(self):
        return iter(self.tools)

    def to_params(self) -> List[Dict[str, Any]]:
        return [tool.to_param() for tool in self.tools]

    async def execute(
        self, *, name: str, tool_input: Dict[str, Any] = None
    ) -> ToolResult:
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
        try:
            result = await tool(**tool_input)
            return result
        except ToolError as e:
            return ToolFailure(error=e.message)

    async def execute_all(self) -> List[ToolResult]:
        """Execute all tools in the collection sequentially."""
        results = []
        for tool in self.tools:
            try:
                result = await tool()
                results.append(result)
            except ToolError as e:
                results.append(ToolFailure(error=e.message))
        return results

    def get_tool(self, name: str) -> BaseTool:
        return self.tool_map.get(name)

    def add_tool(self, tool: BaseTool):
        self.tools += (tool,)
        self.tool_map[tool.name] = tool
        return self

    def add_tools(self, *tools: BaseTool):
        for tool in tools:
            self.add_tool(tool)
        return self

    async def execute_tool(self, name: str, tool_input: Dict[str, Any] = None) -> ToolResult:
        """Execute a tool with special handling for browser_use and other tools that need 
        parameters extracted in a specific way."""
        tool = self.tool_map.get(name)
        if not tool:
            return ToolFailure(error=f"Tool {name} is invalid")
            
        if tool_input is None:
            tool_input = {}
            
        try:
            # Special handling for browser_use tool
            if name == "browser_use":
                action_param = None
                
                # Handle action_sequence (convert to standard action)
                if "action_sequence" in tool_input:
                    action_sequence = tool_input.pop("action_sequence")
                    # Extract the first action if possible
                    if action_sequence and isinstance(action_sequence, list) and len(action_sequence) > 0:
                        first_action = action_sequence[0]
                        if isinstance(first_action, dict) and "action" in first_action:
                            action_param = first_action.get("action")
                    
                    # Default to get_html if no action found and URL is provided
                    if not action_param and "url" in tool_input:
                        action_param = "navigate"
                
                # Direct action parameter takes precedence
                if "action" in tool_input:
                    action_param = tool_input.pop("action")
                
                # If we still don't have an action but have a URL, use navigate
                if not action_param and "url" in tool_input:
                    action_param = "navigate"
                
                # Validate that we have an action
                if not action_param:
                    return ToolFailure(error="Missing required 'action' parameter for browser_use tool")
                
                # Handle aliases for actions
                if action_param == "get_content":
                    action_param = "get_html"
                
                # Execute the browser tool
                return await tool.execute(action=action_param, **tool_input)
            
            # For all other tools
            return await tool.execute(**tool_input)
        except ToolError as e:
            return ToolFailure(error=e.message)
        except Exception as e:
            return ToolFailure(error=str(e))
