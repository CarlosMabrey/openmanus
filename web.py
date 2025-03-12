# Import compatibility layer for Python version differences
# This MUST be imported before any other modules to apply patches
import app.compat

import datetime
import json
import base64
import os
from typing import Optional

import asyncio
import uvicorn
from starlette.applications import Starlette
from starlette.routing import Route
from sse_starlette.sse import EventSourceResponse


from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse # type: ignore
import asyncio
from uuid import uuid4
from contextlib import asynccontextmanager
from pydantic import BaseModel

from starlette.responses import RedirectResponse
from starlette.staticfiles import StaticFiles

from app.agent.manus import Manus
from app.logger import logger

import httpx

# Global state
active_tasks = {}
browser_screenshots = {}  # Store browser screenshots by task_id

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize on startup
    logger.info("Starting OpenManus web server")
    yield
    # Cleanup all tasks on shutdown
    logger.info("Shutting down OpenManus web server")
    for task_id in list(active_tasks.keys()):
        await stop_task(task_id)

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

# Request data models
class ExecuteRequest(BaseModel):
    deploy_type: str  # local/cloud
    model_name: str
    api_key: Optional[str] = None
    prompt: str
    max_steps: Optional[int] = 30  # Default to 30 steps
    verbosity: Optional[str] = "normal"  # concise, normal, or detailed

class UserResponse(BaseModel):
    response: str

class BrowserScreenshot(BaseModel):
    image_data: str  # Base64 encoded image
    url: str
    title: Optional[str] = None


@app.get("/")
async def root():
    """Redirect to the web interface"""
    return RedirectResponse(url="/static/index.html")


@app.post("/execute")
async def execute_request(request: ExecuteRequest):
    """Start an execution task and return the task ID"""
    # Parameter validation
    if request.deploy_type == "cloud" and not request.api_key:
        raise HTTPException(400, "API key required for cloud models")
    
    if not request.prompt.strip():
        raise HTTPException(400, "Prompt cannot be empty")
    
    # Validate verbosity
    if request.verbosity not in ["concise", "normal", "detailed"]:
        logger.warning(f"Invalid verbosity setting '{request.verbosity}', defaulting to 'normal'")
        request.verbosity = "normal"
    
    # Validate max_steps
    if request.max_steps is not None:
        if request.max_steps < 1:
            raise HTTPException(400, "max_steps must be at least 1")
        if request.max_steps > 100:
            raise HTTPException(400, "max_steps cannot exceed 100")
    else:
        # Default to 30 steps if not specified
        request.max_steps = 30
    
    # Generate task ID
    task_id = str(uuid4())
    
    # Create message queues
    message_queue = asyncio.Queue()
    user_response_queue = asyncio.Queue()
    
    # Store task data
    active_tasks[task_id] = {
        "queue": message_queue,
        "user_response_queue": user_response_queue,
        "status": "running",
        "task": None,
        "agent": None
    }

    # Start task in background
    task = asyncio.create_task(
        run_agent_task(
            task_id=task_id,
            model=request.model_name,
            api_key=request.api_key or "",
            prompt=request.prompt,
            queue=message_queue,
            max_steps=request.max_steps,
            user_response_queue=user_response_queue,
            verbosity=request.verbosity
        )
    )
    
    active_tasks[task_id]["task"] = task
    
    logger.info(f"Started task {task_id} with model {request.model_name} and max_steps={request.max_steps}")
    
    return {"task_id": task_id}


@app.post("/pause/{task_id}")
async def pause_execution(task_id: str):
    """Pause a running task to wait for user input"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")
    
    active_tasks[task_id]["paused"] = True
    logger.info(f"Task {task_id} paused, waiting for user input")
    
    return {"status": "paused", "task_id": task_id}


@app.post("/resume/{task_id}")
async def resume_execution(task_id: str, user_response: UserResponse):
    """Resume a paused task with user input"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")
    
    if not active_tasks[task_id]["paused"]:
        raise HTTPException(400, "Task is not paused")
    
    # Add user response to the queue
    await active_tasks[task_id]["user_response_queue"].put(user_response.response)
    
    # Mark task as no longer paused
    active_tasks[task_id]["paused"] = False
    
    logger.info(f"Task {task_id} resumed with user response: {user_response.response}")
    
    return {"status": "resumed", "task_id": task_id}


