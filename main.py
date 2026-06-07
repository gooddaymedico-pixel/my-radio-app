import json
import logging
from typing import Dict, Set

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="S22 Radio Server")

# Mount static files and templates
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# In-memory storage for active radio channels
# Format: { "room_id": { "broadcaster": WebSocket, "listeners": set(WebSocket), "init_chunk": None } }
rooms: Dict[str, Dict] = {}

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    # Pass the list of active rooms to the index page
    active_rooms = list(rooms.keys())
    return templates.TemplateResponse(
        "index.html", 
        {"request": request, "active_rooms": active_rooms}
    )

@app.get("/broadcast/{room_id}", response_class=HTMLResponse)
async def get_broadcast(request: Request, room_id: str):
    return templates.TemplateResponse(
        "broadcast.html", 
        {"request": request, "room_id": room_id}
    )

@app.get("/listen/{room_id}", response_class=HTMLResponse)
async def get_listen(request: Request, room_id: str):
    return templates.TemplateResponse(
        "listen.html", 
        {"request": request, "room_id": room_id}
    )

# WebSocket for the DJ (Broadcaster)
@app.websocket("/ws/broadcast/{room_id}")
async def websocket_broadcast(websocket: WebSocket, room_id: str):
    await websocket.accept()
    
    # Initialize room if it doesn't exist
    if room_id not in rooms:
        rooms[room_id] = {"broadcaster": websocket, "listeners": set(), "init_chunk": None}
    else:
        # If a broadcaster is already here, we reject the new connection.
        if rooms[room_id].get("broadcaster") is not None:
            await websocket.close(code=1008, reason="Room already has a broadcaster.")
            return
        rooms[room_id]["broadcaster"] = websocket
        
    logger.info(f"Broadcaster joined room: {room_id}")
    
    try:
        while True:
            # Receive audio chunks from the broadcaster
            data = await websocket.receive_bytes()
            
            # Cache the initialization chunk (usually the first one)
            if rooms[room_id]["init_chunk"] is None:
                rooms[room_id]["init_chunk"] = data
            
            # Relay the audio chunk to all listeners in the room
            listeners = rooms[room_id]["listeners"]
            disconnected_listeners = set()
            for listener in listeners:
                try:
                    await listener.send_bytes(data)
                except Exception as e:
                    logger.error(f"Error sending to listener in {room_id}: {e}")
                    disconnected_listeners.add(listener)
                    
            # Cleanup disconnected listeners
            for listener in disconnected_listeners:
                rooms[room_id]["listeners"].remove(listener)
                
    except WebSocketDisconnect:
        logger.info(f"Broadcaster disconnected from room: {room_id}")
        # When broadcaster disconnects, notify listeners and close the room
        if room_id in rooms:
            listeners = rooms[room_id]["listeners"]
            for listener in listeners:
                try:
                    await listener.send_text("BROADCAST_ENDED")
                    await listener.close()
                except:
                    pass
            del rooms[room_id]

# WebSocket for Listeners
@app.websocket("/ws/listen/{room_id}")
async def websocket_listen(websocket: WebSocket, room_id: str):
    await websocket.accept()
    
    if room_id not in rooms:
        await websocket.send_text("ROOM_NOT_FOUND")
        await websocket.close(code=1008, reason="Room not found.")
        return
        
    rooms[room_id]["listeners"].add(websocket)
    logger.info(f"Listener joined room: {room_id}")
    
    # Send the initialization chunk if it exists so the listener can decode the stream
    if rooms[room_id]["init_chunk"] is not None:
        try:
            await websocket.send_bytes(rooms[room_id]["init_chunk"])
        except Exception as e:
            logger.error(f"Error sending init chunk to listener in {room_id}: {e}")
            return
            
    try:
        while True:
            # Keep connection alive, though we only expect to SEND data to listeners
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        logger.info(f"Listener disconnected from room: {room_id}")
        if room_id in rooms:
            if websocket in rooms[room_id]["listeners"]:
                rooms[room_id]["listeners"].remove(websocket)
