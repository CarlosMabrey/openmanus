import threading
import os
import tomllib
from pathlib import Path
from typing import Dict, List, Optional, Union, Literal, Any
import logging
from enum import Enum

from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)

def get_project_root() -> Path:
    """Get the project root directory"""
    return Path(__file__).resolve().parent.parent


PROJECT_ROOT = get_project_root()
WORKSPACE_ROOT = PROJECT_ROOT / "workspace"

# Ensure workspace directory exists
WORKSPACE_ROOT.mkdir(exist_ok=True)


class ResponseVerbosity(str, Enum):
    CONCISE = "concise"
    NORMAL = "normal"
    DETAILED = "detailed"

class LLMSettings(BaseModel):
    """Settings for language model configuration"""
    model: str = "gpt-4-turbo"
    max_tokens: int = 4096
    temperature: float = 0.7
    api_type: str = "openai"  # openai, azure, anthropic, google, meta
    api_key: str = ""
    api_version: str = ""
    base_url: str = ""
    verbosity: ResponseVerbosity = ResponseVerbosity.NORMAL
    
    class Config:
        # Allow extra fields for provider-specific settings
        extra = "allow"
    
    @validator('api_key')
    def validate_api_key(cls, v, values):
        """Validate that the API key is provided if needed"""
        # Skip validation if empty - will use env var
        if not v:
            return v
            
        # Basic format validation for API keys
        if not isinstance(v, str):
            raise ValueError("API key must be a string")
        
        # Basic length validation
        if len(v.strip()) < 10:
            raise ValueError("API key appears to be invalid (too short)")
            
        # Provider-specific validation
        api_type = values.get('api_type', 'openai')
        model = values.get('model', '')
        
        # OpenAI keys typically start with 'sk-'
        if api_type == 'openai' and not v.startswith("sk-"):
            logger.warning("OpenAI API key should start with 'sk-'")
        
        # Azure keys are longer
        if api_type == 'azure' and len(v) < 30:
            logger.warning("Azure API key seems unusually short")
            
        # Anthropic keys start with 'sk-ant'
        if api_type == 'anthropic' and not v.startswith("sk-ant"):
            logger.warning("Anthropic API key should start with 'sk-ant'")
            
        return v
        
    def get_effective_api_key(self) -> str:
        """Get the effective API key, using environment variables if needed"""
        # Use the key from config if provided
        if self.api_key:
            return self.api_key
            
        # Otherwise, look for environment variables
        env_vars = {
            'openai': ['OPENAI_API_KEY'],
            'azure': ['AZURE_OPENAI_API_KEY', 'OPENAI_API_KEY'],
            'anthropic': ['ANTHROPIC_API_KEY'],
            'google': ['GOOGLE_API_KEY'],
            'meta': ['META_API_KEY']
        }
        
        # Get possible env var names for this provider
        var_names = env_vars.get(self.api_type, [])
        
        # Try each environment variable
        for var in var_names:
            key = os.environ.get(var)
            if key:
                logger.info(f"Using API key from environment variable {var}")
                return key
                
        # If we get here, no key was found
        logger.warning(f"No API key found for {self.api_type} provider")
        return ""
        
    def get_effective_base_url(self) -> str:
        """Get the effective base URL, using defaults if needed"""
        if self.base_url:
            return self.base_url
            
        # Default URLs based on provider
        return get_base_url_for_provider(self.api_type)


class ConfigModel(BaseModel):
    """Pydantic model for configuration"""
    llm: Dict[str, LLMSettings] = {
        "default": LLMSettings(),
        "manus": LLMSettings(model="gpt-4-turbo"),
        "azure": LLMSettings(
            model="gpt-4-turbo",
            api_type="azure",
            base_url="https://YOUR_AZURE_ENDPOINT.openai.azure.com",
        ),
        "anthropic": LLMSettings(
            model="claude-3-5-sonnet-20240620",
            api_type="anthropic",
            base_url="https://api.anthropic.com/v1/models",
        ),
        "google": LLMSettings(
            model="gemini-pro",
            api_type="google",
            base_url="https://generativelanguage.googleapis.com",
        ),
        "meta": LLMSettings(
            model="llama-3-70b-instruct",
            api_type="meta",
            base_url="https://llama-api.meta.com",
        ),
    }


