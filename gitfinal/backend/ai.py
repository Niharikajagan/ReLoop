import os, re, json
from datetime import datetime, timedelta

USE_MOCK = not os.getenv("OPENAI_API_KEY")
_client = None
if not USE_MOCK:
    from openai import OpenAI
    _client = OpenAI()

SYNONYMS = {"frij": "refrigerator", "fridge": "refrigerator", "geyser": "water heater",
            "cooler": "air cooler", "washing m/c": "washing machine", "wm": "washing machine",
            "ac": "air conditioner", "tv": "television", "couch": "sofa"}
FIELDS = ["title", "category", "condition", "known_issues", "dimensions", "missing_parts", "pickup_deadline"]


def _normalize(raw):
    t = raw.lower()
    for k, v in SYNONYMS.items():
        t = re.sub(rf"(?<!\w){re.escape(k)}(?!\w)", v, t)
    return t


def extract(raw):
    text = _normalize(raw)
    data = None
    if not USE_MOCK:
        try:
            r = _client.chat.completions.create(
                model="gpt-4o-mini", temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content":
                     "Extract JSON with keys: " + ", ".join(FIELDS) +
                     ". The note may mix English and Hindi. Use 'UNKNOWN' for anything not stated. Never guess."},
                    {"role": "user", "content": text}])
            data = json.loads(r.choices[0].message.content)
        except Exception as e:
            print("LLM failed, using rules:", e)
    if data is None:
        data = _rules(text)
    for k in FIELDS:
        data.setdefault(k, "UNKNOWN")
    return data


def _rules(t):
    d = {k: "UNKNOWN" for k in FIELDS}
    for word, cat in [("table fan", "appliance"), ("washing machine", "appliance"), ("refrigerator", "appliance"),
                      ("air conditioner", "appliance"), ("water heater", "appliance"),
                      ("air cooler", "appliance"), ("television", "electronics"),
                      ("sofa", "furniture"), ("table", "furniture"), ("chair", "furniture"),
                      ("bed", "furniture"), ("fan", "appliance"), ("cycle", "other")]:
        if re.search(rf"\b{word}\b", t):
            d["title"], d["category"] = word.title(), cat
            break
    if re.search(r"leak|broken|not working|dead|noise|crack", t):
        d["known_issues"] = "leak" if "leak" in t else "reported fault"
        d["condition"] = "not working" if re.search(r"not working|dead", t) else "partially works"
    elif re.search(r"works|working|chal raha|running|good", t):
        d["condition"] = "works"
    for day in ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "tomorrow", "today"]:
        if day in t:
            d["pickup_deadline"] = day
            break
    return d


def assess_safety(d):
    cond = (d.get("condition") or "").lower()
    issues = (d.get("known_issues") or "").lower()
    if re.search(r"leak|broken|not working|dead|crack", issues):
        return "repair_candidate", f"Reported issue: {issues}"
    if issues and issues != "unknown":
        return "needs_inspection", f"Reported issue: {issues}"
    if "works" in cond and "partial" not in cond:
        return "reuse_ready", "No issues reported"
    return "needs_inspection", "Condition unclear from the note"


def questions(d):
    qs = []
    if d.get("dimensions") in (None, "UNKNOWN"):
        qs.append({"field": "dimensions", "question": "Roughly how big is it (height x width x depth, cm)?"})
    if d.get("missing_parts") in (None, "UNKNOWN"):
        qs.append({"field": "missing_parts", "question": "Are all parts included (hoses, cables, shelves)?"})
    if d.get("condition") in (None, "UNKNOWN"):
        qs.append({"field": "condition", "question": "Does it work, partly work, or not work?"})
    return qs[:4]


def parse_deadline(text):
    now = datetime.now()
    t = (text or "").lower()
    at5 = lambda dt: dt.replace(hour=17, minute=0, second=0, microsecond=0).isoformat()
    if "today" in t:
        return (now + timedelta(hours=6)).isoformat()
    if "tomorrow" in t:
        return at5(now + timedelta(days=1))
    days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    for i, d in enumerate(days):
        if d in t:
            return at5(now + timedelta(days=((i - now.weekday()) % 7) or 7))
    return at5(now + timedelta(days=3))
