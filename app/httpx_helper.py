"""
Helper module for managing httpx clients properly.

This module provides utility functions to create, use, and properly clean up httpx clients,
preventing issues with asyncio tasks and transport handling.
"""

import asyncio
import httpx
import logging
import weakref
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# Global client registry to ensure proper cleanup - use WeakValueDictionary for automatic cleanup
_http_clients = weakref.WeakValueDictionary()
_registry_lock = asyncio.Lock()

@asynccontextmanager
async def get_http_client(timeout=30.0, **kwargs):
    """
    Context manager that provides an httpx AsyncClient and ensures proper cleanup.
    
    Args:
        timeout: Request timeout in seconds
        **kwargs: Additional arguments to pass to httpx.AsyncClient
        
    Yields:
        httpx.AsyncClient: Configured async HTTP client
    """
    # Get a unique identifier for the current task
    current_task = asyncio.current_task()
    if current_task is None:
        # If not in a task context, use a unique ID
        task_id = id(object())
    else:
        task_id = id(current_task)
    
    client = None
    try:
        # Create a new client
        client = httpx.AsyncClient(timeout=timeout, **kwargs)
        
        # Store the client for proper cleanup, with lock to prevent race conditions
        async with _registry_lock:
            _http_clients[task_id] = client
        
        # Count active clients for monitoring
        client_count = len(_http_clients)
        if client_count > 10:  # Warn if too many clients
            logger.warning(f"High number of active httpx clients: {client_count}")
        
        # Yield the client for use
        yield client
    finally:
        # Clean up the client properly if it was created
        if client is not None:
            try:
                # Properly close the client
                if not getattr(client, "_is_closed", False):
                    await client.aclose()
            except Exception as e:
                logger.warning(f"Error closing httpx client: {e}")
            finally:
                # Remove from registry with lock
                async with _registry_lock:
                    if task_id in _http_clients:
                        del _http_clients[task_id]

async def cleanup_all_clients():
    """
    Clean up all registered httpx clients.
    This should be called during application shutdown.
    """
    # Make a copy of the keys to prevent modification during iteration
    async with _registry_lock:
        client_ids = list(_http_clients.keys())
    
    close_count = 0
    for task_id in client_ids:
        async with _registry_lock:
            client = _http_clients.get(task_id)
        
        if client:
            try:
                if not getattr(client, "_is_closed", False):
                    await client.aclose()
                    close_count += 1
            except Exception as e:
                logger.warning(f"Error closing httpx client for task {task_id}: {e}")
            finally:
                async with _registry_lock:
                    if task_id in _http_clients:
                        del _http_clients[task_id]
    
    logger.info(f"Cleaned up {close_count} httpx clients")
    
    # Final check for any remaining clients
    async with _registry_lock:
        remaining = len(_http_clients)
    
    if remaining > 0:
        logger.warning(f"There are still {remaining} httpx clients in the registry after cleanup") 