# Import compatibility layer for Python version differences
# This MUST be imported before any other modules to apply patches
import app.compat

import datetime
import json
import os
from typing import Optional, Dict, Any

import asyncio
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse
from sse_starlette.sse import EventSourceResponse
from uuid import uuid4
from contextlib import asynccontextmanager
from pydantic import BaseModel, Field, validator

from app.agent.manus import Manus
from app.logger import logger
from app.httpx_helper import cleanup_all_clients
from app.llm import AuthError, RateLimitError, ServiceError

# Global state
active_tasks = {}

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize on startup
    logger.info("Starting OpenManus web server")
    
    # Create workspace directory if it doesn't exist
    workspace_dir = os.path.join(os.path.dirname(__file__), "workspace")
    os.makedirs(workspace_dir, exist_ok=True)
    
    yield
    
    # Cleanup all tasks on shutdown
    logger.info("Shutting down OpenManus web server")
    for task_id in list(active_tasks.keys()):
        await stop_task(task_id)
    
    # Clean up any remaining httpx clients
    await cleanup_all_clients()

# Create app
app = FastAPI(
    title="OpenManus API",
    description="API for the OpenManus AI agent platform",
    version="0.1.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Request data model
class ExecuteRequest(BaseModel):
    deploy_type: str = Field(..., description="Deployment type: 'local' or 'cloud'")
    model_name: str = Field(..., description="LLM model name to use")
    api_key: Optional[str] = Field(None, description="API key for cloud models")
    prompt: str = Field(..., description="User input prompt")
    
    @validator('deploy_type')
    def validate_deploy_type(cls, v):
        if v not in ['local', 'cloud']:
            raise ValueError("deploy_type must be 'local' or 'cloud'")
        return v
        
    @validator('prompt')
    def validate_prompt(cls, v):
        if not v.strip():
            raise ValueError("Prompt cannot be empty")
        return v.strip()
        
    @validator('api_key')
    def validate_api_key(cls, v, values):
        if values.get('deploy_type') == 'cloud' and (not v or len(v.strip()) < 20):
            raise ValueError("API key is required for cloud models and must be valid")
        return v


@app.get("/")
async def root():
    """Redirect to the web interface"""
    return RedirectResponse(url="/static/index.html")


@app.post("/execute")
async def execute_request(request: ExecuteRequest):
    """Start an execution task and return the task ID"""
    try:
        # Create a new task ID
        task_id = str(uuid4())
        
        # Create message queue for this task
        queue = asyncio.Queue()
        
        # Store task info
        active_tasks[task_id] = {
            "queue": queue,
            "task": None,
            "status": "initializing",
            "start_time": datetime.datetime.now().isoformat(),
            "model": request.model_name,
        }
        
        # Start the agent task
        task = asyncio.create_task(
            run_agent_task(
                task_id, 
                request.model_name, 
                request.api_key, 
                request.prompt, 
                queue
            )
        )
        
        # Store the task object for later cancellation if needed
        active_tasks[task_id]["task"] = task
        active_tasks[task_id]["status"] = "running"
        
        # Return the task ID for client to use with /stream endpoint
        return {"task_id": task_id, "status": "running"}
    
    except Exception as e:
        logger.error(f"Error creating task: {str(e)}")
        raise HTTPException(500, f"Error creating task: {str(e)}")


@app.get("/stream/{task_id}")
async def stream_results(task_id: str):
    """Stream the results of a task using server-sent events"""
    if task_id not in active_tasks:
        raise HTTPException(404, f"Task {task_id} not found")
    
    queue = active_tasks[task_id]["queue"]
    
    async def event_generator():
        try:
            # Initial connection message
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "info",
                    "content": f"Connected to task {task_id}",
                    "timestamp": datetime.datetime.now().isoformat()
                })
            }
            
            while True:
                # Wait for messages from the queue
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=1.0)
                    
                    # Check for end message
                    if msg.get("type") == "end":
                        yield {
                            "event": "message",
                            "data": json.dumps({
                                **msg,
                                "timestamp": datetime.datetime.now().isoformat()
                            })
                        }
                        break
                        
                    # Send the message
                    yield {
                        "event": "message",
                        "data": json.dumps({
                            **msg,
                            "timestamp": datetime.datetime.now().isoformat()
                        })
                    }
                except asyncio.TimeoutError:
                    # Check if the task is still active
                    if task_id not in active_tasks:
                        yield {
                            "event": "message",
                            "data": json.dumps({
                                "type": "error",
                                "content": "Task was stopped or does not exist",
                                "timestamp": datetime.datetime.now().isoformat()
                            })
                        }
                        break
                        
                    # Check task status
                    task_status = active_tasks[task_id]["status"]
                    if task_status == "error":
                        yield {
                            "event": "message",
                            "data": json.dumps({
                                "type": "error",
                                "content": "Task encountered an error",
                                "timestamp": datetime.datetime.now().isoformat()
                            })
                        }
                        break
        except Exception as e:
            # Log any streaming errors
            logger.error(f"Error in stream for task {task_id}: {str(e)}")
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "error",
                    "content": f"Error in stream: {str(e)}",
                    "timestamp": datetime.datetime.now().isoformat()
                })
            }
        finally:
            # Send final event to signal the stream is closed
            yield {
                "event": "message",
                "data": json.dumps({
                    "type": "info",
                    "content": "Stream closed",
                    "timestamp": datetime.datetime.now().isoformat()
                })
            }
            
    return EventSourceResponse(event_generator())


