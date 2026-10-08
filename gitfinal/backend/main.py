import os, json
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
load_dotenv()

from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header, HTTPException, UploadFile, File, Form
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import db, ai
from scheduler import start as start_scheduler

ADMIN_PIN = os.getenv("ADMIN_PIN", "reloop-admin")
UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_UPLOAD = 5 * 1024 * 1024
MAX_IMAGES = 6
IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


def looks_like_image(data: bytes) -> bool:
    return (data.startswith(b"\xff\xd8\xff") or data.startswith(b"\x89PNG")
            or (data[:4] == b"RIFF" and data[8:12] == b"WEBP"))


def clean_image_urls(urls: list[str]) -> list[str]:
    """Keep only real files we saved in /uploads, drop duplicates, cap at MAX_IMAGES."""
    out: list[str] = []
    for u in urls:
        if not u or not u.startswith("/uploads/") or ".." in u:
            continue
        if not (UPLOAD_DIR / Path(u).name).is_file():
            continue
        if u not in out:
            out.append(u)
    return out[:MAX_IMAGES]


def seed_demo():
    """Put a few items in the scene on first run so the 3D view is not empty."""
    if db.q("SELECT id FROM items LIMIT 1"):
        return
    sid = db.create_seller("Demo Resident", "0000000000", "B", "3", "304")
    db.verify_seller(sid)
    demo = [
        "Washing machine chal raha hai but drain leak. Sunday tak nikalna hai.",
        "Wooden sofa, works fine, 3 seater, pickup tomorrow",
        "Old fridge not working, compressor noise, need gone by Saturday",
        "Table fan working good, pickup today",
        "Study chair broken wheel, tomorrow pickup",
    ]
    for raw in demo:
        ext = ai.extract(raw)
        state, why = ai.assess_safety(ext)
        ext.update(safety_state=state, safety_reason=why)
        db.create_item(sid, raw, ai.parse_deadline(ext.get("pickup_deadline")), "Block B, Floor 3", "B-3-304", ext)


@asynccontextmanager
async def lifespan(_):
    db.init_db()
    seed_demo()
    sched = start_scheduler()
    yield
    sched.shutdown(wait=False)


app = FastAPI(title="ReLoop API", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


class SellerReg(BaseModel):
    name: str
    phone: str
    block: str
    floor: str
    unit_id: str

class Preview(BaseModel):
    raw_text: str

class ItemCreate(BaseModel):
    seller_id: int
    raw_text: str
    deadline_text: Optional[str] = ""
    answers: dict = {}
    image_url: Optional[str] = None          # kept for backward compatibility
    image_urls: list[str] = []               # NEW: up to 6 photos

class ClaimReq(BaseModel):
    party_type: str
    session_id: str

class MessageReq(BaseModel):
    sender_type: str
    text: str
    session_id: Optional[str] = None

class PinReq(BaseModel):
    pin: str


def need_admin(key):
    if key != ADMIN_PIN:
        raise HTTPException(401, "Wrong admin PIN")


@app.get("/")
def health():
    return {"service": "ReLoop", "ai": "openai" if not ai.USE_MOCK else "rule-based"}


# ---- admin ----
@app.post("/admin/login")
def admin_login(r: PinReq):
    need_admin(r.pin)
    return {"ok": True}

@app.get("/admin/pending-sellers")
def pending(x_admin_pin: str = Header(None)):
    need_admin(x_admin_pin)
    return db.pending_sellers()

@app.post("/admin/verify/{uid}")
def verify(uid: int, x_admin_pin: str = Header(None)):
    need_admin(x_admin_pin)
    db.verify_seller(uid)
    return {"ok": True}


# ---- sellers ----
@app.post("/sellers/register")
def register(r: SellerReg):
    return {"seller_id": db.create_seller(r.name, r.phone, r.block, r.floor, r.unit_id)}

@app.get("/sellers/{uid}")
def seller(uid: int):
    s = db.get_seller(uid)
    if not s:
        raise HTTPException(404, "Seller not found")
    return {k: s[k] for k in ("id", "name", "block", "floor", "verification_status")}

@app.get("/sellers/{uid}/items")
def my_items(uid: int):
    return db.seller_items(uid)

@app.get("/sellers/{uid}/conversations")
def my_chats(uid: int):
    return db.seller_conversations(uid)

@app.get("/sellers/{uid}/notifications")
def my_notifications(uid: int):
    return db.get_notifications(uid)

@app.post("/sellers/preview")
def preview(r: Preview):
    ext = ai.extract(r.raw_text)
    state, why = ai.assess_safety(ext)
    return {"extracted": ext, "safety_state": state, "reason": why, "questions": ai.questions(ext)}


# ---- photo upload (call once per photo, collect the returned image_url values) ----
@app.post("/uploads")
async def upload_photo(file: UploadFile = File(...), seller_id: int = Form(...)):
    s = db.get_seller(seller_id)
    if not s or s["verification_status"] != "verified":
        raise HTTPException(403, "Only verified sellers can upload photos")
    ext = IMAGE_TYPES.get(file.content_type)
    if not ext:
        raise HTTPException(400, "Use a JPG, PNG or WebP photo")
    data = await file.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, "Photo is over 5 MB. Pick a smaller one")
    if not looks_like_image(data):
        raise HTTPException(400, "That file is not a valid image")
    name = uuid4().hex + ext
    (UPLOAD_DIR / name).write_bytes(data)
    return {"image_url": f"/uploads/{name}"}


