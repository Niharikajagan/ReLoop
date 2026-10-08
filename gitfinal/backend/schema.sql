CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'seller',
  verification_status TEXT NOT NULL DEFAULT 'unverified',
  block TEXT, floor TEXT, unit_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  seller_user_id INTEGER NOT NULL,
  title TEXT, description_raw TEXT, category TEXT,
  condition TEXT, known_issues TEXT, missing_parts TEXT, dimensions TEXT,
  deadline_ts TIMESTAMP,
  display_location TEXT, private_location TEXT,
  safety_state TEXT DEFAULT 'needs_inspection',
  safety_reason TEXT,
  image_url TEXT,
  status TEXT DEFAULT 'published',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL,
  seller_user_id INTEGER NOT NULL,
  other_party_type TEXT,
  other_party_name TEXT,
  session_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL,
  sender_type TEXT,
  sender_session_id TEXT,
  text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER, user_id INTEGER, session_id TEXT,
  type TEXT, message TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