@app.post("/stop/{task_id}")
async def stop_execution(task_id: str):
    """Stop a running task"""
    if task_id not in active_tasks:
        raise HTTPException(404, f"Task {task_id} not found")
    
    await stop_task(task_id)
    return {"status": "stopped", "task_id": task_id}


@app.post("/user_response/{task_id}")
async def submit_user_response(task_id: str, request: Request):
    """Submit a user response to a question from the agent"""
    if task_id not in active_tasks:
        raise HTTPException(404, f"Task {task_id} not found")
    
    # Get the task info
    task_info = active_tasks[task_id]
    
    try:
        # Get the user response from the request body
        data = await request.json()
        response = data.get("response", "")
        
        # Get the agent instance
        agent = task_info.get("agent")
        
        if not agent:
            raise HTTPException(500, "Agent not found for this task")
            
        # Set the user response
        agent.set_user_input(response)
        
        # Send an acknowledgement to the event stream
        await task_info["queue"].put({
            "type": "info",
            "content": f"User response received: {response[:50]}..." if len(response) > 50 else response
        })
        
        return {"status": "success", "message": "Response submitted"}
    except Exception as e:
        logger.error(f"Error submitting user response: {str(e)}")
        raise HTTPException(500, f"Error submitting response: {str(e)}")