class Config:
    """Singleton configuration class that manages application settings"""
    _instance = None
    _lock = threading.Lock()
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not self._initialized:
            with self._lock:
                if not self._initialized:
                    self._config = None
                    self._load_initial_config()
                    self._initialized = True

    @staticmethod
    def _get_config_path() -> Path:
        """Get the configuration file path, with fallbacks"""
        # Check for environment variable first
        env_config = os.environ.get('OPENMANUS_CONFIG')
        if env_config:
            path = Path(env_config)
            if path.exists():
                logger.info(f"Using config from environment: {path}")
                return path
                
        # Check standard locations
        root = PROJECT_ROOT
        config_path = root / "config" / "config.toml"
        if config_path.exists():
            return config_path
        
        # Check for example config
        example_path = root / "config" / "config.example.toml"
        if example_path.exists():
            logger.warning("Using example config file. This is NOT recommended for production.")
            return example_path
            
        # Create config directory if it doesn't exist
        config_dir = root / "config"
        config_dir.mkdir(exist_ok=True)
        
        # No config found, use default
        logger.warning(f"No configuration file found. Creating default at {config_path}")
        
        # Create a minimal default config
        with open(config_path, 'wb') as f:
            f.write(b"""# OpenManus default configuration
[llm.default]
model = "gpt-4o"
api_type = "openai"
max_tokens = 4096
temperature = 0.7
""")
        
        return config_path

    def _load_config(self) -> Dict[str, Any]:
        """Load the configuration from the TOML file"""
        try:
            config_path = self._get_config_path()
            with config_path.open("rb") as f:
                return tomllib.load(f)
        except Exception as e:
            logger.error(f"Error loading configuration: {e}")
            return {}

    def _load_initial_config(self):
        """Load the initial configuration and set up the config object"""
        raw_config = self._load_config()
        
        # Create default ConfigModel
        self._config = ConfigModel()
        
        # If there's no config or it's empty, just use defaults
        if not raw_config:
            logger.warning("Using default configuration")
            return
            
        # Process LLM configurations
        base_llm = raw_config.get("llm", {})
        
        # Update default LLM settings if provided
        if "default" in base_llm:
            self._config.llm["default"] = LLMSettings(**base_llm["default"])
            
        # Process provider-specific settings
        for provider in ["openai", "azure", "anthropic", "google", "meta"]:
            if provider in base_llm:
                # Create provider config or update existing
                self._config.llm[provider] = LLMSettings(**base_llm[provider])

    @property
    def llm(self) -> Dict[str, LLMSettings]:
        """Get the LLM configuration settings"""
        if not self._config:
            self._load_initial_config()
        return self._config.llm
        
    def reload(self):
        """Reload the configuration from disk"""
        with self._lock:
            self._load_initial_config()
        logger.info("Configuration reloaded")


# Create global config instance
config = Config()


def get_provider_from_model(model_name: str) -> str:
    """
    Determine the provider based on the model name.
    
    Args:
        model_name: Name of the model
        
    Returns:
        str: Provider name (openai, azure, anthropic, etc.)
    """
    model_name = model_name.lower()
    
    # Simple mapping of model prefixes to providers
    provider_prefixes = {
        'gpt': 'openai',
        'text-davinci': 'openai',
        'text-curie': 'openai',
        'text-babbage': 'openai',
        'text-ada': 'openai',
        'claude': 'anthropic',
        'gemini': 'google',
        'llama': 'meta',
        'palm': 'google'
    }
    
    # Check against known prefixes
    for prefix, provider in provider_prefixes.items():
        if model_name.startswith(prefix):
            return provider
            
    # Default to OpenAI if unknown
    logger.warning(f"Unknown model format: {model_name}, defaulting to OpenAI")
    return "openai"


def get_base_url_for_provider(provider: str) -> str:
    """
    Get the default base URL for a provider.
    
    Args:
        provider: Provider name (openai, azure, anthropic, etc.)
        
    Returns:
        str: Base URL for the provider
    """
    provider_urls = {
        "openai": "https://api.openai.com/v1",
        "anthropic": "https://api.anthropic.com/v1",
        "google": "https://generativelanguage.googleapis.com/v1",
        "meta": "https://llama-api.meta.com/v1"
        # Azure needs specific endpoint from user
    }
    
    return provider_urls.get(provider, "https://api.openai.com/v1")