@app.post("/stop/{task_id}")
async def stop_execution(task_id: str):
    """Stop a running task"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")
        
    await stop_task(task_id)
    return {"status": "stopped", "task_id": task_id}


@app.get("/stream/{task_id}")
async def stream_results(task_id: str):
    """Stream task execution results"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")

    queue = active_tasks[task_id]["queue"]

    async def event_generator():
        try:
            # Send initial connection message
            message = jsonable_encoder({
                "type": "info",
                "content": f"Connected to task {task_id}",
                "timestamp": datetime.datetime.now().isoformat()
            })
            yield f"data: {json.dumps(message)}\n\n"
            
            # Keep streaming while task is running or terminating
            while active_tasks.get(task_id, {}).get("status") in ["running", "terminate"]:
                try:
                    # Non-blocking queue message retrieval
                    raw_message = await asyncio.wait_for(queue.get(), timeout=1.0)
                    
                    # Handle different message types
                    if isinstance(raw_message, dict):
                        message_type = raw_message.get("type", "log")
                        content = raw_message.get("content", str(raw_message))
                    else:
                        message_type = "log"
                        content = str(raw_message)
                    
                    # Wrap as structured data
                    message = jsonable_encoder({
                        "type": message_type,
                        "content": content,
                        "timestamp": datetime.datetime.now().isoformat()
                    })
                    
                    # Strictly follow SSE format
                    yield f"data: {json.dumps(message)}\n\n"
                    queue.task_done()
                except asyncio.TimeoutError:
                    # Send heartbeat to keep connection alive
                    yield f": heartbeat\n\n"
                    continue
                except Exception as e:
                    logger.error(f"Error in event stream: {str(e)}")
                    message = jsonable_encoder({
                        "type": "error",
                        "content": f"Stream error: {str(e)}",
                        "timestamp": datetime.datetime.now().isoformat()
                    })
                    yield f"data: {json.dumps(message)}\n\n"
            
            # Process any remaining messages in the queue
            while not queue.empty():
                try:
                    raw_message = queue.get_nowait()
                    
                    # Handle different message types
                    if isinstance(raw_message, dict):
                        message_type = raw_message.get("type", "log")
                        content = raw_message.get("content", str(raw_message))
                    else:
                        message_type = "log"
                        content = str(raw_message)
                    
                    # Wrap as structured data
                    message = jsonable_encoder({
                        "type": message_type,
                        "content": content,
                        "timestamp": datetime.datetime.now().isoformat()
                    })
                    
                    # Strictly follow SSE format
                    yield f"data: {json.dumps(message)}\n\n"
                    queue.task_done()
                except Exception as e:
                    logger.error(f"Error processing remaining messages: {str(e)}")
                    break
            
            # Send completion message
            message = jsonable_encoder({
                "type": "info",
                "content": f"Task {task_id} completed",
                "timestamp": datetime.datetime.now().isoformat()
            })
            yield f"data: {json.dumps(message)}\n\n"
            
            # Add a small delay to ensure the client receives the final message
            await asyncio.sleep(0.5)
            
        finally:
            # Cleanup after task ends
            if task_id in active_tasks:
                logger.info(f"Cleaning up task {task_id}")
                del active_tasks[task_id]

    return EventSourceResponse(event_generator())


@app.post("/browser_screenshot/{task_id}")
async def save_browser_screenshot(task_id: str, screenshot: BrowserScreenshot):
    """Save a browser screenshot for a task"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")
    
    # Save the screenshot data
    browser_screenshots[task_id] = {
        "image_data": screenshot.image_data,
        "url": screenshot.url,
        "title": screenshot.title,
        "timestamp": datetime.datetime.now().isoformat()
    }
    
    # Send a message to the task queue about the new screenshot
    queue = active_tasks[task_id]["queue"]
    await queue.put({
        "type": "browser_screenshot",
        "content": {
            "url": screenshot.url,
            "title": screenshot.title,
            "timestamp": datetime.datetime.now().isoformat()
        }
    })
    
    return {"status": "success"}

@app.get("/browser_screenshot/{task_id}")
async def get_browser_screenshot(task_id: str):
    """Get the latest browser screenshot for a task"""
    if task_id not in browser_screenshots:
        raise HTTPException(404, "No screenshot found for this task")
    
    return browser_screenshots[task_id]


@app.post("/trigger_screenshot/{task_id}")
async def trigger_screenshot(task_id: str):
    """Trigger a browser screenshot for a task"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")
    
    # Get the agent from the task
    agent = active_tasks[task_id].get("agent")
    if not agent:
        raise HTTPException(400, "No agent available for this task")
    
    try:
        # Trigger a screenshot
        if hasattr(agent, "take_browser_screenshot"):
            await agent.take_browser_screenshot()
            return {"status": "success", "message": "Screenshot triggered"}
        else:
            raise HTTPException(400, "Agent does not support taking screenshots")
    except Exception as e:
        logger.error(f"Error triggering screenshot: {str(e)}")
        raise HTTPException(500, f"Error triggering screenshot: {str(e)}")


