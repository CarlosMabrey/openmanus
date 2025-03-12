import asyncio
from app.agent.manus import Manus

async def test():
    agent = Manus()
    # Update LLM config with reduced token limits
    agent.update_llm_config("gpt-3.5-turbo", "", max_tokens=256)
    
    # Test a simple tool call
    print("Testing python_execute tool...")
    result = await agent.available_tools.execute(
        name="python_execute", 
        tool_input={"code": "print('Hello, world!')"}
    )
    print(f"Result: {result}")
    
    print("Testing google_search tool...")
    result = await agent.available_tools.execute(
        name="google_search", 
        tool_input={"query": "OpenAI"}
    )
    print(f"Result: {result}")

if __name__ == "__main__":
    asyncio.run(test()) 