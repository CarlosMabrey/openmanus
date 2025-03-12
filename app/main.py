@app.post("/execute")
async def execute(request: Request):
    """
    Execute a prompt with the configured model
    """
    try:
        data = await request.json()
        
        # Get configuration parameters
        deploy_type = data.get("deploy_type", "local")
        model_name = data.get("model_name", "gpt4all-j")
        api_key = data.get("api_key")
        prompt = data.get("prompt")
        max_steps = min(int(data.get("max_steps", 30)), 100)  # Cap at 100 steps
        verbosity = data.get("verbosity", "normal")
        
        # Validate required parameters
        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt is required")
            
        if deploy_type not in ["local", "cloud"]:
            raise HTTPException(status_code=400, detail="Invalid deployment type")
            
        # Get provider from model name
        try:
            provider = get_provider_from_model(model_name)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
            
        # Create LLM settings
        settings = LLMSettings(
            provider=provider,
            model=model_name,
            api_key=api_key,
            max_tokens=4096,  # Will be adjusted based on verbosity
            temperature=0.7,
            verbosity=verbosity
        )
        
        # Create agent instance
        agent = Manus(settings=settings, max_steps=max_steps)
        
        # Generate task ID
        task_id = str(uuid.uuid4())
        
        # Store agent in active tasks
        active_tasks[task_id] = agent
        
        # Start background task
        background_tasks.add_task(agent.execute, prompt)
        
        return {"task_id": task_id}
        
    except Exception as e:
        logger.error(f"Error executing prompt: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e)) 