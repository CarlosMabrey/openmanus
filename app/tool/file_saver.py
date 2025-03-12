import asyncio
import os
import mimetypes
import uuid
import time
from pathlib import Path

import aiofiles

from app.tool.base import BaseTool


class FileSaver(BaseTool):
    name: str = "file_saver"
    description: str = """Save content to a local file at a specified path.
Use this tool when you need to save text, code, or generated content to a file on the local filesystem.
The tool accepts content and a file path, and saves the content to that location.
Files will be saved in the workspaces/generated/{project_name} directory.
"""
    parameters: dict = {
        "type": "object",
        "properties": {
            "content": {
                "type": "string",
                "description": "(required) The content to save to the file.",
            },
            "file_path": {
                "type": "string",
                "description": "(required) The path where the file should be saved, including filename and extension.",
            },
            "mode": {
                "type": "string",
                "description": "(optional) The file opening mode. Default is 'w' for write. Use 'a' for append.",
                "enum": ["w", "a"],
                "default": "w",
            },
            "display_in_ui": {
                "type": "boolean",
                "description": "(optional) Whether to display this file in the UI. Default is true for HTML files.",
                "default": None,
            },
            "project_name": {
                "type": "string",
                "description": "(optional) The project name to organize files. If not provided, a default project will be created.",
                "default": None,
            },
        },
        "required": ["content", "file_path"],
    }

    async def execute(self, content: str, file_path: str, mode: str = "w", display_in_ui: bool = None, project_name: str = None) -> str:
        """
        Save content to a file at the specified path.

        Args:
            content (str): The content to save to the file.
            file_path (str): The path where the file should be saved.
            mode (str, optional): The file opening mode. Default is 'w' for write. Use 'a' for append.
            display_in_ui (bool, optional): Whether to display this file in the UI.
            project_name (str, optional): The project name to organize files.

        Returns:
            str: A message indicating the result of the operation.
        """
        try:
            # Determine project name and session ID
            if not project_name:
                # Try to get a unique project name for this chat session
                # This uses a simple approach with timestamp and random ID
                project_name = f"project_{int(time.time())}_{str(uuid.uuid4())[:8]}"
            
            # Get the file extension and base name
            _, file_extension = os.path.splitext(file_path)
            file_extension = file_extension.lstrip('.')
            file_name = os.path.basename(file_path)
            
            # Create the workspaces directory structure
            workspaces_dir = Path('workspaces')
            if not workspaces_dir.exists():
                workspaces_dir.mkdir(exist_ok=True)
                
            generated_dir = workspaces_dir / 'generated'
            if not generated_dir.exists():
                generated_dir.mkdir(exist_ok=True)
                
            # Create project directory
            project_dir = generated_dir / project_name
            if not project_dir.exists():
                project_dir.mkdir(exist_ok=True)
            
            # Create file type subdirectory
            if file_extension:
                type_dir = project_dir / file_extension
            else:
                type_dir = project_dir / 'text'
            
            if not type_dir.exists():
                type_dir.mkdir(exist_ok=True)
                
            # Full path in the project directory
            full_path = type_dir / file_name
            
            # Ensure we have a unique filename by adding a number if needed
            counter = 1
            original_name = Path(file_name).stem
            while full_path.exists():
                new_name = f"{original_name}_{counter}.{file_extension}" if file_extension else f"{original_name}_{counter}"
                full_path = type_dir / new_name
                counter += 1
            
            # Determine mime type for UI display
            mime_type, _ = mimetypes.guess_type(file_name)
            if mime_type is None:
                if file_extension == 'md':
                    mime_type = 'text/markdown'
                elif file_extension == 'py':
                    mime_type = 'text/x-python'
                elif file_extension == 'js':
                    mime_type = 'text/javascript'
                elif file_extension == 'css':
                    mime_type = 'text/css'
                elif file_extension == 'json':
                    mime_type = 'application/json'
                else:
                    mime_type = 'text/plain'
            
            # Determine if we should display in UI if not explicitly provided
            if display_in_ui is None:
                # Auto-display HTML, images, markdown, and common code files
                display_in_ui = mime_type and (
                    mime_type.startswith('text/html') or 
                    mime_type.startswith('image/') or 
                    mime_type == 'text/markdown' or
                    mime_type == 'text/javascript' or
                    mime_type == 'text/css' or
                    mime_type == 'text/x-python' or
                    mime_type == 'application/json'
                )
            
            # Write directly to the file
            async with aiofiles.open(full_path, mode, encoding="utf-8") as file:
                await file.write(content)
            
            # Create the response with metadata for the UI
            result = {
                "message": f"Content successfully saved to {full_path}",
                "file_path": str(full_path),
                "mime_type": mime_type,
                "display_in_ui": display_in_ui,
                "file_name": file_name,
                "project_name": project_name
            }
            
            return result
        except Exception as e:
            return {"message": f"Error saving file: {str(e)}", "error": True}

