from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from typing import List, Literal, Optional
import asyncio

from pydantic import BaseModel, Field, model_validator

from app.llm import LLM, LLMSettings
from app.logger import logger
from app.schema import AgentState, Memory, Message
from app.config import get_provider_from_model


class BaseAgent(BaseModel, ABC):
    """Abstract base class for managing agent state and execution.

    Provides foundational functionality for state transitions, memory management,
    and a step-based execution loop. Subclasses must implement the `step` method.
    """

    # Core attributes
    name: str = Field(..., description="Unique name of the agent")
    description: Optional[str] = Field(None, description="Optional agent description")

    # Prompts
    system_prompt: Optional[str] = Field(
        None, description="System-level instruction prompt"
    )
    next_step_prompt: Optional[str] = Field(
        None, description="Prompt for determining next action"
    )

    # Dependencies
    llm: LLM = Field(default_factory=LLM, description="Language model instance")
    memory: Memory = Field(default_factory=Memory, description="Agent's memory store")
    state: AgentState = Field(
        default=AgentState.IDLE, description="Current agent state"
    )

    # Execution control
    max_steps: int = Field(default=10, description="Maximum steps before termination")
    current_step: int = Field(default=0, description="Current step in execution")

    duplicate_threshold: int = 2

    class Config:
        arbitrary_types_allowed = True
        extra = "allow"  # Allow extra fields for flexibility in subclasses

    def update_llm_config(self, model=None, api_key=None, max_tokens=None, verbosity="normal"):
        """
        Update the LLM configuration settings for this agent
        
        Args:
            model: Model name to use (e.g., "gpt-4", "gpt-3.5-turbo")
            api_key: API key for the model provider
            max_tokens: Maximum tokens to generate in completions
            verbosity: Control the verbosity of responses ("concise", "normal", or "detailed")
            
        Raises:
            ValueError: If the API key format is invalid
        """
        # Log the input model name for debugging
        logger.info(f"Updating LLM config with model input: '{model}'")
        
        # Determine the model to use
        model_name = model or self.llm.settings.model
        logger.info(f"Using model_name: '{model_name}'")
        
        # Determine the provider based on the model name
        provider = get_provider_from_model(model_name)
        logger.info(f"Determined provider: '{provider}' for model: '{model_name}'")
        
        # Create a new LLM config
        new_settings = LLMSettings(
            provider=provider,
            model=model_name,
            api_key=api_key or self.llm.settings.api_key,
            max_tokens=max_tokens or self.llm.settings.max_tokens,
            verbosity=verbosity  # Add verbosity setting
        )
        
        # Update the LLM instance
        self.llm.update_settings(new_settings)

    @model_validator(mode="after")
    def initialize_agent(self) -> "BaseAgent":
        """Initialize agent with default settings if not provided."""
        if self.llm is None or not isinstance(self.llm, LLM):
            self.llm = LLM(config_name=self.name.lower())
        if not isinstance(self.memory, Memory):
            self.memory = Memory()
        return self

    @asynccontextmanager
    async def state_context(self, new_state: AgentState):
        """Context manager for safe agent state transitions.

        Args:
            new_state: The state to transition to during the context.

        Yields:
            None: Allows execution within the new state.

        Raises:
            ValueError: If the new_state is invalid.
        """
        if not isinstance(new_state, AgentState):
            raise ValueError(f"Invalid state: {new_state}")

        previous_state = self.state
        self.state = new_state
        try:
            yield
        except Exception as e:
            self.state = AgentState.ERROR  # Transition to ERROR on failure
            raise e
        finally:
            self.state = previous_state  # Revert to previous state

    def update_memory(
        self,
        role: Literal["user", "system", "assistant", "tool"],
        content: str,
        **kwargs,
    ) -> None:
        """Add a message to the agent's memory.

        Args:
            role: The role of the message sender (user, system, assistant, tool).
            content: The message content.
            **kwargs: Additional arguments (e.g., tool_call_id for tool messages).

        Raises:
            ValueError: If the role is unsupported.
        """
        message_map = {
            "user": Message.user_message,
            "system": Message.system_message,
            "assistant": Message.assistant_message,
            "tool": lambda content, **kw: Message.tool_message(content, **kw),
        }

        if role not in message_map:
            raise ValueError(f"Unsupported message role: {role}")

        msg_factory = message_map[role]
        msg = msg_factory(content, **kwargs) if role == "tool" else msg_factory(content)
        self.memory.add_message(msg)

    async def run(self, request: Optional[str] = None, user_response_queue: Optional[asyncio.Queue] = None) -> str:
        """Execute the agent's main loop asynchronously.

        Args:
            request: Optional initial user request to process.
            user_response_queue: Optional queue for receiving user responses.

        Returns:
            A string summarizing the execution results.

        Raises:
            RuntimeError: If the agent is not in IDLE state at start.
        """
        if self.state != AgentState.IDLE:
            raise RuntimeError(f"Cannot run agent from state: {self.state}")

        if request:
            self.update_memory("user", request)

        results = []
        step_summaries = []
        
        async with self.state_context(AgentState.RUNNING):
            while (
                self.current_step < self.max_steps and self.state != AgentState.FINISHED
            ):
                self.current_step += 1
                logger.info(f"Executing step {self.current_step}/{self.max_steps}")
                
                # Execute the step
                step_result = await self.step()
                
                # More robust question detection
                is_question = self._is_asking_question(step_result)
                
                # Check if we need to wait for user response
                if user_response_queue and is_question:
                    # Add the question to results with a clear indicator
                    question_entry = f"MODEL QUESTION: {step_result}"
                    results.append(question_entry)
                    step_summaries.append(f"Step {self.current_step}: Asked user a question")
                    
                    # Log that we're waiting for user input
                    logger.info("Waiting for user response...")
                    
                    # Wait for user response - this will block until the user responds
                    user_response = await user_response_queue.get()
                    logger.info(f"Received user response: {user_response}")
                    
                    # Add user response to memory
                    self.update_memory("user", user_response)
                    
                    # Add the user's response to results with a clear indicator
                    results.append(f"USER RESPONSE: {user_response}")
                    
                    # Continue to next step without adding the step_result again
                    continue
                
                # Check for stuck state
                if self.is_stuck():
                    self.handle_stuck_state()

                # Add to results with appropriate formatting
                results.append(f"MODEL OUTPUT: {step_result}")
                step_summaries.append(f"Step {self.current_step}: {self._summarize_step(step_result)}")

            # Final step status
            if self.current_step >= self.max_steps:
                results.append("STATUS: Maximum steps reached")
                step_summaries.append(f"Terminated: Maximum steps reached ({self.max_steps})")
            else:
                results.append("STATUS: Task completed successfully")
                step_summaries.append("Task completed successfully")

        # Format the output with structured sections
        formatted_output = "\n\n".join([
            "## Summary of Actions Taken",
            "\n".join(f"- {summary}" for summary in step_summaries),
            "## Detailed Conversation",
            "\n\n".join(results)
        ])
        
        return formatted_output

    def _is_asking_question(self, text: str) -> bool:
        """More robust detection of questions in model output."""
        # Check for question marks
        has_question_mark = "?" in text
        
        # Check for common question phrases
        question_phrases = [
            "Could you", "Can you", "Would you", "Do you", 
            "What is", "How would", "Please provide", "Please clarify",
            "I need to know", "I'd like to know", "Tell me", "Explain",
            "Would it be possible", "Is there", "Are there", "Should I"
        ]
        has_question_phrase = any(phrase.lower() in text.lower() for phrase in question_phrases)
        
        # Check for question structure at the end of text
        ends_with_question = any(text.strip().endswith(suffix) for suffix in ["?", "...", ": "])
        
        return (has_question_mark and has_question_phrase) or ends_with_question
    
    def _summarize_step(self, step_result: str) -> str:
        """Create a concise summary of a step result."""
        # Limit to 100 characters 
        if len(step_result) > 100:
            return step_result[:97] + "..."
        return step_result

    @abstractmethod
    async def step(self) -> str:
        """Execute a single step in the agent's workflow.

        Must be implemented by subclasses to define specific behavior.
        """

    def handle_stuck_state(self):
        """Handle stuck state by adding a prompt to change strategy"""
        stuck_prompt = "\
        Observed duplicate responses. Consider new strategies and avoid repeating ineffective paths already attempted."
        self.next_step_prompt = f"{stuck_prompt}\n{self.next_step_prompt}"
        logger.warning(f"Agent detected stuck state. Added prompt: {stuck_prompt}")

    def is_stuck(self) -> bool:
        """Check if the agent is stuck in a loop by detecting duplicate content"""
        if len(self.memory.messages) < 2:
            return False

        last_message = self.memory.messages[-1]
        if not last_message.content:
            return False

        # Count identical content occurrences
        duplicate_count = sum(
            1
            for msg in reversed(self.memory.messages[:-1])
            if msg.role == "assistant" and msg.content == last_message.content
        )

        return duplicate_count >= self.duplicate_threshold

    @property
    def messages(self) -> List[Message]:
        """Retrieve a list of messages from the agent's memory."""
        return self.memory.messages

    @messages.setter
    def messages(self, value: List[Message]):
        """Set the list of messages in the agent's memory."""
        self.memory.messages = value
