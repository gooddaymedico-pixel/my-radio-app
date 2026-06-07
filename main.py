import json
import logging
import uuid
from typing import Dict, Any

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="S22 Radio WebRTC Signaling Server")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Format: { "room_id": { "broadcaster": WebSocket, "listeners": { "listener_id": WebSocket } } }
rooms: Dict[str, Dict[str, Any]] = {}

@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
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

@app.websocket("/ws/broadcast/{room_id}")
async def websocket_broadcast(websocket: WebSocket, room_id: str):
    await websocket.accept()
    
    if room_id not in rooms:
        rooms[room_id] = {"broadcaster": websocket, "listeners": {}}
    else:
        if rooms[room_id].get("broadcaster") is not None:
            await websocket.close(code=1008, reason="Room already has a broadcaster.")
            return
        rooms[room_id]["broadcaster"] = websocket
        
    logger.info(f"Broadcaster joined room: {room_id}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Route signaling message to the specific listener
            target_listener_id = message.get("target")
            msg_type = message.get("type")
            if target_listener_id and target_listener_id in rooms[room_id]["listeners"]:
                logger.info(f"[Room: {room_id}] Relaying '{msg_type}' from Broadcaster -> Listener ({target_listener_id})")
                listener_ws = rooms[room_id]["listeners"][target_listener_id]
                await listener_ws.send_text(json.dumps({
                    "type": msg_type,
                    "sdp": message.get("sdp"),
                    "candidate": message.get("candidate")
                }))
            else:
                logger.warning(f"[Room: {room_id}] Failed to relay '{msg_type}': target Listener ({target_listener_id}) not found.")
                
    except WebSocketDisconnect:
        logger.info(f"Broadcaster disconnected from room: {room_id}")
        if room_id in rooms:
            listeners = rooms[room_id]["listeners"]
            for l_id, listener_ws in listeners.items():
                try:
                    await listener_ws.send_text(json.dumps({"type": "broadcast_ended"}))
                    await listener_ws.close()
                except:
                    pass
            del rooms[room_id]

@app.websocket("/ws/listen/{room_id}")
async def websocket_listen(websocket: WebSocket, room_id: str):
    await websocket.accept()
    
    if room_id not in rooms or rooms[room_id].get("broadcaster") is None:
        await websocket.send_text(json.dumps({"type": "error", "message": "Room not found or no broadcast."}))
        await websocket.close(code=1008, reason="Room not found.")
        return
        
    listener_id = str(uuid.uuid4())
    rooms[room_id]["listeners"][listener_id] = websocket
    logger.info(f"Listener {listener_id} joined room: {room_id}")
    
    # Notify broadcaster to start WebRTC negotiation
    broadcaster_ws = rooms[room_id]["broadcaster"]
    try:
        await broadcaster_ws.send_text(json.dumps({
            "type": "listener_joined",
            "listener_id": listener_id
        }))
    except Exception as e:
        logger.error(f"Error notifying broadcaster: {e}")
    
    try:
        while True:
            data = await websocket.receive_text()
            message = json.loads(data)
            
            # Route signaling message (answer/candidate) back to the broadcaster
            msg_type = message.get("type")
            if rooms[room_id].get("broadcaster"):
                logger.info(f"[Room: {room_id}] Relaying '{msg_type}' from Listener ({listener_id}) -> Broadcaster")
                await rooms[room_id]["broadcaster"].send_text(json.dumps({
                    "type": msg_type,
                    "sdp": message.get("sdp"),
                    "candidate": message.get("candidate"),
                    "source": listener_id
                }))
            else:
                logger.warning(f"[Room: {room_id}] Failed to relay '{msg_type}': Broadcaster not found.")
                
    except WebSocketDisconnect:
        logger.info(f"Listener {listener_id} disconnected from room: {room_id}")
        if room_id in rooms and listener_id in rooms[room_id]["listeners"]:
            del rooms[room_id]["listeners"][listener_id]
            if rooms[room_id].get("broadcaster"):
                try:
                    await rooms[room_id]["broadcaster"].send_text(json.dumps({
                        "type": "listener_left",
                        "source": listener_id
                    }))
                except:
                    pass
