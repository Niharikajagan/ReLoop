import sqlite3
from pathlib import Path

BASE = Path(__file__).parent
DB_PATH = BASE / "reloop.db"
VISIBLE = ("published", "interested", "warning_1_sent", "warning_2_sent")


def conn():
    c = sqlite3.connect(DB_PATH, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def q(sql, params=(), one=False, write=False):
    """Run one statement. Returns row(s) as dicts, or lastrowid when write=True."""
    c = conn()
    try:
        cur = c.execute(sql, params)
        if write:
            c.commit()
            return cur.lastrowid
        rows = [dict(r) for r in cur.fetchall()]
        return (rows[0] if rows else None) if one else rows
    finally:
        c.close()


def init_db():
    c = conn()
    c.executescript((BASE / "schema.sql").read_text())
    # Older databases created before photo upload need the new column.
    cols = [r["name"] for r in c.execute("PRAGMA table_info(items)")]
    if "image_url" not in cols:
        c.execute("ALTER TABLE items ADD COLUMN image_url TEXT")
    c.commit()
    c.close()


# ---- sellers ----
def create_seller(name, phone, block, floor, unit_id):
    return q("INSERT INTO users (name,phone,block,floor,unit_id) VALUES (?,?,?,?,?)",
             (name, phone, block, floor, unit_id), write=True)

def get_seller(uid):
    return q("SELECT * FROM users WHERE id=?", (uid,), one=True)

def pending_sellers():
    return q("SELECT * FROM users WHERE verification_status='unverified' ORDER BY id")

def verify_seller(uid):
    q("UPDATE users SET verification_status='verified' WHERE id=?", (uid,), write=True)


# ---- items ----
def create_item(seller_id, raw, deadline_ts, display_loc, private_loc, f):
    return q("""INSERT INTO items (seller_user_id, description_raw, title, category, condition,
                known_issues, missing_parts, dimensions, deadline_ts, display_location,
                private_location, safety_state, safety_reason, image_url, status)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'published')""",
             (seller_id, raw, f.get("title"), f.get("category"), f.get("condition"),
              f.get("known_issues"), f.get("missing_parts"), f.get("dimensions"),
              deadline_ts, display_loc, private_loc, f.get("safety_state"), f.get("safety_reason"), f.get("image_url")),
             write=True)

PUBLIC_COLS = ("id,seller_user_id,title,category,condition,known_issues,missing_parts,dimensions,"
               "deadline_ts,display_location,safety_state,safety_reason,image_url,status")

def list_items(statuses=None):
    statuses = statuses or list(VISIBLE)
    marks = ",".join("?" * len(statuses))
    return q(f"SELECT {PUBLIC_COLS} FROM items WHERE status IN ({marks}) ORDER BY deadline_ts", statuses)

def get_item(iid):
    return q(f"SELECT {PUBLIC_COLS} FROM items WHERE id=?", (iid,), one=True)

def seller_items(uid):
    return q(f"SELECT {PUBLIC_COLS} FROM items WHERE seller_user_id=? ORDER BY id DESC", (uid,))

def set_status(iid, status):
    q("UPDATE items SET status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, iid), write=True)


# ---- chat ----
def open_conversation(item_id, seller_id, party_type, name, session_id):
    existing = q("SELECT id FROM conversations WHERE item_id=? AND session_id=?",
                 (item_id, session_id), one=True)
    if existing:
        return existing["id"]
    return q("""INSERT INTO conversations (item_id,seller_user_id,other_party_type,other_party_name,session_id)
                VALUES (?,?,?,?,?)""", (item_id, seller_id, party_type, name, session_id), write=True)

def seller_conversations(uid):
    return q("""SELECT c.*, i.title AS item_title FROM conversations c
                JOIN items i ON i.id=c.item_id WHERE c.seller_user_id=? ORDER BY c.updated_at DESC""", (uid,))

def add_message(cid, sender_type, text, session_id=None):
    q("INSERT INTO messages (conversation_id,sender_type,sender_session_id,text) VALUES (?,?,?,?)",
      (cid, sender_type, session_id, text), write=True)
    q("UPDATE conversations SET updated_at=CURRENT_TIMESTAMP WHERE id=?", (cid,), write=True)

def get_messages(cid):
    return q("SELECT * FROM messages WHERE conversation_id=? ORDER BY id", (cid,))


# ---- notifications ----
def notify(item_id, ntype, message, user_id=None):
    q("INSERT INTO notifications (item_id,user_id,type,message) VALUES (?,?,?,?)",
      (item_id, user_id, ntype, message), write=True)

def get_notifications(user_id):
    return q("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50", (user_id,))
