from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
import db


def tick():
    """Warn before the deadline, then relist items nobody collected."""
    now = datetime.now()
    for it in db.q("SELECT id, seller_user_id, deadline_ts, status FROM items "
                   "WHERE status IN ('published','interested','warning_1_sent','warning_2_sent')"):
        try:
            hours = (datetime.fromisoformat(it["deadline_ts"]) - now).total_seconds() / 3600
        except Exception:
            continue
        uid, iid, st = it["seller_user_id"], it["id"], it["status"]
        if 0 < hours <= 6 and st in ("published", "interested"):
            db.set_status(iid, "warning_1_sent")
            db.notify(iid, "warning_1", "Pickup deadline is under 6 hours away.", uid)
        elif hours < -2 and st == "warning_1_sent":
            db.set_status(iid, "warning_2_sent")
            db.notify(iid, "warning_2", "Deadline passed. The item will be relisted soon.", uid)
        elif hours < -4 and st == "warning_2_sent":
            new_deadline = (now + timedelta(days=3)).isoformat()
            db.q("UPDATE items SET status='published', deadline_ts=? WHERE id=?", (new_deadline, iid), write=True)
            db.notify(iid, "relisted", "Item relisted with a new 3-day deadline.", uid)


def start():
    s = BackgroundScheduler()
    s.add_job(tick, "interval", minutes=15, id="deadline-engine")
    s.start()
    return s