async def run_agent_task(task_id: str, model: str, api_key: str, prompt: str, queue: asyncio.Queue, max_steps: int = 30, user_response_queue: asyncio.Queue = None, verbosity: str = "normal"):
    """Core logic for executing an Agent task"""
    original_info = None
    try:
        # Initialize agent
        agent = Manus()
        agent.update_llm_config(model, api_key, max_tokens=1024, verbosity=verbosity)  # Set verbosity and limit completion tokens
        
        # Set max steps
        agent.max_steps = max_steps
        
        # Store agent in task data for screenshot triggering
        active_tasks[task_id]["agent"] = agent
        
        # Set up browser event handler
        def browser_event_handler(event_type, data):
            if event_type == "navigation":
                asyncio.create_task(queue.put({
                    "type": "browser_navigation",
                    "content": f"Navigating to: {data.get('url', 'unknown URL')}"
                }))
            elif event_type == "screenshot":
                # Save screenshot data
                screenshot_data = {
                    "image_data": data.get("image_data", ""),
                    "url": data.get("url", ""),
                    "title": data.get("title", "")
                }
                asyncio.create_task(save_browser_screenshot(task_id, BrowserScreenshot(**screenshot_data)))
        
        # Register browser event handler with agent if supported
        if hasattr(agent, "register_browser_event_handler"):
            agent.register_browser_event_handler(browser_event_handler)
        
        # Redirect logs to queue
        original_info = logger.info
        def custom_log(msg):
            original_info(msg)
            asyncio.create_task(queue.put({
                "type": "log",
                "content": str(msg)
            }))
        logger.info = custom_log

        # Send initial message
        await queue.put({
            "type": "info",
            "content": f"Initializing agent with model: {model} and max steps: {max_steps}"
        })

        # Process the prompt
        try:
            result = await agent.run(prompt, user_response_queue)
            
            # Ensure result is a valid dictionary
            if not isinstance(result, dict):
                logger.warning(f"Result is not a dict, converting: {type(result)}")
                if isinstance(result, str):
                    # If it's a string, create a simple response dict
                    result = {
                        "summary": ["Final response provided"],
                        "details": [{
                            "type": "final_response",
                            "content": result
                        }],
                        "conversation": []
                    }
                else:
                    # For any other type, convert to string and create response dict
                    result = {
                        "summary": ["Error in response format"],
                        "details": [{
                            "type": "error",
                            "content": f"Invalid response format: {str(result)}"
                        }],
                        "conversation": []
                    }
        except Exception as e:
            logger.error(f"Error running agent: {str(e)}")
            # Create an error response
            result = {
                "summary": ["Error occurred during execution"],
                "details": [{
                    "type": "error",
                    "content": f"Error running agent: {str(e)}"
                }],
                "conversation": []
            }
        
        # Send structured step results to the client
        if isinstance(result, dict):
            # Process each step in the details
            for step_result in result.get("details", []):
                # Get the message type and content
                msg_type = step_result.get("type", "log")
                content = step_result.get("content", "")
                
                # Ensure content is a string
                if not isinstance(content, str):
                    content = str(content)
                
                # Format the message for display based on type
                if msg_type == "question":
                    await queue.put({"type": "question", "content": content})
                elif msg_type == "user_response":
                    # User response is already displayed by the frontend
                    continue
                elif msg_type == "reasoning":
                    await queue.put({"type": "reasoning", "content": content})
                elif msg_type == "tool_usage":
                    await queue.put({"type": "tool", "content": content})
                elif msg_type == "tool_result":
                    await queue.put({"type": "tool_result", "content": content})
                elif msg_type == "final_response":
                    await queue.put({"type": "success", "content": content})
                elif msg_type == "error":
                    await queue.put({"type": "error", "content": content})
                elif msg_type == "status":
                    await queue.put({"type": "status", "content": content})
                else:
                    await queue.put({"type": "log", "content": content})
                
            # Send a summary at the end
            summary_html = "<h3>Summary of Actions Taken</h3><ul>"
            for summary in result.get("summary", []):
                summary_html += f"<li>{summary}</li>"
            summary_html += "</ul>"
            
            await queue.put({
                "type": "summary",
                "content": summary_html
            })
        else:
            # Fallback for string results (legacy format)
            await queue.put({
                "type": "success",
                "content": str(result)
            })
        
        # Send completion message
        await queue.put({
            "type": "status",
            "content": "Task completed successfully"
        })
        
        return result
        
    except Exception as e:
        error_msg = f"Error in agent execution: {str(e)}"
        logger.error(error_msg)
        await queue.put({
            "type": "error",
            "content": error_msg
        })
        return {"error": error_msg}
    finally:
        # Restore original logger
        if original_info:
            logger.info = original_info


