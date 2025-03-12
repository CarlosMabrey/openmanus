from openai import OpenAI


def ask_ollama(prompt: str, model: str = "llama3"):
    """使用 OpenAI SDK 调用 Ollama 本地模型"""

    client = OpenAI(
        base_url="http://localhost:11434/v1",
        api_key="ollama"
    )

    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.7,
        max_tokens=512
    )

    return response.choices[0].message.content


# 使用示例
if __name__ == "__main__":
    answer = ask_ollama("你是谁", "qwq:latest")
    print(answer)