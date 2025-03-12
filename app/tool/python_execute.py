import threading
import traceback
from typing import Dict

from app.tool.base import BaseTool


class PythonExecute(BaseTool):
    """A tool for executing Python code with timeout and safety restrictions."""

    name: str = "python_execute"
    description: str = "Executes Python code string. Note: Only print outputs are visible, function return values are not captured. Use print statements to see results."
    parameters: dict = {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "The Python code to execute.",
            },
        },
        "required": ["code"],
    }

    async def execute(
        self,
        code: str,
        timeout: int = 5,
    ) -> Dict:
        """
        Executes the provided Python code with a timeout.

        Args:
            code (str): The Python code to execute.
            timeout (int): Execution timeout in seconds.

        Returns:
            Dict: Contains 'output' with execution output or error message and 'success' status.
        """
        if not code or not isinstance(code, str):
            return {
                "observation": "Error: No code provided or invalid code format",
                "success": False
            }
            
        # Check if the code looks like HTML
        if code.strip().startswith('<!DOCTYPE') or code.strip().startswith('<html') or '<body>' in code:
            return {
                "observation": "Error: The provided content appears to be HTML, not Python code. Please provide valid Python code.",
                "success": False,
                "error_type": "invalid_code_format",
                "details": "HTML content cannot be executed as Python code."
            }
        
        # Pre-process code to handle potential issues
        try:
            # Check for common syntax issues
            code = self._sanitize_code(code)
            
            # Try to compile the code first to catch syntax errors
            compile(code, '<string>', 'exec')
        except SyntaxError as e:
            return {
                "observation": f"Syntax error: {str(e)} ({e.lineno}, {e.offset})\n{e.text if hasattr(e, 'text') else ''}",
                "success": False,
                "error_type": "syntax_error",
                "line_number": e.lineno,
                "line_text": e.text if hasattr(e, 'text') else None
            }
        except Exception as e:
            return {
                "observation": f"Code preprocessing error: {str(e)}",
                "success": False
            }

        result = {"observation": "", "success": True}

        def run_code():
            try:
                safe_globals = {"__builtins__": dict(__builtins__)}

                import sys
                from io import StringIO

                output_buffer = StringIO()
                sys.stdout = output_buffer

                exec(code, safe_globals, {})

                sys.stdout = sys.__stdout__

                result["observation"] = output_buffer.getvalue()

            except Exception as e:
                result["observation"] = f"Python execution failed:\n{str(e)}\n\n{traceback.format_exc()}"
                result["success"] = False

        thread = threading.Thread(target=run_code)
        thread.start()
        thread.join(timeout)

        if thread.is_alive():
            return {
                "observation": f"Execution timeout after {timeout} seconds",
                "success": False,
            }

        return result
    
    def _sanitize_code(self, code: str) -> str:
        """
        Sanitize the code to fix common issues that might cause execution problems.
        
        Args:
            code (str): The Python code to sanitize
            
        Returns:
            str: Sanitized code
        """
        # Remove any leading/trailing whitespace
        code = code.strip()
        
        # If code is empty, return a simple pass statement
        if not code:
            return "pass"
            
        # Check if the code looks like HTML or other non-Python content
        if code.startswith('<!DOCTYPE') or code.startswith('<html') or '<body>' in code:
            raise SyntaxError("The provided content appears to be HTML, not Python code")
            
        # Split into lines for processing
        lines = code.split('\n')
        sanitized_lines = []
        
        # Check if we need to fix indentation
        first_line_indent = len(lines[0]) - len(lines[0].lstrip())
        needs_dedent = first_line_indent > 0
        
        for i, line in enumerate(lines):
            # Skip empty lines
            if not line.strip():
                sanitized_lines.append(line)
                continue
                
            # Fix indentation if needed
            if needs_dedent and i > 0:
                # Only dedent if the line has at least as much indentation as the first line
                if len(line) - len(line.lstrip()) >= first_line_indent:
                    line = line[first_line_indent:]
            
            # Fix line continuation issues
            if line.rstrip().endswith('\\'):
                # Remove any spaces or tabs after the backslash
                line = line.rstrip()[:-1] + '\\'
            
            # Check for unclosed brackets
            if '[' in line and ']' not in line:
                # If this is the last line or the next line doesn't contain ']'
                if i == len(lines) - 1 or ']' not in lines[i+1]:
                    # Add a closing bracket
                    line = line + ']'
                    
            # Check for unclosed parentheses
            if '(' in line and ')' not in line:
                # If this is the last line or the next line doesn't contain ')'
                if i == len(lines) - 1 or ')' not in lines[i+1]:
                    # Add a closing parenthesis
                    line = line + ')'
                    
            # Check for unclosed braces
            if '{' in line and '}' not in line:
                # If this is the last line or the next line doesn't contain '}'
                if i == len(lines) - 1 or '}' not in lines[i+1]:
                    # Add a closing brace
                    line = line + '}'
            
            sanitized_lines.append(line)
        
        return '\n'.join(sanitized_lines)
