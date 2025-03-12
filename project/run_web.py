import uvicorn

if __name__ == "__main__":
    print("Starting OpenManus web interface at http://localhost:8000")
    uvicorn.run("web.app:app", host="127.0.0.1", port=8000, reload=True)