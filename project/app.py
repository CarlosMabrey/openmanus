import datetime
import json
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
# from sse_starlette.sse import EventSourceResponse
import asyncio
from uuid import uuid4
from contextlib import asynccontextmanager
from pydantic import BaseModel

from starlette.responses import RedirectResponse
from starlette.staticfiles import StaticFiles

from app.agent.manus import Manus
from app.logger import logger

# Global state
active_tasks = {}

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

# Request data model
class ExecuteRequest(BaseModel):
    deploy_type: str  # local/cloud
    model_name: str
    api_key: Optional[str] = None
    prompt: str


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

    task_id = str(uuid4())
    queue = asyncio.Queue()

    # Create background task
    task = asyncio.create_task(
        run_agent_task(task_id, request.model_name, request.api_key, request.prompt, queue)
    )

    # Store task state
    active_tasks[task_id] = {
        "task": task,
        "queue": queue,
        "status": "running",
        "start_time": datetime.datetime.now().isoformat()
    }

    logger.info(f"Started task {task_id} with model {request.model_name}")
    return {"task_id": task_id}


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
            
            # Send completion message
            message = jsonable_encoder({
                "type": "info",
                "content": f"Task {task_id} completed",
                "timestamp": datetime.datetime.now().isoformat()
            })
            yield f"data: {json.dumps(message)}\n\n"
            
        finally:
            # Cleanup after task ends
            if task_id in active_tasks:
                logger.info(f"Cleaning up task {task_id}")
                del active_tasks[task_id]

    return EventSourceResponse(event_generator())


@app.post("/stop/{task_id}")
async def stop_execution(task_id: str):
    """Stop a running task"""
    if task_id not in active_tasks:
        raise HTTPException(404, "Task not found")
        
    await stop_task(task_id)
    return {"status": "stopped", "task_id": task_id}


async def run_agent_task(task_id: str, model: str, api_key: str, prompt: str, queue: asyncio.Queue):
    """Core logic for executing an Agent task"""
    try:
        # Initialize agent
        agent = Manus()
        agent.update_llm_config(model, api_key)

        # Redirect logs to queue
        original_info = logger.info
        def custom_log(msg):
            original_info(msg)
            asyncio.create_task(queue.put(str(msg)))
        logger.info = custom_log

        # Send initial message
        await queue.put({
            "type": "info",
            "content": f"Initializing agent with model: {model}"
        })

        # Process the prompt
        result = await agent.run(prompt)
        
        # Send completion message
        await queue.put({
            "type": "success",
            "content": f"Task completed successfully: {result}"
        })
        
    except asyncio.CancelledError:
        logger.warning(f"Task {task_id} was forcibly cancelled")
        await queue.put({
            "type": "error",
            "content": "Task was terminated by user"
        })
    except Exception as e:
        logger.error(f"Error in task {task_id}: {str(e)}")
        await queue.put({
            "type": "error",
            "content": f"Error: {str(e)}"
        })
    finally:
        # Restore original logger
        logger.info = original_info
        
        # Mark task as completed
        if task_id in active_tasks:
            active_tasks[task_id]["status"] = "completed"


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