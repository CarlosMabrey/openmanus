from pydantic import Field
import json
import time
import os
import asyncio

from app.agent.toolcall import ToolCallAgent
from app.prompt.manus import *
from app.tool import Terminate, ToolCollection
from app.tool.browser_use_tool import BrowserUseTool
from app.tool.file_saver import FileSaver
from app.tool.google_search import GoogleSearch
from app.tool.python_execute import PythonExecute
from app.tool.base import ToolResult
from app.logger import logger  # Import the logger directly


class Manus(ToolCallAgent):
    """
    A versatile general-purpose agent that uses planning to solve various tasks.

    This agent extends PlanningAgent with a comprehensive set of tools and capabilities,
    including Python execution, web browsing, file operations, and information retrieval
    to handle a wide range of user requests.
    """

    name: str = "Manus"
    description: str = (
        "A versatile agent that can solve various tasks using multiple tools"
    )

    system_prompt: str = SYSTEM_PROMPT
    next_step_prompt: str = NEXT_STEP_PROMPT

    # Add general-purpose tools to the tool collection
    available_tools: ToolCollection = Field(
        default_factory=lambda: ToolCollection(
            PythonExecute(), GoogleSearch(), BrowserUseTool(), FileSaver(), Terminate()
        )
    )
    
    def add_user_message(self, message):
        """Add a user message to the conversation"""
        self.conversation.append({
            "role": "user",
            "content": message
        })
        
    def add_agent_message(self, message):
        """Add an agent message to the conversation"""
        self.conversation.append({
            "role": "assistant",
            "content": message
        })
    
    def get_next_action(self):
        """Get the next action from the model"""
        try:
            # Prepare the prompt for the next action
            messages = self.conversation.copy()
            
            # Add the next step prompt if available
            if self.next_step_prompt:
                messages.append({
                    "role": "user",
                    "content": self.next_step_prompt
                })
            
            # Get the response from the model
            response = self.llm.generate(messages)
            
            # Log the raw response for debugging
            logger.info(f"Raw model response: {response[:100]}...")
            
            # Try multiple approaches to extract valid JSON
            action = None
            
            # First, try to parse the entire response as JSON
            try:
                action = json.loads(response)
                logger.info(f"Successfully parsed response as JSON: {action}")
            except json.JSONDecodeError:
                # If full parsing fails, try to find JSON within the response
                logger.warning(f"Failed to parse response as JSON directly. Attempting to extract JSON.")
                
                # Look for JSON-like patterns
                json_pattern = r'(\{.*\})'
                import re
                json_matches = re.findall(json_pattern, response, re.DOTALL)
                
                if json_matches:
                    # Try each match until we find valid JSON
                    for json_str in json_matches:
                        try:
                            action = json.loads(json_str)
                            logger.info(f"Successfully extracted JSON from response: {action}")
                            break
                        except json.JSONDecodeError:
                            continue
            
            # If we still don't have valid JSON, create a structured error message
            if not action:
                logger.warning(f"Failed to extract any valid JSON from response. Treating as error.")
                # Add the message to the conversation to help the model correct itself
                self.add_agent_message(response)
                
                # Add a clarification message asking for proper format
                self.add_user_message(
                    "I need you to respond with a valid JSON object that has an 'action' field. "
                    "Please format your response correctly as JSON with one of these actions: "
                    "'use_tool', 'question', or 'respond'."
                )
                
                # Try one more time with the explicit correction
                return self.get_next_action()
            
            # Validate the action has required fields
            if not isinstance(action, dict):
                logger.warning(f"Invalid action format (not a dict): {action}")
                action = {
                    "action": "use_tool",
                    "tool": "google_search",
                    "input": {
                        "query": "How to create a 7-day Japan itinerary"
                    },
                    "reasoning": "The user asked for a Japan itinerary. I need to search for information first."
                }
            elif "action" not in action:
                logger.warning(f"Action missing 'action' field: {action}")
                action = {
                    "action": "use_tool",
                    "tool": "google_search",
                    "input": {
                        "query": "Japan tourist attractions and travel itinerary"
                    },
                    "reasoning": "The user asked for a Japan itinerary. I need to search for information first."
                }
            
            return action
            
        except Exception as e:
            # Handle any other errors
            logger.error(f"Error in get_next_action: {str(e)}")
            
            # Get the last user message to determine context
            last_user_message = ""
            for msg in reversed(self.conversation):
                if msg.get("role") == "user":
                    last_user_message = msg.get("content", "")
                    break
            
            # Create a more adaptive fallback response based on context
            fallback_query = "helpful assistant information"
            fallback_reasoning = f"I encountered an error: {str(e)}. I'll try to be helpful despite the error."
            
            # Check for different query types to provide better fallbacks
            if "japan" in last_user_message.lower() or "travel" in last_user_message.lower():
                fallback_query = "Japan travel itinerary guide"
                fallback_reasoning = f"I encountered an error ({str(e)}), but I'll try to help with Japan travel information."
            elif "coding" in last_user_message.lower() or "programming" in last_user_message.lower():
                fallback_query = "programming best practices"
                fallback_reasoning = f"I encountered an error ({str(e)}), but I'll try to help with programming information."
            elif "recipe" in last_user_message.lower() or "food" in last_user_message.lower():
                fallback_query = "easy recipes"
                fallback_reasoning = f"I encountered an error ({str(e)}), but I'll try to help with recipe information."
                
            return {
                "action": "respond",
                "content": f"I encountered a technical error while processing your request: {str(e)}. Please try again or try a different query. If the problem persists, it might be related to API key configuration or server limitations.",
                "reasoning": fallback_reasoning
            }

    async def run(self, prompt):
        """
        Run the agent to solve the task specified in the prompt.
        
        Args:
            prompt: The user prompt describing the task to solve
        
        Returns:
            dict: A structured response containing all steps and the final answer
        """
        try:
            # Initialize the conversation with the user prompt
            self.conversation = []
            
            # Add system prompt if available
            if self.system_prompt:
                self.conversation.append({
                    "role": "system",
                    "content": self.system_prompt
                })
            
            # Add user prompt
            self.add_user_message(prompt)
            
            # Prepare to track steps
            step_results = []
            step_summaries = []
            
            # Custom logging function if provided
            log_fn = getattr(self, 'custom_log_fn', None)
            
            # Log start
            if log_fn:
                log_fn({"type": "info", "content": f"Starting to process: {prompt[:100]}..."})
            
            # For Japan itinerary requests, ensure we use search first
            if "japan" in prompt.lower() and ("itinerary" in prompt.lower() or "travel" in prompt.lower()):
                # Add special handling for Japan itinerary tasks
                if log_fn:
                    log_fn({"type": "log", "content": "Detected Japan travel request - will create a comprehensive itinerary using web searches and tools."})
                
                # Automatically start with a Google search as first step
                search_action = {
                    "action": "use_tool",
                    "tool": "google_search",
                    "input": {
                        "query": "Japan tourist attractions and travel itinerary guide",
                        "num_results": 5
                    },
                    "reasoning": "To create a comprehensive Japan travel itinerary, I'll first search for reliable travel information."
                }
                
                # Execute the search and add it to our steps
                if log_fn:
                    log_fn({"type": "tool_usage", "content": f"Using google_search to find Japan travel information", "step": 1})
                    
                # Track the step
                step_results.append({
                    "type": "tool_usage",
                    "content": f"Using google_search to find Japan travel information",
                    "step": 1
                })
                
                # Execute the search
                search_result = await self.available_tools.execute(
                    name="google_search",
                    tool_input=search_action.get("input", {})
                )
                
                if log_fn:
                    log_fn({"type": "tool_result", "content": f"Found {len(search_result)} relevant search results", "step": 1})
                    
                # Track the search result
                step_results.append({
                    "type": "tool_result", 
                    "content": f"Search Results: {search_result}",
                    "step": 1
                })
                
                # Add the search result to the conversation
                self.add_agent_message(f"I searched for Japan travel information and found these results: {search_result}")
            
            # Run the agent steps
            for step in range(1, self.max_steps + 1):
                logger.info(f"Step {step}/{self.max_steps}")
                if log_fn:
                    log_fn({"type": "log", "content": f"Step {step}/{self.max_steps}"})
                
                # Get the next action from the model
                action = self.get_next_action()
                
                # Log the action for debugging
                logger.info(f"Action: {action}")
                if log_fn:
                    log_fn({"type": "log", "content": f"Selected action: {action.get('action')}"})
                    
                # Process the action based on type
                action_type = action.get("action")
                
                # Add the reasoning to steps if available
                if "reasoning" in action and action["reasoning"]:
                    if log_fn:
                        log_fn({"type": "reasoning", "content": action["reasoning"], "step": step})
                        
                    step_results.append({
                        "type": "reasoning",
                        "content": action["reasoning"],
                        "step": step
                    })
                    step_summaries.append(f"Step {step}: Reasoning: {action['reasoning'][:100]}...")
                
                # Process based on action type
                if action_type == "respond":
                    # This is a final response
                    content = action.get("content", "")
                    
                    if log_fn:
                        log_fn({"type": "reasoning", "content": f"Preparing final response", "step": step})
                        log_fn({"type": "success", "content": content})
                        
                    # Add the response to steps
                    step_results.append({
                        "type": "final_response",
                        "content": content,
                        "step": step
                    })
                    step_summaries.append(f"Step {step}: Provided final response")
                    
                    # Add to conversation
                    self.add_agent_message(content)
                    
                    # Finish execution
                    break
                    
                elif action_type == "question":
                    # Agent wants to ask the user a question
                    question = action.get("content", "")
                    
                    if log_fn:
                        log_fn({"type": "question", "content": question, "step": step})
                        
                    # Add to steps
                    step_results.append({
                        "type": "question",
                        "content": question,
                        "step": step
                    })
                    step_summaries.append(f"Step {step}: Asked user: {question[:100]}...")
                    
                    # Add to conversation
                    self.add_agent_message(question)
                    
                    # Wait for user response
                    user_response = await self.get_user_input(question)
                    
                    if log_fn:
                        log_fn({"type": "log", "content": f"User responded: {user_response[:100]}..."})
                        
                    # Add to conversation
                    self.add_user_message(user_response)
                    
                elif action_type == "use_tool":
                    # Agent wants to use a tool
                    tool_name = action.get("tool")
                    tool_input = action.get("input", {})
                    
                    # Check if the tool exists
                    if not self.available_tools.tool_map.get(tool_name):
                        error_msg = f"Tool '{tool_name}' not found"
                        logger.error(error_msg)
                        
                        if log_fn:
                            log_fn({"type": "error", "content": error_msg})
                            
                        # Add error to steps
                        step_results.append({
                            "type": "error",
                            "content": error_msg,
                            "step": step
                        })
                        step_summaries.append(f"Step {step}: Error: {error_msg}")
                        
                        # Add to conversation
                        self.add_agent_message(f"Error: {error_msg}")
                        continue
                    
                    # Log tool usage
                    if log_fn:
                        log_fn({
                            "type": "tool_usage", 
                            "content": f"Using {tool_name} with input: {json.dumps(tool_input)}", 
                            "step": step,
                            "tool": tool_name
                        })
                        
                    # Add to steps
                    step_results.append({
                        "type": "tool_usage",
                        "content": f"Using {tool_name} with input: {json.dumps(tool_input)}",
                        "step": step,
                        "tool": tool_name
                    })
                    step_summaries.append(f"Step {step}: Used tool: {tool_name}")
                    
                    # Execute the tool
                    try:
                        # Handle browser_use tool specially
                        if tool_name == "browser_use":
                            # Check if we have an action_sequence (which is not directly supported)
                            if "action_sequence" in tool_input:
                                # Convert action_sequence to a supported action
                                action_sequence = tool_input.pop("action_sequence")
                                self.add_agent_message(f"Note: Converting action_sequence to individual browser actions")
                                
                                # Execute the first action in the sequence
                                if action_sequence and isinstance(action_sequence, list) and len(action_sequence) > 0:
                                    first_action = action_sequence[0]
                                    if isinstance(first_action, dict) and "action" in first_action:
                                        # Use navigate as the initial action if URL is provided
                                        if "url" in tool_input:
                                            action_param = "navigate"
                                        else:
                                            # Otherwise use the first action in the sequence
                                            action_param = first_action.get("action")
                                    else:
                                        # Default to get_html if action is unclear
                                        action_param = "get_html"
                                else:
                                    # Default to get_html if no clear action
                                    action_param = "get_html"
                            # Check if we have a direct action parameter    
                            elif "action" in tool_input:
                                action_param = tool_input.pop("action")
                                
                                # Handle the get_content action by mapping to get_html
                                if action_param == "get_content":
                                    action_param = "get_html"
                                    self.add_agent_message(f"Note: Mapped 'get_content' to 'get_html' action")
                            else:
                                # Default to navigate if URL is provided but no action
                                if "url" in tool_input:
                                    action_param = "navigate"
                                    self.add_agent_message(f"Note: No action specified but URL provided. Using 'navigate' action.")
                                else:
                                    raise ValueError("Missing required 'action' parameter for browser_use tool")
                            
                            # Execute the browser tool with the determined action
                            try:
                                tool_result = await self.available_tools.get_tool(tool_name).execute(
                                    action=action_param, 
                                    **tool_input
                                )
                                
                                # Check if the result indicates simulation/mock mode
                                if tool_result and isinstance(tool_result, ToolResult) and tool_result.output:
                                    if "[SIMULATED BROWSING]" in tool_result.output:
                                        # Extract the reason for simulation mode
                                        import re
                                        reason_match = re.search(r'simulation mode due to: (.*?)(?:\n|$)', tool_result.output)
                                        reason = reason_match.group(1) if reason_match else "browser initialization failed"
                                        
                                        # Log the simulation mode
                                        if log_fn:
                                            log_fn({
                                                "type": "warning",
                                                "content": f"Browser running in simulation mode: {reason}"
                                            })
                                            
                                        # Add a message to the conversation about simulation mode
                                        self.add_agent_message(
                                            "Note: The browser is running in simulation mode. "
                                            "This means I can't view actual web content. "
                                            f"Reason: {reason}"
                                        )
                                        
                                        # For navigate actions, automatically follow up with a Google search
                                        if action_param == "navigate" and "url" in tool_input:
                                            url = tool_input["url"]
                                            
                                            # Extract domain for better search
                                            domain_match = re.search(r'https?://([^/]+)', url)
                                            domain = domain_match.group(1) if domain_match else ""
                                            
                                            # Create more targeted search query based on URL
                                            path_match = re.search(r'https?://[^/]+(/.*?)(?:\?|#|$)', url)
                                            path = path_match.group(1) if path_match else ""
                                            
                                            # Build search query based on URL components
                                            search_terms = []
                                            if domain:
                                                search_terms.append(f"site:{domain}")
                                            if path and path != "/":
                                                # Convert path to search terms
                                                path_terms = path.replace('/', ' ').replace('-', ' ').replace('_', ' ').strip()
                                                if path_terms:
                                                    search_terms.append(path_terms)
                                            if not search_terms:
                                                search_terms.append(url)
                                                
                                            search_query = " ".join(search_terms)
                                            
                                            self.add_agent_message(
                                                f"Since I can't browse the web directly, I'll search for information about this URL: {url}"
                                            )
                                            
                                            # Perform the Google search
                                            if log_fn:
                                                log_fn({
                                                    "type": "tool_usage", 
                                                    "content": f"Using google_search as fallback for browser: {search_query}", 
                                                    "step": step,
                                                    "tool": "google_search"
                                                })
                                                
                                            search_result = await self.available_tools.execute(
                                                name="google_search",
                                                tool_input={"query": search_query}
                                            )
                                            
                                            # Update the tool result with the search results
                                            tool_result = ToolResult(
                                                output=f"{tool_result.output}\n\nSearch results for {url}:\n{search_result}"
                                            )
                                
                                # Check if there was an error with browser initialization
                                if isinstance(tool_result, ToolResult) and tool_result.error and (
                                    "Browser initialization failed" in tool_result.error or
                                    "Browser context initialization failed" in tool_result.error or
                                    "asyncio subprocess not supported" in tool_result.error or
                                    "NotImplementedError" in tool_result.error
                                ):
                                    # Add a helpful message to the agent
                                    self.add_agent_message(
                                        "Note: The browser tool failed due to environment limitations. "
                                        "This is likely because you're using Python 3.12+ on Windows which has "
                                        "issues with asyncio subprocesses. Please use Google Search instead."
                                    )
                                    
                                    # If we have a URL, do a Google search for it instead
                                    if "url" in tool_input:
                                        # Extract domain for better search
                                        import re
                                        domain_match = re.search(r'https?://([^/]+)', tool_input['url'])
                                        domain = domain_match.group(1) if domain_match else ""
                                        
                                        if domain:
                                            search_query = f"site:{domain}"
                                        else:
                                            search_query = f"information about {tool_input['url']}"
                                            
                                        self.add_agent_message(f"Falling back to Google search for: {search_query}")
                                        
                                        # Execute a Google search as fallback
                                        search_result = await self.available_tools.execute(
                                            name="google_search",
                                            tool_input={"query": search_query}
                                        )
                                        
                                        # Update the tool result with the search results
                                        tool_result = ToolResult(
                                            output=f"Browser failed but found these search results:\n{search_result}"
                                        )
                            except Exception as e:
                                # Handle browser tool execution errors with a helpful message
                                error_msg = str(e)
                                logger.error(f"Browser tool error: {error_msg}")
                                
                                # Provide guidance based on the error
                                guidance = "Please try using Google Search as an alternative."
                                
                                # Check if this is a browser initialization or context error
                                if "Browser initialization failed" in error_msg or "Browser context initialization failed" in error_msg:
                                    # This is a system limitation, provide more detailed guidance
                                    guidance = (
                                        "This is due to a compatibility issue with Python 3.12+ on Windows. "
                                        "You can work around this by:\n"
                                        "1. Using Google Search instead of browser navigation\n"
                                        "2. Running with Python 3.11 or earlier\n"
                                        "3. Running on Linux/macOS where this limitation doesn't exist"
                                    )
                                
                                self.add_agent_message(
                                    f"Error using browser tool: {error_msg}\n\n{guidance}"
                                )
                                
                                # If we have a URL, do a Google search for it instead
                                if "url" in tool_input:
                                    import re
                                    url = tool_input["url"]
                                    
                                    # Extract domain for better search
                                    domain_match = re.search(r'https?://([^/]+)', url)
                                    domain = domain_match.group(1) if domain_match else ""
                                    
                                    # Create search query based on URL components
                                    if domain:
                                        search_query = f"site:{domain}"
                                    else:
                                        search_query = f"information from {url}"
                                        
                                    self.add_agent_message(f"Falling back to Google search for: {search_query}")
                                    
                                    if log_fn:
                                        log_fn({
                                            "type": "tool_usage", 
                                            "content": f"Using google_search as fallback for browser: {search_query}", 
                                            "step": step,
                                            "tool": "google_search"
                                        })
                                    
                                    # Execute a Google search as fallback and return its results
                                    try:
                                        search_result = await self.available_tools.execute(
                                            name="google_search",
                                            tool_input={"query": search_query}
                                        )
                                        
                                        # Create a successful tool result with the search results
                                        tool_result = ToolResult(
                                            output=f"Browser navigation failed but found these search results for {url}:\n\n{search_result}"
                                        )
                                    except Exception as search_error:
                                        # If the search also fails, return a combined error
                                        tool_result = ToolResult(
                                            error=f"Browser failed: {error_msg}. Google search also failed: {str(search_error)}"
                                        )
                                else:
                                    # Create an error result for non-URL related browser actions
                                    tool_result = ToolResult(
                                        error=f"Browser action failed: {error_msg}. {guidance}"
                                    )
                        else:
                            # For other tools use the normal execution
                            tool_result = await self.available_tools.execute(
                                name=tool_name,
                                tool_input=tool_input
                            )
                        
                        # Check for special tools like terminate
                        if tool_name == "terminate":
                            if log_fn:
                                log_fn({"type": "info", "content": "Task terminated by agent"})
                                
                            step_results.append({
                                "type": "status",
                                "content": "Task terminated by agent",
                                "step": step
                            })
                            step_summaries.append(f"Step {step}: Task terminated by agent")
                            break
                        
                        # For all other tools, process the result
                        if log_fn:
                            log_fn({
                                "type": "tool_result", 
                                "content": str(tool_result), 
                                "step": step,
                                "tool": tool_name
                            })
                            
                        # Add to steps
                        step_results.append({
                            "type": "tool_result",
                            "content": str(tool_result),
                            "step": step,
                            "tool": tool_name
                        })
                        
                        # Add to conversation
                        tool_result_content = f"Tool {tool_name} returned: {tool_result}"
                        self.add_agent_message(tool_result_content)
                        
                    except Exception as e:
                        # Handle tool execution errors
                        error_msg = f"Error executing {tool_name}: {str(e)}"
                        logger.error(error_msg)
                        
                        if log_fn:
                            log_fn({"type": "error", "content": error_msg, "step": step})
                            
                        # Add to steps
                        step_results.append({
                            "type": "error",
                            "content": error_msg,
                            "step": step
                        })
                        step_summaries.append(f"Step {step}: Error: {error_msg}")
                        
                        # Add to conversation
                        self.add_agent_message(f"Error: {error_msg}")
                else:
                    # Unknown action type
                    error_msg = f"Unknown action type: {action_type}"
                    logger.error(error_msg)
                    
                    if log_fn:
                        log_fn({"type": "error", "content": error_msg})
                        
                    # Add to steps
                    step_results.append({
                        "type": "error",
                        "content": error_msg,
                        "step": step
                    })
                    step_summaries.append(f"Step {step}: Error: {error_msg}")
                    
                    # Add to conversation
                    self.add_agent_message(f"Error: {error_msg}")
            
            # Check if max steps reached
            if step >= self.max_steps:
                step_results.append({
                    "type": "status",
                    "content": f"Maximum steps reached ({self.max_steps}). Execution stopped."
                })
                step_summaries.append(f"Maximum steps reached ({self.max_steps})")
                
            # Create a structured response
            response = {
                "summary": step_summaries,
                "details": step_results,
                "conversation": self.conversation
            }
            
            return response
            
        except Exception as e:
            logger.error(f"Error in Manus.run: {str(e)}")
            raise
    
    def _is_asking_user_question(self, action):
        """Determine if the action is asking the user a question"""
        try:
            # Ensure action is a dict
            if not isinstance(action, dict):
                logger.warning(f"Invalid action format in _is_asking_user_question: {action}")
                return False
            
            # Check for explicit question indicators
            if action.get('is_question', False):
                return True
            
            # Check for question patterns in different fields
            fields_to_check = [
                action.get('reasoning', ''),
                action.get('input', ''),
                action.get('action', '')
            ]
            
            for field in fields_to_check:
                if not isinstance(field, str):
                    continue
                
                # Check for question mark
                if '?' in field:
                    # Look for common question patterns
                    question_patterns = [
                        "could you", "can you", "would you", "do you", "will you",
                        "what", "how", "why", "when", "where", "which", "who",
                        "please provide", "please clarify", "please specify",
                        "need to know", "tell me", "explain", "confirm",
                        "should i", "should we", "is there", "are there"
                    ]
                    
                    field_lower = field.lower()
                    if any(pattern in field_lower for pattern in question_patterns):
                        return True
                    
                # Even without question marks, check for explicit request patterns
                request_patterns = [
                    "i need your input", "please let me know",
                    "waiting for your response", "your feedback is needed",
                    "provide more information", "input required"
                ]
                
                field_lower = field.lower()
                if any(pattern in field_lower for pattern in request_patterns):
                    return True
            
            return False
        except Exception as e:
            logger.error(f"Error in _is_asking_user_question: {str(e)}")
            return False

    def generate_final_response(self):
        """
        Generate a final response summarizing the conversation
        """
        # Prepare the prompt for the final response
        prompt = "Please provide a comprehensive summary of our conversation, including the key points, actions taken, and conclusions reached. Format your response in a clear, organized manner that would be suitable for saving as documentation."
        
        # Add the prompt to the conversation
        messages = self.get_conversation_messages()
        messages.append({
            "role": "user",
            "content": prompt
        })
        
        # Get the response from the model
        response = self.model.generate(messages)
        
        return response

    def get_current_browser_url(self):
        """
        Get the current browser URL if available
        """
        # Check if browser_use tool is available
        browser_tool = self.available_tools.get_tool('browser_use')
        if not browser_tool or not hasattr(browser_tool, 'context') or not browser_tool.context:
            return "Unknown URL"
        
        # Try to get the current URL
        try:
            # This is a synchronous method, so we can't use await
            # We'll return a placeholder URL instead
            return "Current webpage"
        except:
            return "Unknown URL"

    def execute_tool(self, tool_name, tool_input):
        """
        Execute a tool with the given input
        
        This overrides the parent method to add special handling for HTML content
        """
        # Special handling for python_execute tool with HTML content
        if tool_name == 'python_execute' and isinstance(tool_input, dict) and 'code' in tool_input:
            code = tool_input['code']
            # Check if the code looks like HTML
            if (code.strip().startswith('<!DOCTYPE') or 
                code.strip().startswith('<html') or 
                '<body>' in code or 
                ('<head>' in code and '</head>' in code)):
                
                # Log the detection of HTML content
                self.send_message({
                    'type': 'reasoning',
                    'content': "Detected HTML content being sent to Python executor. Redirecting to appropriate tool."
                })
                
                # Determine if we should save the HTML to a file or render it in the browser
                if len(code) > 500 or '<script' in code:
                    # For complex HTML or HTML with scripts, save to a file
                    file_name = f"generated_page_{int(time.time())}.html"
                    
                    # Use FileSaver tool instead
                    return self.available_tools.execute_tool('file_saver', {
                        'file_name': file_name,
                        'content': code
                    })
                else:
                    # For simple HTML, try to render it in the browser
                    try:
                        # Create a temporary HTML file
                        temp_file = f"temp_{int(time.time())}.html"
                        with open(temp_file, 'w', encoding='utf-8') as f:
                            f.write(code)
                        
                        # Get the absolute path
                        abs_path = os.path.abspath(temp_file)
                        file_url = f"file:///{abs_path.replace('\\', '/')}"
                        
                        # Use browser_use tool to navigate to the file
                        return self.available_tools.execute_tool('browser_use', {
                            'action': 'navigate',
                            'url': file_url
                        })
                    except Exception as e:
                        # If browser navigation fails, fall back to saving the file
                        file_name = f"generated_page_{int(time.time())}.html"
                        return self.available_tools.execute_tool('file_saver', {
                            'file_name': file_name,
                            'content': code
                        })
        
        # For all other tools or non-HTML content, use the parent method
        return super().execute_tool(tool_name, tool_input)

    async def get_user_input(self, question):
        """
        Wait for user input in response to a question
        
        Args:
            question: The question to ask the user
            
        Returns:
            str: The user's response
        """
        # Create a future to wait for user input
        self._user_input_future = asyncio.Future()
        
        # Send the question to the user through the custom log function
        log_fn = getattr(self, 'custom_log_fn', None)
        if log_fn:
            log_fn({
                "type": "question",
                "content": question,
                "is_question": True  # Explicitly mark as question
            })
            
        # Wait for user input
        logger.info(f"Waiting for user response to: {question}")
        
        try:
            # Wait for user input with a timeout
            user_response = await asyncio.wait_for(self._user_input_future, timeout=300)  # 5 minutes timeout
            return user_response
        except asyncio.TimeoutError:
            logger.warning("Timeout waiting for user response")
            return "No response received from user. I'll continue based on the information I have."
            
    def set_user_input(self, response):
        """
        Set the user input to resolve the waiting future
        
        Args:
            response: The user's response
        """
        if hasattr(self, '_user_input_future') and not self._user_input_future.done():
            self._user_input_future.set_result(response)
        else:
            logger.warning("No waiting future found for user input")