async def run_agent_task(task_id: str, model: str, api_key: str, prompt: str, queue: asyncio.Queue):
    """Run the agent task and put results in the queue"""
    try:
        # Setup custom logging function that writes to the queue
        def custom_log(msg):
            # Convert different message types to a consistent format
            if isinstance(msg, str):
                msg_data = {"type": "log", "content": msg}
            elif isinstance(msg, dict):
                msg_data = msg
            else:
                msg_data = {"type": "log", "content": str(msg)}
                
            # Add the message to the queue
            asyncio.create_task(queue.put(msg_data))
        
        # Initialize the agent with custom logging
        agent = Manus(
            model=model,
            api_key=api_key,
            custom_log_fn=custom_log,
            max_steps=20  # Increase from default 10 to 20 steps
        )
        
        # Store the agent instance in the active tasks
        if task_id in active_tasks:
            active_tasks[task_id]["agent"] = agent
        
        # Log the start
        await queue.put({
            "type": "info",
            "content": f"Starting agent with model: {model}"
        })
        
        # Run the agent
        result = await agent.run(prompt)
        
        # Process the agent results
        if isinstance(result, dict) and 'details' in result and 'summary' in result:
            # First send a high-level summary of steps
            if result.get('summary') and isinstance(result['summary'], list):
                summary_html = "<ul class='list-disc list-inside space-y-1 mt-2'>"
                for item in result['summary']:
                    summary_html += f"<li>{item}</li>"
                summary_html += "</ul>"
                
                await queue.put({
                    "type": "summary",
                    "content": summary_html
                })
            
            # Send each step detail individually for better visibility
            if result.get('details') and isinstance(result['details'], list):
                for step in result['details']:
                    # Skip empty or None steps
                    if not step or not isinstance(step, dict):
                        continue
                        
                    step_type = step.get('type', 'log')
                    step_content = step.get('content', '')
                    
                    # Send the step to the client
                    await queue.put({
                        "type": step_type,
                        "content": step_content,
                        "step": step.get('step'),
                        "tool": step.get('tool')
                    })
        
        # Log completion
        await queue.put({
            "type": "success",
            "content": "Agent task completed successfully",
            "result": result
        })
        
        # Send end message
        await queue.put({"type": "end"})
        
        # Update task status
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = "completed"
            
    except AuthError as e:
        # Handle authentication errors
        error_msg = f"Authentication failed: {str(e)}"
        logger.error(error_msg)
        
        # Send error message to the client
        await queue.put({
            "type": "error",
            "content": "API key authentication failed",
            "details": str(e)
        })
        
        # Send end message
        await queue.put({"type": "end"})
        
        # Update task status
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = "failed"
            active_tasks[task_id]["error"] = error_msg
    
    except Exception as e:
        # Log the full exception details
        import traceback
        error_trace = traceback.format_exc()
        error_msg = f"Agent execution failed: {str(e)}"
        logger.error(error_msg)
        logger.error(f"Traceback: {error_trace}")
        
        # Send detailed error to the client
        await queue.put({
            "type": "error",
            "content": f"An error occurred while processing your request: {str(e)}",
            "details": {
                "error_type": type(e).__name__,
                "message": str(e),
                "traceback": error_trace.split("\n")[-5:] if error_trace else None  # Send last 5 lines of traceback
            }
        })
        
        # Try to provide a helpful message based on the error type
        if "api key" in str(e).lower() or "apikey" in str(e).lower():
            await queue.put({
                "type": "info",
                "content": "This appears to be an API key issue. Please ensure you've provided a valid API key for the selected model."
            })
        elif "timeout" in str(e).lower():
            await queue.put({
                "type": "info",
                "content": "The request timed out. This could be due to high server load or network issues. Please try again later."
            })
        elif "rate limit" in str(e).lower():
            await queue.put({
                "type": "info",
                "content": "You've hit a rate limit with the API provider. Please wait a while before trying again."
            })
        
        # Send end message
        await queue.put({"type": "end"})
        
        # Update task status
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = "failed"
            active_tasks[task_id]["error"] = error_msg
    
    finally:
        # Cleanup regardless of success or failure
        logger.info(f"Task {task_id} completed execution")
        
        # Make sure all queued messages are processed
        if queue.qsize() > 0:
            logger.info(f"Waiting for {queue.qsize()} remaining messages to be processed")
            
        # Ensure an end message is sent
        if task_id in active_tasks and active_tasks[task_id]["status"] not in ["completed", "failed"]:
            active_tasks[task_id]["status"] = "completed"
            await queue.put({"type": "end"})


async def stop_task(task_id: str):
    """Stop a task and clean up its resources"""
    if task_id not in active_tasks:
        return
        
    task_info = active_tasks[task_id]
    
    # Cancel the task if it's running
    if task_info["task"] and not task_info["task"].done():
        task_info["task"].cancel()
        
        try:
            # Wait for the task to be cancelled
            await asyncio.wait_for(task_info["task"], timeout=2.0)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            pass
            
    # Update status
    task_info["status"] = "stopped"
    
    # Clean up queue
    if task_info["queue"]:
        try:
            # Try to send a final message
            await task_info["queue"].put({
                "type": "info",
                "content": "Task was manually stopped"
            })
            await task_info["queue"].put({"type": "end"})
        except Exception:
            pass
            
    # Remove from active tasks
    active_tasks.pop(task_id, None)


# Error handler for validation errors
@app.exception_handler(Exception)
async def validation_exception_handler(request: Request, exc: Exception):
    """Handle validation errors and return a proper JSON response"""
    if hasattr(exc, 'errors'):
        # Handle Pydantic validation errors
        error_details = []
        for error in exc.errors():
            error_details.append({
                "loc": error["loc"],
                "msg": error["msg"],
                "type": error["type"]
            })
        return JSONResponse(
            status_code=400,
            content={"detail": "Validation error", "errors": error_details}
        )
    elif isinstance(exc, HTTPException):
        # Pass through HTTPExceptions
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail}
        )
    else:
        # Handle any other exception
        logger.error(f"Unhandled exception: {str(exc)}")
        return JSONResponse(
            status_code=500,
            content={"detail": f"Server error: {str(exc)}"}
        )


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8080, reload=True)
