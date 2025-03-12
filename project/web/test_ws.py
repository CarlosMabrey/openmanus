from fastapi import FastAPI, WebSocket
from fastapi.responses import HTMLResponse

app = FastAPI()

@app.get("/")
async def get():
    html = """
    <!DOCTYPE html>
    <html>
        <head>
            <title>WebSocket Test</title>
        </head>
        <body>
            <h1>WebSocket Test</h1>
            <div id="messages"></div>
            <script>
                var ws = new WebSocket(`ws://${window.location.host}/ws/test`);
                ws.onmessage = function(event) {
                    var messages = document.getElementById('messages')
                    var message = document.createElement('p')
                    message.textContent = event.data
                    messages.appendChild(message)
                };
                
                ws.onopen = function(event) {
                    ws.send("Hello Server");
                };
                
                ws.onerror = function(error) {
                    console.error("WebSocket Error:", error);
                };
            </script>
        </body>
    </html>
    """
    return HTMLResponse(html)

@app.websocket("/ws/test")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    await websocket.send_text("Connected to test WebSocket!")
    
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Message received: {data}")
    except Exception as e:
        print(f"WebSocket error: {e}")