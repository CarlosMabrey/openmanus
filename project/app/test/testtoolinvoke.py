from openai import OpenAI

client = OpenAI(base_url="http://localhost:11434/v1", api_key="ollama")

response = client.chat.completions.create(
    model="qwen2.5:14b",
    messages=[{
        "role": "user",
        "content": "今天北京天气如何？"
    }],
    tools=[{
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "获取指定城市的天气信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"}
                }
            }
        }
    }]
)

# Check if response is valid
if not response.choices or not response.choices[0].message:
    print(response)
    raise ValueError("Invalid or empty response from LLM")

print(response.choices[0].message)