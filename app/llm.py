from typing import Dict, List, Literal, Optional, Union, Any, Callable
import asyncio
import concurrent.futures
import logging
import time
import os
import re
import json
import threading
from concurrent.futures import ThreadPoolExecutor
from pydantic import BaseModel

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


# Add token budget tracking for rate limiting
class TokenBudget:
    """Token rate limiter to prevent rate limit errors"""
    
    def __init__(self, tokens_per_minute=8000, recovery_rate=133):  # 133 tokens/sec = ~8000/min
        self.tokens_per_minute = tokens_per_minute
        self.recovery_rate = recovery_rate  # Tokens per second that get added back
        self.available_tokens = tokens_per_minute
        self.last_updated = time.time()
        self.lock = threading.Lock()
    
    def update_available(self):
        """Update available tokens based on time elapsed"""
        now = time.time()
        elapsed = now - self.last_updated
        self.last_updated = now
        
        # Add tokens based on recovery rate and time elapsed
        with self.lock:
            self.available_tokens = min(
                self.tokens_per_minute,
                self.available_tokens + (self.recovery_rate * elapsed)
            )
    
    def consume(self, tokens):
        """Consume tokens from the budget"""
        self.update_available()
        
        with self.lock:
            if tokens > self.available_tokens:
                return False
            
            self.available_tokens -= tokens
            return True
    
    async def wait_for_tokens(self, tokens, max_wait_time=30):
        """Wait until enough tokens are available"""
        start_time = time.time()
        
        while True:
            self.update_available()
            
            with self.lock:
                if tokens <= self.available_tokens:
                    self.available_tokens -= tokens
                    return True
            
            # Check if we've waited too long
            if time.time() - start_time > max_wait_time:
                logger.warning(f"Waited too long for token budget to replenish (needed {tokens}, have {self.available_tokens})")
                return False
            
            # Wait a bit before checking again
            wait_time = min(1.0, tokens / (self.recovery_rate * 2))  # Adaptive wait time
            await asyncio.sleep(wait_time)


# Create global token budgets for different providers
anthropic_budget = TokenBudget(tokens_per_minute=7500)  # Setting slightly below limit for safety


# Add a response verbosity enum
class ResponseVerbosity(str):
    """Controls how verbose the model responses should be"""
    CONCISE = "concise"      # Minimal responses, just the facts
    NORMAL = "normal"        # Standard responses with some explanation
    DETAILED = "detailed"    # Detailed responses with full reasoning