async def stop_task(task_id: str):
    """Enhanced task termination function"""
    if task_id not in active_tasks:
        return False

    task_data = active_tasks[task_id]
    
    try:
        # Mark task as terminating
        task_data["status"] = "terminate"
        
        # Send termination signal to task queue
        await task_data["queue"].put({
            "type": "warning",
            "content": f"Terminating task {task_id}"
        })

        # Cancel async task
        task_data["task"].cancel()
        
        # Wait for task to complete cleanup
        try:
            await asyncio.wait_for(task_data["task"], timeout=5)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            logger.info(f"Task {task_id} cancelled")

    except Exception as e:
        logger.error(f"Error terminating task: {str(e)}")
    finally:
        # Ensure resources are cleaned up
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = "terminated"
        
        return True

@app.get("/browser_proxy")
async def browser_proxy(url: str):
    """Proxy requests to external websites to avoid CORS issues"""
    if not url:
        raise HTTPException(400, "URL parameter is required")
    
    try:
        # Create a client with appropriate headers
        async with httpx.AsyncClient(follow_redirects=True) as client:
            # Add headers to make the request look like a browser
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.5",
                "Connection": "keep-alive",
                "Upgrade-Insecure-Requests": "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Sec-Fetch-User": "?1",
                "Cache-Control": "max-age=0",
            }
            
            # Make the request
            response = await client.get(url, headers=headers)
            
            # Create a response with the same content type
            content_type = response.headers.get("content-type", "text/html")
            
            # If it's HTML, modify it to handle relative URLs
            if "text/html" in content_type:
                html_content = response.text
                
                # Add base tag to handle relative URLs
                base_tag = f'<base href="{url}">'
                html_content = html_content.replace("<head>", f"<head>{base_tag}")
                
                # Add sandbox to prevent scripts from running
                sandbox_script = """
                <script>
                    // Disable form submissions
                    document.addEventListener('submit', function(e) {
                        e.preventDefault();
                        return false;
                    }, true);
                    
                    // Intercept clicks on links
                    document.addEventListener('click', function(e) {
                        const link = e.target.closest('a');
                        if (link) {
                            e.preventDefault();
                            const href = link.getAttribute('href');
                            if (href && !href.startsWith('javascript:')) {
                                // Construct absolute URL
                                const absoluteUrl = new URL(href, window.location.href).href;
                                // Navigate through the proxy
                                window.location.href = '/browser_proxy?url=' + encodeURIComponent(absoluteUrl);
                            }
                            return false;
                        }
                    }, true);
                </script>
                """
                html_content = html_content.replace("</body>", f"{sandbox_script}</body>")
                
                return HTMLResponse(content=html_content, status_code=response.status_code)
            else:
                # For non-HTML content, just pass through
                return Response(
                    content=response.content,
                    status_code=response.status_code,
                    headers={"Content-Type": content_type}
                )
    except Exception as e:
        logger.error(f"Error proxying browser request: {str(e)}")
        return HTMLResponse(
            content=f"""
            <html>
                <body style="font-family: Arial, sans-serif; padding: 20px;">
                    <h2>Error loading page</h2>
                    <p>Could not load {url}</p>
                    <p>Error: {str(e)}</p>
                </body>
            </html>
            """,
            status_code=500
        )