# ---- items ----
@app.post("/items")
def create_item(r: ItemCreate):
    s = db.get_seller(r.seller_id)
    if not s or s["verification_status"] != "verified":
        raise HTTPException(403, "Seller is not verified yet")
    if len(r.image_urls) > MAX_IMAGES:
        raise HTTPException(400, f"You can add at most {MAX_IMAGES} photos")
    ext = ai.extract(r.raw_text)
    ext.update({k: v for k, v in r.answers.items() if v})

    # Combine the old single-photo field and the new list, validate, de-duplicate
    urls = clean_image_urls(([r.image_url] if r.image_url else []) + list(r.image_urls))
    if urls:
        ext["image_url"] = urls[0]     # first photo = cover image (old code keeps working)
        ext["image_urls"] = urls       # all photos

    state, why = ai.assess_safety(ext)
    ext.update(safety_state=state, safety_reason=why)
    deadline = ai.parse_deadline(r.deadline_text or ext.get("pickup_deadline"))
    iid = db.create_item(r.seller_id, r.raw_text, deadline,
                         f"Block {s['block']}, Floor {s['floor']}",
                         f"{s['block']}-{s['floor']}-{s['unit_id']}", ext)
    return {"item_id": iid, "safety_state": state, "image_count": len(urls)}

@app.get("/items")
def items(status: Optional[str] = None):
    return db.list_items(status.split(",") if status else None)

@app.get("/items/{iid}")
def item(iid: int):
    it = db.get_item(iid)
    if not it:
        raise HTTPException(404, "Item not found")
    return it

@app.post("/items/{iid}/claim")
def claim(iid: int, r: ClaimReq):
    it = db.get_item(iid)
    if not it:
        raise HTTPException(404, "Item not found")
    name = f"{r.party_type.title()} {r.session_id[-4:]}"
    cid = db.open_conversation(iid, it["seller_user_id"], r.party_type, name, r.session_id)
    if it["status"] == "published":
        db.set_status(iid, "interested")
    return {"conversation_id": cid}

@app.post("/items/{iid}/picked-up")
def picked_up(iid: int):
    db.set_status(iid, "picked_up")
    return {"ok": True}


# ---- chat ----
@app.get("/conversations/{cid}/messages")
def messages(cid: int):
    return db.get_messages(cid)

@app.post("/conversations/{cid}/messages")
def send(cid: int, r: MessageReq):
    db.add_message(cid, r.sender_type, r.text, r.session_id)
    return {"ok": True}


class Rooms:
    def __init__(self):
        self.rooms: dict[str, list[WebSocket]] = {}

    async def join(self, cid, ws):
        await ws.accept()
        self.rooms.setdefault(cid, []).append(ws)

    def leave(self, cid, ws):
        if ws in self.rooms.get(cid, []):
            self.rooms[cid].remove(ws)

    async def broadcast(self, cid, payload):
        for ws in list(self.rooms.get(cid, [])):
            try:
                await ws.send_text(json.dumps(payload))
            except Exception:
                self.leave(cid, ws)

rooms = Rooms()

@app.websocket("/ws/chat/{cid}")
async def chat_socket(ws: WebSocket, cid: str):
    await rooms.join(cid, ws)
    try:
        while True:
            p = json.loads(await ws.receive_text())
            text = (p.get("text") or "").strip()[:1000]
            if not text:
                continue
            db.add_message(int(cid), p.get("sender_type", "guest"), text, p.get("session_id"))
            await rooms.broadcast(cid, {"sender_type": p.get("sender_type"), "text": text})
    except WebSocketDisconnect:
        rooms.leave(cid, ws)
