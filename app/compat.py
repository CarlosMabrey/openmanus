"""
Compatibility module for handling Python version differences.

This module provides compatibility layers for Python versions,
particularly focusing on collections abstract base classes which were moved in Python 3.10.
It also sets up global exception handling for asyncio tasks to prevent silent failures.

Usage:
    This module should be imported before any other modules in the application's entry points
    to ensure the compatibility patches are applied before other modules are loaded.

    import app.compat  # Import this first
    # Then import other modules
"""

import sys
import importlib
import logging
import asyncio
import traceback
import threading
import functools

# Configure simple logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("compat")

# Global flag to track if patches have been applied
_patches_applied = False
_patches_lock = threading.Lock()

def apply_collections_patches():
    """
    Apply compatibility patches for collections abstract base classes
    that were moved from collections to collections.abc in Python 3.10.
    
    Returns:
        bool: True if patches were applied, False otherwise
    """
    global _patches_applied
    
    # Only apply patches once
    with _patches_lock:
        if _patches_applied:
            return True
        
        # Only apply patches for Python 3.10+
        if sys.version_info < (3, 10):
            logger.info("Collections compatibility not needed for Python version < 3.10")
            _patches_applied = True
            return False
    
    try:
        logger.info("Applying collections.abc compatibility layer for Python 3.10+")
        import collections.abc
        import collections

        # Complete list of abstract base classes moved from collections to collections.abc
        abc_classes = [
            'AsyncGenerator', 'AsyncIterable', 'AsyncIterator',
            'Awaitable', 'ByteString', 'Callable', 'Collection',
            'Container', 'Coroutine', 'Generator', 'Hashable',
            'ItemsView', 'Iterable', 'Iterator', 'KeysView',
            'Mapping', 'MappingView', 'MutableMapping', 'MutableSequence',
            'MutableSet', 'Reversible', 'Sequence', 'Set', 'Sized',
            'ValuesView'
        ]

        # Apply all patches
        patched_count = 0
        for cls_name in abc_classes:
            if hasattr(collections.abc, cls_name) and not hasattr(collections, cls_name):
                setattr(collections, cls_name, getattr(collections.abc, cls_name))
                logger.debug(f"Patched collections.{cls_name}")
                patched_count += 1

        # Explicitly set the most commonly used ones to ensure they're patched
        # These are the ones that cause the most issues in libraries
        critical_classes = [
            ('MutableSet', collections.abc.MutableSet),
            ('MutableMapping', collections.abc.MutableMapping),
            ('Mapping', collections.abc.Mapping),
            ('Set', collections.abc.Set),
            ('Sequence', collections.abc.Sequence)
        ]
        
        for name, cls in critical_classes:
            setattr(collections, name, cls)
            
        with _patches_lock:
            _patches_applied = True
            
        logger.info(f"Collections compatibility layer applied successfully (patched {patched_count} classes)")
        return True
    except Exception as e:
        logger.error(f"Error applying collections compatibility layer: {e}")
        traceback.print_exc()
        return False

# Apply patches immediately on import
apply_collections_patches()

# Setup exception handling for asyncio tasks
def setup_exception_handling():
    """
    Set up a global exception handler for asyncio tasks.
    This helps catch and log exceptions that would otherwise be lost.
    
    Returns:
        bool: True if handler was installed, False otherwise
    """
    try:
        # Get the current event loop, create one if needed
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        # Store the original exception handler
        original_handler = loop.get_exception_handler()
        
        def custom_exception_handler(loop, context):
            """Custom exception handler that logs detailed exception information"""
            # Extract exception details
            exception = context.get('exception')
            message = context.get('message')
            future = context.get('future')
            
            # Log the exception
            if exception:
                formatted_tb = ''.join(traceback.format_exception(
                    type(exception), exception, exception.__traceback__
                ))
                logger.error(f"Unhandled exception in asyncio task: {message}\n{formatted_tb}")
            else:
                logger.error(f"Unhandled exception in asyncio task: {message}")
            
            # Call the original handler if it exists
            if original_handler:
                original_handler(loop, context)
        
        # Set our custom exception handler
        loop.set_exception_handler(custom_exception_handler)
        logger.info("Global asyncio exception handler installed")
        return True
    except Exception as e:
        logger.error(f"Failed to setup exception handling: {e}")
        traceback.print_exc()
        return False

# Check for any other Python version-specific compatibility issues
def check_version_compatibility():
    """
    Check for other version-specific compatibility issues
    
    Returns:
        dict: Dictionary of compatibility warnings or issues
    """
    issues = {}
    
    # Check Python version
    python_version = sys.version_info
    if python_version < (3, 8):
        issues["python_version"] = f"Python {python_version.major}.{python_version.minor} is below recommended version 3.8+"
    
    # Check other dependencies as needed
    
    return issues

# Call this during application startup
try:
    setup_exception_handling()
except Exception as e:
    logger.error(f"Failed to setup exception handling: {e}")

# Run version compatibility check
compatibility_issues = check_version_compatibility()
if compatibility_issues:
    for issue, message in compatibility_issues.items():
        logger.warning(f"Compatibility issue: {message}") 