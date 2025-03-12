from typing import Dict, List, Literal, Optional, Union, Any
import asyncio
import concurrent.futures
import logging
import time

from openai import (
    APIError,
    AsyncOpenAI,
    AuthenticationError,
    OpenAIError,
    RateLimitError,
    AsyncAzureOpenAI
)
try:
    import anthropic
except ImportError:
    anthropic = None

from tenacity import retry, stop_after_attempt, wait_random_exponential, retry_if_exception_type

from app.config import LLMSettings, config, get_provider_from_model, get_base_url_for_provider
from app.logger import logger  # Assuming a logger is set up in your app
from app.schema import Message
from app.httpx_helper import get_http_client


class LLMError(Exception):
    """Base exception for LLM-related errors"""
    pass
    
class AuthError(LLMError):
    """Authentication error with LLM provider"""
    pass
    
class RateLimitError(LLMError):
    """Rate limit error from LLM provider"""
    pass
    
class ServiceError(LLMError):
    """Service-side error from LLM provider"""
    pass


class LLM:
    """
    Language Model interface that supports multiple providers (OpenAI, Anthropic, etc.)
    
    This class is a singleton per configuration name, providing a unified interface
    to interact with different LLM providers.
    """
    _instances: Dict[str, "LLM"] = {}
    _initialization_lock = asyncio.Lock()

    def __new__(cls, config_name: str = "default", llm_config: Optional[Dict[str, LLMSettings]] = None):
        """
        Create or get an existing LLM instance for the given configuration
        
        Args:
            config_name: Name of the configuration section to use
            llm_config: Optional override for the LLM configuration
            
        Returns:
            LLM: An instance of the LLM class
        """
        if config_name not in cls._instances:
            instance = super().__new__(cls)
            cls._instances[config_name] = instance
        return cls._instances[config_name]

    async def __aenter__(self):
        """Async context manager entry"""
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - clean up client if needed"""
        # Clean up if needed
        return False

    def __init__(self, config_name: str = "default", llm_config: Optional[Dict[str, LLMSettings]] = None):
        """
        Initialize the LLM interface with the specified configuration
        
        Args:
            config_name: Name of the configuration section to use
            llm_config: Optional override for the LLM configuration
        """
        if not hasattr(self, "initialized"):  # Only initialize if not already initialized
            # Get configuration from global config or provided override
            all_configs = llm_config or config.llm
            
            # Get specific config for this instance
            llm_settings = all_configs.get(config_name, all_configs["default"])
            
            # Set up basic properties
            self.model = llm_settings.model
            self.max_tokens = llm_settings.max_tokens
            self.temperature = llm_settings.temperature
            self.api_type = llm_settings.api_type
            self.api_key = llm_settings.get_effective_api_key()  # Get API key with environment fallback
            self.api_version = llm_settings.api_version
            self.base_url = llm_settings.get_effective_base_url()  # Get URL with default fallback
            
            # Detect provider from model name if not explicitly set
            self.provider = self.api_type
            if self.provider not in ["azure", "anthropic", "google", "meta"]:
                self.provider = get_provider_from_model(self.model)
                
            # Store original settings for reference
            self.settings = llm_settings
            
            # Create the client
            self.client = None
            self.client_created_at = 0
            self.client_error = None
            
            # Create the client asynchronously later
            
            # Mark as initialized
            self.initialized = True
            logger.info(f"Initialized LLM with provider {self.provider}, model {self.model}")

    async def ensure_client(self):
        """
        Ensure the client is created and valid.
        Creates the client if it doesn't exist or refreshes it if too old.
        """
        # Use a lock to prevent multiple concurrent client creations
        async with self._initialization_lock:
            # Check if client needs to be created or refreshed
            current_time = time.time()
            client_age = current_time - self.client_created_at
            
            if (self.client is None or  # No client yet
                client_age > 3600 or    # Client is over an hour old
                self.client_error):     # Previous error with client
                
                try:
                    await self._create_client()
                    self.client_error = None
                    self.client_created_at = current_time
                except Exception as e:
                    self.client_error = str(e)
                    logger.error(f"Failed to create LLM client: {e}")
                    raise

    async def _create_client(self):
        """
        Create the LLM client for the specified provider
        
        Raises:
            AuthError: If authentication fails
            ServiceError: If service creation fails
            ImportError: If required package is missing
        """
        logger.info(f"Creating client for provider: {self.provider}, model: {self.model}")
        
        # Validate API key
        if not self.api_key:
            raise AuthError(f"No API key available for {self.provider}. Please set {self.provider.upper()}_API_KEY environment variable or provide in config.")
        
        try:
            if self.provider == "azure":
                if not self.base_url or "YOUR_AZURE_ENDPOINT" in self.base_url:
                    raise ServiceError("Azure OpenAI requires a valid endpoint URL. Please set the base_url in your configuration.")
                
                self.client = AsyncAzureOpenAI(
                    base_url=self.base_url,
                    api_key=self.api_key,
                    api_version=self.api_version or "2023-07-01"
                )
            elif self.provider == "anthropic":
                # Check if anthropic package is installed
                if anthropic is None:
                    raise ImportError("anthropic package is not installed. Please install it with: pip install anthropic")
                
                # Use anthropic client - will need to handle differently in ask methods
                self.client = anthropic.AsyncAnthropic(api_key=self.api_key)
                logger.info("Created anthropic client")
            else:
                # For OpenAI client and compatible APIs
                self.client = AsyncOpenAI(
                    api_key=self.api_key,
                    base_url=self.base_url
                )
            logger.info(f"Successfully created client for {self.provider}")
        except AuthenticationError as e:
            raise AuthError(f"Authentication failed for {self.provider}: {str(e)}")
        except OpenAIError as e:
            raise ServiceError(f"OpenAI service error: {str(e)}")
        except Exception as e:
            logger.error(f"Error creating LLM client: {str(e)}")
            raise ServiceError(f"Failed to create {self.provider} client: {str(e)}")

    async def update_config(self, model=None, api_key=None, max_tokens=None, temperature=None, base_url=None):
        """
        Update the LLM configuration parameters
        
        Args:
            model: New model to use
            api_key: New API key
            max_tokens: New max tokens limit
            temperature: New temperature
            base_url: New base URL
            
        Returns:
            self: For method chaining
        """
        async with self._initialization_lock:
            updated = False
            
            if model is not None and model != self.model:
                self.model = model
                updated = True
                
            if api_key is not None and api_key != self.api_key:
                self.api_key = api_key
                updated = True
                
            if max_tokens is not None and max_tokens != self.max_tokens:
                self.max_tokens = max_tokens
                updated = True
                
            if temperature is not None and temperature != self.temperature:
                self.temperature = temperature
                updated = True
                
            if base_url is not None and base_url != self.base_url:
                self.base_url = base_url
                updated = True
                
            if updated:
                # Force client recreation
                self.client = None
                self.client_error = None
                self.client_created_at = 0
                
                # Re-detect provider if model changed
                if model is not None:
                    self.provider = get_provider_from_model(self.model)
                    
                # Log the update
                logger.info(f"Updated LLM configuration - provider: {self.provider}, model: {self.model}")
                
        return self

    @staticmethod
    def format_messages(messages: List[Union[dict, Message]]) -> List[dict]:
        """
        Format a list of messages into a format suitable for sending to LLMs.
        
        Args:
            messages: List of message objects/dicts to format
            
        Returns:
            List of properly formatted messages as dictionaries
        """
        formatted_messages = []
        
        for msg in messages:
            # Handle Message objects
            if isinstance(msg, Message):
                msg_dict = {
                    "role": msg.role,
                    "content": msg.content,
                }
                # Skip empty content
                if not msg_dict["content"]:
                    continue
                    
                if msg.name:
                    msg_dict["name"] = msg.name
                formatted_messages.append(msg_dict)
            # Handle dictionaries directly
            elif isinstance(msg, dict):
                # Skip messages with no content
                if not msg.get("content"):
                    continue
                # Ensure the message has the required keys
                if "role" not in msg:
                    logger.warning("Message missing 'role' key, skipping")
                    continue
                formatted_messages.append(msg)
        
        return formatted_messages

    @retry(
        wait=wait_random_exponential(min=1, max=60),
        stop=stop_after_attempt(6),
        retry=retry_if_exception_type((APIError, RateLimitError))
    )
    async def ask(
        self,
        messages: List[Union[dict, Message]],
        system_msgs: Optional[List[Union[dict, Message]]] = None,
        stream: bool = True,
        temperature: Optional[float] = None,
    ) -> str:
        """
        Send a request to the language model and get a response.
        
        Args:
            messages: List of message objects or dicts to send
            system_msgs: Optional system messages to prepend
            stream: Whether to stream the response
            temperature: Optional temperature override
            
        Returns:
            String response from the language model
            
        Raises:
            AuthError: If authentication fails
            RateLimitError: If rate limits are exceeded
            ServiceError: For other service errors
        """
        try:
            # Ensure client is created and valid
            await self.ensure_client()
            
            # Format messages and add system messages if provided
            formatted_messages = self.format_messages(messages)
            
            if system_msgs:
                system_formatted = self.format_messages(system_msgs)
                # Prepend system messages
                formatted_messages = system_formatted + formatted_messages
            
            # Use provided temperature or default
            temp = temperature if temperature is not None else self.temperature
            
            # Provider-specific handling
            if self.provider == "anthropic":
                return await self._ask_anthropic(formatted_messages, stream, temp)
            else:
                # Default to OpenAI API format
                return await self._ask_openai(formatted_messages, stream, temp)
                
        except AuthenticationError as e:
            logger.error(f"Authentication error: {e}")
            raise AuthError(f"Authentication failed: {str(e)}")
        except RateLimitError as e:
            logger.warning(f"Rate limit exceeded: {e}")
            raise RateLimitError(f"Rate limit exceeded: {str(e)}")
        except APIError as e:
            logger.error(f"API error: {e}")
            raise ServiceError(f"API error: {str(e)}")
        except Exception as e:
            logger.error(f"Error in LLM request: {e}")
            raise ServiceError(f"Error in LLM request: {str(e)}")

    async def _ask_openai(self, messages, stream, temperature=None):
        """
        Send request to OpenAI or compatible API (Azure, etc.)
        
        Args:
            messages: Formatted message list
            stream: Whether to stream the response
            temperature: Temperature setting
            
        Returns:
            String response from the language model
        """
        try:
            # Make the API call
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                max_tokens=self.max_tokens,
                temperature=temperature or self.temperature,
                stream=stream,
            )
            
            if stream:
                # Handle streaming response
                collected_messages = []
                async for chunk in response:
                    if not chunk.choices:
                        continue
                    content = chunk.choices[0].delta.content
                    if content:
                        collected_messages.append(content)
                        
                return "".join(collected_messages)
            else:
                # Handle non-streaming response
                return response.choices[0].message.content
        except Exception as e:
            logger.error(f"Error in OpenAI request: {e}")
            raise

    async def _ask_anthropic(self, messages, stream, temperature=None):
        """
        Send request to Anthropic API
        
        Args:
            messages: Formatted message list
            stream: Whether to stream the response
            temperature: Temperature setting
            
        Returns:
            String response from the language model
        """
        if anthropic is None:
            raise ImportError("anthropic package is not installed")
            
        try:
            # Convert messages to Anthropic format
            anthropic_messages = []
            system_msg = None
            
            # Extract system message
            for msg in messages:
                if msg["role"] == "system":
                    # Anthropic only allows one system message
                    if system_msg:
                        # Combine system messages
                        system_msg += "\n" + msg["content"]
                    else:
                        system_msg = msg["content"]
                else:
                    # Convert roles to Anthropic format
                    role = msg["role"]
                    if role == "assistant":
                        role = "assistant"
                    elif role == "user":
                        role = "user"
                    elif role == "tool":
                        # Anthropic doesn't have tool role - use user role
                        role = "user"
                        
                    anthropic_messages.append({"role": role, "content": msg["content"]})
            
            # Make the API call
            response = await self.client.messages.create(
                model=self.model,
                messages=anthropic_messages,
                system=system_msg,
                max_tokens=self.max_tokens,
                temperature=temperature or self.temperature,
                stream=stream,
            )
            
            if stream:
                # Handle streaming response
                collected_messages = []
                async for chunk in response:
                    content = chunk.delta.text
                    if content:
                        collected_messages.append(content)
                        
                return "".join(collected_messages)
            else:
                # Handle non-streaming response
                return response.content[0].text
        except Exception as e:
            logger.error(f"Error in Anthropic request: {e}")
            raise

    @retry(
        wait=wait_random_exponential(min=1, max=60),
        stop=stop_after_attempt(6),
        retry=retry_if_exception_type((APIError, RateLimitError))
    )
    async def ask_tool(
        self,
        messages: List[Union[dict, Message]],
        system_msgs: Optional[List[Union[dict, Message]]] = None,
        timeout: int = 60,
        tools: Optional[List[dict]] = None,
        tool_choice: Literal["none", "auto", "required"] = "auto",
        temperature: Optional[float] = None,
        **kwargs,
    ):
        """
        Send a request to the language model with tool definitions
        
        Args:
            messages: List of message objects or dicts to send
            system_msgs: Optional system messages to prepend
            timeout: Timeout in seconds
            tools: List of tool definitions
            tool_choice: How to handle tool selection
            temperature: Optional temperature override
            
        Returns:
            Dict containing the response or tool call
            
        Raises:
            AuthError: If authentication fails
            RateLimitError: If rate limits are exceeded
            ServiceError: For other service errors
            NotImplementedError: If the provider doesn't support tool calls
        """
        # Check provider capability for tool calls
        if self.provider not in ["openai", "azure"]:
            raise NotImplementedError(f"Tool calls are not supported by {self.provider}")
        
        try:
            # Ensure client is created and valid
            await self.ensure_client()
            
            # Format messages and add system messages if provided
            formatted_messages = self.format_messages(messages)
            
            if system_msgs:
                system_formatted = self.format_messages(system_msgs)
                # Prepend system messages
                formatted_messages = system_formatted + formatted_messages
            
            # Use provided temperature or default
            temp = temperature if temperature is not None else self.temperature
            
            # Create request with tools
            response = await self.client.chat.completions.create(
                model=self.model,
                messages=formatted_messages,
                tools=tools,
                tool_choice=tool_choice,
                max_tokens=self.max_tokens,
                temperature=temp,
                timeout=timeout,
                **kwargs
            )
            
            # Extract response
            message = response.choices[0].message
            
            # Check if there's a tool call
            if hasattr(message, "tool_calls") and message.tool_calls:
                # Handle tool calls
                result = {
                    "type": "tool_call",
                    "tool_calls": []
                }
                
                # Process each tool call
                for tool_call in message.tool_calls:
                    try:
                        # Parse function arguments
                        import json
                        args = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError:
                        # Handle case where arguments aren't valid JSON
                        args = tool_call.function.arguments
                        
                    # Add to result
                    result["tool_calls"].append({
                        "id": tool_call.id,
                        "type": "function",
                        "function": {
                            "name": tool_call.function.name,
                            "arguments": args
                        }
                    })
                
                return result
            else:
                # Regular text response
                return {
                    "type": "message",
                    "content": message.content
                }
                
        except AuthenticationError as e:
            logger.error(f"Authentication error: {e}")
            raise AuthError(f"Authentication failed: {str(e)}")
        except RateLimitError as e:
            logger.warning(f"Rate limit exceeded: {e}")
            raise RateLimitError(f"Rate limit exceeded: {str(e)}")
        except APIError as e:
            logger.error(f"API error: {e}")
            raise ServiceError(f"API error: {str(e)}")
        except Exception as e:
            logger.error(f"Error in LLM tool request: {e}")
            raise ServiceError(f"Error in LLM tool request: {str(e)}")

    def run_in_thread(self, method, *args, **kwargs):
        """
        Run an async method in a separate thread
        
        Args:
            method: Async method to run
            *args: Positional arguments to pass to the method
            **kwargs: Keyword arguments to pass to the method
            
        Returns:
            Result of the async method
            
        Raises:
            Exception: If the async method raises an exception
        """
        loop = asyncio.new_event_loop()
        
        try:
            # Define the coroutine to run in the thread
            async def run_method():
                # Ensure the client is created if needed
                if method.__name__ in ['ask', 'ask_tool']:
                    await self.ensure_client()
                return await method(*args, **kwargs)
            
            # Create a future to store the result
            future = asyncio.run_coroutine_threadsafe(
                run_method(), 
                loop
            )
            
            # Run the event loop in a thread
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
                # Define a worker function that runs the event loop
                def worker():
                    try:
                        asyncio.set_event_loop(loop)
                        loop.run_forever()
                    except Exception as e:
                        logger.error(f"Error in event loop: {e}")
                    finally:
                        # Ensure the loop is closed when done
                        loop.close()
                
                # Start the worker in the executor
                executor.submit(worker)
                
                try:
                    # Wait for the result with timeout
                    timeout = kwargs.get('timeout', 300)  # Default 5 minutes
                    result = future.result(timeout=timeout)
                    return result
                except concurrent.futures.TimeoutError:
                    logger.error(f"Request timed out after {timeout} seconds")
                    raise TimeoutError(f"LLM request timed out after {timeout} seconds")
                except Exception as e:
                    logger.error(f"Error in async method: {e}")
                    raise
                finally:
                    # Stop the event loop
                    loop.call_soon_threadsafe(loop.stop)
        except Exception as e:
            logger.error(f"Thread execution error: {e}")
            raise

    def generate(
        self,
        messages: List[Union[dict, Message]],
        system_msgs: Optional[List[Union[dict, Message]]] = None,
        stream: bool = False,
        temperature: Optional[float] = None,
    ) -> str:
        """
        Synchronous version of the ask method
        
        Args:
            messages: List of message objects or dicts to send
            system_msgs: Optional system messages to prepend
            stream: Whether to stream the response
            temperature: Optional temperature override
            
        Returns:
            String response from the language model
        """
        return self.run_in_thread(
            self.ask, messages, system_msgs, stream, temperature
        )
