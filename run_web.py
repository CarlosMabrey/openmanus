# Import compatibility layer first to ensure it's applied before any other modules
import app.compat

import uvicorn
import traceback
import sys
import logging
import os
import socket
from contextlib import closing

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("run_web")

def find_free_port(start_port=8080, max_attempts=10):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + max_attempts):
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.settimeout(2)
            result = sock.connect_ex(('127.0.0.1', port))
            if result != 0:  # Port is available
                return port
    return None  # No free ports found in range

try:
    from main import app
    
    if __name__ == "__main__":
        # Get port from environment variable or use default
        port = int(os.environ.get("OPENMANUS_PORT", 8080))
        host = os.environ.get("OPENMANUS_HOST", "127.0.0.1")
        
        # Check if the specified port is available
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as sock:
            sock.settimeout(2)
            result = sock.connect_ex((host, port))
            
        if result == 0:  # Port is in use
            logger.warning(f"Port {port} is already in use")
            free_port = find_free_port(port + 1)
            
            if free_port:
                logger.info(f"Found free port: {free_port}")
                port = free_port
            else:
                logger.error("No free ports found. Please specify a different port using OPENMANUS_PORT environment variable")
                sys.exit(1)
        
        logger.info(f"Starting OpenManus web interface at http://{host}:{port}")
        uvicorn.run(app, host=host, port=port)
except Exception as e:
    logger.error(f"Failed to start OpenManus: {e}")
    traceback.print_exc()
    sys.exit(1)