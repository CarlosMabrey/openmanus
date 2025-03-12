from pydantic import Field
import json
import time
import os

from app.agent.toolcall import ToolCallAgent
from app.prompt.manus import *
from app.tool import Terminate, ToolCollection
from app.tool.browser_use_tool import BrowserUseTool
from app.tool.file_saver import FileSaver
from app.tool.google_search import GoogleSearch
from app.tool.python_execute import PythonExecute
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
            
            # Parse the response to extract the action
            try:
                # Try to parse as JSON
                action = json.loads(response)
                
                # Validate the action has required fields
                if not isinstance(action, dict):
                    logger.warning(f"Invalid action format (not a dict): {action}")
                    action = {
                        "action": "respond",
                        "content": f"I received an invalid response format. Here's what I got: {response}"
                    }
                elif "action" not in action:
                    logger.warning(f"Action missing 'action' field: {action}")
                    action = {
                        "action": "respond",
                        "content": f"I received a response without an action field. Here's what I got: {response}"
                    }
            except json.JSONDecodeError:
                # If not valid JSON, treat as a direct response
                logger.info(f"Non-JSON response treated as direct response: {response[:100]}...")
                action = {
                    "action": "respond",
                    "content": response
                }
            except Exception as e:
                # Handle any other parsing errors
                logger.error(f"Error parsing action: {str(e)}")
                action = {
                    "action": "respond",
                    "content": f"I encountered an error while processing the response: {str(e)}"
                }
            
            return action
        except Exception as e:
            # Handle any errors in the overall method
            logger.error(f"Error in get_next_action: {str(e)}")
            return {
                "action": "respond",
                "content": f"I encountered an error while getting the next action: {str(e)}"
            }

    async def run(self, prompt, user_response_queue=None):
        """
        Run the agent on the given prompt with support for user interaction
        """
        try:
            # Initialize the agent
            self.conversation = []
            step_results = []
            step_summaries = []
            last_action_type = None
            
            # Add the initial prompt
            self.add_user_message(prompt)
            
            # Execute up to max_steps
            for step in range(1, self.max_steps + 1):
                logger.info(f"Step {step}/{self.max_steps}")
                
                # Get the next action from the model
                action = self.get_next_action()
                
                # Set current action type for formatting
                current_action_type = "response" if action['action'] == 'respond' else (
                    "question" if self._is_asking_user_question(action) else "tool"
                )
                
                # If the action is to respond, we're done
                if action['action'] == 'respond':
                    # Send the final response
                    response = action['content']
                    self.add_agent_message(response)
                    
                    # Add to results with clear formatting
                    step_results.append({
                        "type": "final_response",
                        "step": step,
                        "content": response
                    })
                    step_summaries.append(f"Step {step}: Final response provided")
                    break
                
                # If the action is to ask the user a question
                is_question = self._is_asking_user_question(action)
                if user_response_queue and is_question:
                    # Extract the question content
                    question = action.get('reasoning', '') or action.get('input', '')
                    if not question:
                        question = f"Question about: {action['action']}"
                    
                    # Mark the message explicitly as a question for frontend handling
                    step_results.append({
                        "type": "question",
                        "step": step,
                        "content": question
                    })
                    step_summaries.append(f"Step {step}: Asked user a question")
                    
                    # Wait for user response
                    logger.info("Waiting for user response...")
                    user_response = await user_response_queue.get()
                    
                    # Add the response to the conversation
                    self.add_user_message(user_response)
                    step_results.append({
                        "type": "user_response",
                        "step": step,
                        "content": user_response
                    })
                    
                    # Continue to next step
                    last_action_type = "question"
                    continue
                
                # Otherwise, execute the tool
                tool_name = action['action']
                tool_input = action['input']
                
                # Send the reasoning to the frontend if available
                if 'reasoning' in action and action['reasoning']:
                    reasoning = action['reasoning']
                    # Only send if different from previous or significant
                    if last_action_type != "reasoning":
                        step_results.append({
                            "type": "reasoning",
                            "step": step,
                            "content": reasoning
                        })
                
                # Log the tool usage in structured format
                tool_usage = f"Using tool: {tool_name}\nInput: {json.dumps(tool_input, indent=2)}"
                step_results.append({
                    "type": "tool_usage",
                    "step": step,
                    "tool": tool_name,
                    "input": tool_input,
                    "content": tool_usage
                })
                step_summaries.append(f"Step {step}: Used tool '{tool_name}'")
                
                # Execute the tool
                try:
                    tool_output = self.execute_tool(tool_name, tool_input)
                    
                    # Handle special tool outputs
                    if tool_name == 'terminate':
                        step_results.append({
                            "type": "status",
                            "step": step,
                            "content": "Task terminated by agent"
                        })
                        step_summaries.append("Task terminated by agent")
                        break
                        
                    # Add tool output to results in structured format
                    output_text = str(tool_output)
                    if len(output_text) > 500:
                        output_text = output_text[:497] + "..."
                    
                    step_results.append({
                        "type": "tool_result",
                        "step": step,
                        "tool": tool_name,
                        "content": output_text
                    })
                    
                except Exception as e:
                    error_msg = f"Error executing tool {tool_name}: {str(e)}"
                    step_results.append({
                        "type": "error",
                        "step": step,
                        "content": error_msg
                    })
                    step_summaries.append(f"Step {step}: Error with tool '{tool_name}'")
                    
                # Track last action type
                last_action_type = current_action_type
                
            # Check if we reached max steps
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