class LLMSettings(BaseModel):
    """Settings for a language model"""
    provider: str
    model: str
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    api_version: Optional[str] = None
    deployment_id: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    verbosity: str = ResponseVerbosity.NORMAL  # Default to normal verbosity


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

    async def update_config(self, model=None, api_key=None, max_tokens=None):
        """
        Update LLM configuration parameters
        
        Args:
            model: Model name to use
            api_key: API key for the model provider
            max_tokens: Maximum tokens to generate in completions
        """
        from app.config import get_provider_from_model
        
        # Determine model
        model_name = model or self.settings.model
        
        # Determine provider
        provider = get_provider_from_model(model_name)
        
        # Create new settings with updated values, preserving other settings
        new_settings = LLMSettings(
            provider=provider,
            model=model_name,
            api_key=api_key or self.settings.api_key,
            max_tokens=max_tokens or self.settings.max_tokens,
            api_base=self.settings.api_base,
            api_version=self.settings.api_version,
            deployment_id=self.settings.deployment_id,
            temperature=self.settings.temperature,
            verbosity=self.settings.verbosity
        )
        
        # Update with the new settings
        self.update_settings(new_settings)

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
                if stream:
                    # For streaming, return the generator function
                    generator_func = await self._ask_anthropic(formatted_messages, stream, temp)
                    return generator_func()  # Call it here to get the generator
                else:
                    # For non-streaming, call the function and get the result directly
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

    async def _ask_anthropic(self, messages: List[Dict[str, str]], stream: bool = False, temperature: Optional[float] = None, retry_count: int = 0) -> str:
        """
        Send a request to the Anthropic API with rate limiting and retry logic.
        
        Args:
            messages: List of message dictionaries
            stream: Whether to stream the response
            temperature: Temperature for response generation
            retry_count: Number of retries attempted
            
        Returns:
            str: The model's response or an async generator for streaming
            
        Raises:
            RateLimitError: If rate limit is hit and max retries exceeded
            AuthError: If API key is invalid
            ServiceError: For other API errors
        """
        try:
            # Initialize Anthropic client if needed
            if not hasattr(self, '_anthropic') or not self._anthropic:
                await self.ensure_client()

            # Format messages for Anthropic
            system_message = ""
            prompt_parts = []
            
            for msg in messages:
                role = msg.get("role", "")
                content = msg.get("content", "")
                
                if role == "system":
                    system_message = content
                elif role == "user":
                    prompt_parts.append({"role": "user", "content": content})
                elif role == "assistant":
                    prompt_parts.append({"role": "assistant", "content": content})
                elif role == "tool":
                    # Format tool messages as assistant messages
                    prompt_parts.append({"role": "assistant", "content": f"Tool usage: {content}"})

            # Determine max tokens based on verbosity
            if self.settings.verbosity == "concise":
                max_tokens = min(self.settings.max_tokens, 1000)
            elif self.settings.verbosity == "detailed":
                max_tokens = self.settings.max_tokens
            else:  # normal
                max_tokens = min(self.settings.max_tokens, 2000)

            # Wait for token budget if needed
            if hasattr(self, '_token_budget'):
                await self._token_budget.wait_for_tokens(max_tokens)

            # Log the exact model being used to help with debugging
            logger.info(f"Making Anthropic API call with model: {self.settings.model}")

            # Create the message for Claude
            request_params = {
                "model": self.settings.model,  # Use the exact model from settings
                "messages": prompt_parts,
                "max_tokens": max_tokens,
                "temperature": temperature if temperature is not None else self.settings.temperature,
                "stream": stream
            }
            
            if system_message:
                request_params["system"] = system_message

            # Make the API call
            response = await self.client.messages.create(**request_params)

            # Extract the response content
            if stream:
                # Define a streaming response handler as an async generator
                async def response_generator():
                    try:
                        async for chunk in response:
                            if chunk.content and chunk.content[0].text:
                                yield chunk.content[0].text
                    except Exception as e:
                        logger.error(f"Error in streaming response: {e}")
                        raise ServiceError(f"Streaming error: {str(e)}")
                
                # Return the generator itself, not the result of calling it
                return response_generator
            else:
                # For non-streaming responses, return the complete text
                return response.content[0].text

        except Exception as e:
            error_msg = str(e).lower()
            
            # Log the specific error to help with debugging
            logger.error(f"Anthropic API error: {str(e)} when using model: {self.settings.model}")
            
            # Handle rate limits with exponential backoff
            if "rate limit" in error_msg or "429" in error_msg:
                if retry_count < 6:  # Max 6 retries
                    wait_time = min(2 ** retry_count, 32)  # Cap at 32 seconds
                    logger.warning(f"Rate limit hit, waiting {wait_time} seconds before retry {retry_count + 1}")
                    await asyncio.sleep(wait_time)
                    return await self._ask_anthropic(messages, stream, temperature, retry_count + 1)
                raise RateLimitError("Rate limit exceeded after max retries")
                
            # Handle authentication errors
            if "invalid" in error_msg and "api key" in error_msg:
                raise AuthError("Invalid API key")
                
            # Handle other errors
            raise ServiceError(f"Anthropic API error: {str(e)}")

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
            # Check if we're dealing with a streaming response
            is_ask_method = method.__name__ == 'ask'
            is_streaming = is_ask_method and kwargs.get('stream', args[2] if len(args) > 2 else False)
            
            # If asking Anthropic and streaming, we need special handling
            if is_ask_method and is_streaming and self.provider == "anthropic":
                # We can't easily handle async generators in threads
                # For Anthropic streaming in sync context, we'll just get the full response
                # Modify args to force non-streaming
                if len(args) > 2:
                    args_list = list(args)
                    args_list[2] = False  # Set stream=False
                    args = tuple(args_list)
                else:
                    kwargs['stream'] = False
            
            # Define the coroutine to run in the thread
            async def run_method():
                # Ensure the client is created if needed
                if method.__name__ in ['ask', 'ask_tool']:
                    await self.ensure_client()
                    
                result = await method(*args, **kwargs)
                
                # For Anthropic streaming responses in a non-streaming context
                if is_ask_method and method.__name__ == 'ask' and self.provider == "anthropic":
                    # If we got a generator function, we need to collect all chunks
                    if callable(result) and not isinstance(result, str):
                        generator = result()
                        full_response = ""
                        async for chunk in generator:
                            full_response += chunk
                        return full_response
                
                return result
            
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
            stream: Whether to stream the response (note: streaming isn't fully supported in synchronous mode)
            temperature: Optional temperature override
            
        Returns:
            String response from the language model
        """
        # For synchronous usage, we always set stream=False for consistency
        # This ensures we always get a string back, not an async generator
        return self.run_in_thread(
            self.ask, messages, system_msgs, False, temperature
        )

    def update_settings(self, settings: LLMSettings):
        """
        Update LLM settings with a new configuration
        
        Args:
            settings: New LLM configuration settings
        """
        self.settings = settings
        logger.info(f"Updated LLM settings: model={settings.model}, verbosity={settings.verbosity}")
        
    def update_config(self, model=None, api_key=None, max_tokens=None):
        """
        Update LLM configuration parameters
        
        Args:
            model: Model name to use
            api_key: API key for the model provider
            max_tokens: Maximum tokens to generate in completions
        """
        # Create new settings with updated values, preserving other settings
        new_settings = LLMSettings(
            model=model or self.settings.model,
            api_key=api_key or self.settings.api_key,
            max_tokens=max_tokens or self.settings.max_tokens,
            api_type=self.settings.api_type,
            temperature=self.settings.temperature,
            api_version=self.settings.api_version,
            base_url=self.settings.base_url,
            verbosity=self.settings.verbosity
        )
        
        # Update with the new settings
        self.update_settings(new_settings)
