"""Shared paths and helpers for the pipeline scripts (docs/ARCHITECTURE.md)."""
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VIDEOS = ROOT / "data" / "videos"
WORK = ROOT / "work"

# Dolibarr vocabulary for Gladia and for the model reading the video (ARCHITECTURE.md [2]). Only the software's
# own words, whatever the task: a video about customers or quotes must not be steered towards supplier invoices.
DOLIBARR_VOCABULARY = [
    "Dolibarr", "tiers", "valider", "brouillon", "TVA", "HT", "TTC",
    {"value": "SIREN", "pronunciations": ["si rène", "siren"]},
]


def vocabulary(project):
    """The words to expect in a video about this project's software: Dolibarr's, or none for other software."""
    sw = project.get("software") or {}
    return DOLIBARR_VOCABULARY if "dolibarr" in f"{sw.get('name', '')} {sw.get('url', '')}".lower() else []


def load_env():
    """Read KEY=value lines from .env into os.environ, without overriding what is set."""
    path = ROOT / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.removeprefix("export ").split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


def need_env(key):
    """Return the key from the environment or .env. Keys are entered on the site, page /keys/."""
    load_env()
    value = os.environ.get(key)
    if not value:
        sys.exit(f"{key} is missing: `make run`, then enter it on http://127.0.0.1:8000/keys/")
    return value


def video_path(video_id):
    path = VIDEOS / f"{video_id}.mp4"
    if not path.exists():
        sys.exit(f"{path.relative_to(ROOT)} not found: run scripts/10_download.sh {video_id}")
    return path


def work_dir(video_id):
    path = WORK / video_id
    path.mkdir(parents=True, exist_ok=True)
    return path


def read_json(path):
    if not path.exists():
        sys.exit(f"{path.relative_to(ROOT)} not found")
    return json.loads(path.read_text())


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


# ---- Shared by steps 5 to 9

RUNS = WORK / "runs"
REPORT = ROOT / "report"
CSV = ROOT / "data" / "factures.csv"
H_MODELS = "https://api.hcompany.ai/v1"
INDUCE_MODEL = os.environ.get("INDUCE_MODEL", "holo4-27b")
INDUCE_FALLBACK = "holo3-1-35b-a3b"  # free on the Free plan, 10 requests per minute
AGENT_MODEL = os.environ.get("AGENT_MODEL", "holo4-27b")


def slug(text):
    """A catalog name segment: lowercase ASCII letters, digits and hyphens."""
    import re
    import unicodedata
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:40] or "video"


def project(video_id):
    """work/<id>/project.json when the video was added on the site, else a default for `make prep`."""
    path = WORK / video_id / "project.json"
    if path.exists():
        return json.loads(path.read_text())
    return {"id": video_id, "lang": "fr", "software": {"name": "Dolibarr (demo)", "url": "http://localhost:8080"}}


def is_demo_dolibarr(software_url):
    return software_url.rstrip("/") in ("http://localhost:8080", "http://127.0.0.1:8080")


def invoices():
    """data/factures.csv as a list of dicts (id as int, montant_ht and tva as float). Written on first use."""
    import csv
    if not CSV.exists():
        import importlib
        importlib.import_module("make_csv").main()
    with open(CSV, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        r["id"] = int(r["id"])
        r["montant_ht"] = float(r["montant_ht"])
        r["tva"] = float(r["tva"])
    return rows


def invoice(row_id):
    row = next((r for r in invoices() if r["id"] == int(row_id)), None)
    if not row:
        sys.exit(f"no row {row_id} in {CSV.relative_to(ROOT)}")
    return row


PIEGES = ("doublon", "tva", "")  # the `piege` column of data/factures.csv: the house rule a row tests, or none


def skill_revision_of(run):
    """The skill revision a run used, read from `dependency_revisions`; None for the no-skill arm."""
    if run.get("arm") == "none" or run.get("bench_arm") == "none":
        return None
    for s in (run.get("dependency_revisions") or {}).get("skills") or []:
        if isinstance(s, dict) and s.get("revision") is not None:
            return int(s["revision"])
    return None


def parse_json(text):
    """The JSON object in a model answer, with or without a code fence. None if there is none."""
    import re
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        data = json.loads(m.group(0))
    except ValueError:
        return None
    return data if isinstance(data, dict) else None


def h_chat(messages, *, model=None, max_tokens=16000, temperature=0.0, retries=3):
    """One chat completion on the H Models API, plain HTTP (the OpenAI client chokes on H's
    reasoning fields). Falls back to the free model when the paid one is refused."""
    import time
    import requests

    key = need_env("HAI_API_KEY")
    model = model or INDUCE_MODEL
    body = {"model": model, "messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    for attempt in range(retries):
        try:
            r = requests.post(f"{H_MODELS}/chat/completions", headers={"Authorization": f"Bearer {key}"},
                              json=body, timeout=(15, 600))
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            # A slow or dropped answer is not a reason to lose the whole pipeline: try again.
            wait = 8 * (attempt + 1)
            print(f"Models API {type(e).__name__}, retrying in {wait} s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code in (402, 403, 404) and model != INDUCE_FALLBACK:
            print(f"{model} refused ({r.status_code}), falling back to {INDUCE_FALLBACK}", flush=True)
            model = body["model"] = INDUCE_FALLBACK
            continue
        if r.status_code == 429 or r.status_code >= 500:
            wait = 8 * (attempt + 1)
            print(f"Models API {r.status_code}, retrying in {wait} s", flush=True)
            time.sleep(wait)
            continue
        if r.status_code >= 400:
            raise RuntimeError(f"Models API {r.status_code}: {r.text[:300]}")
        data = r.json()
        msg = data["choices"][0]["message"]
        text = msg.get("content") or ""
        if not text.strip():
            # The model spent its budget thinking; keep what it reasoned so the caller sees why.
            raise RuntimeError(f"{model} returned no text (finish_reason={data['choices'][0].get('finish_reason')}); raise max_tokens")
        return text, model, data.get("usage") or {}
    raise RuntimeError("Models API: too many retries")


# ---- SKILL.md rendering, shared by 50_induce.py and 75_repair.py

def timecode(t):
    s = int(round(float(t)))
    return f"{s // 60}:{s % 60:02d}"


HEADINGS = {
    "fr": ("Préconditions", "Étapes", "Correspondance des champs", "Règles d'exception", "Vérification de fin",
           "Non couvert par le tutoriel", "aucune", "dit", "montré", "dit et montré"),
    "en": ("Preconditions", "Steps", "Field mapping", "Exception rules", "Final check",
           "Not covered by the tutorial", "none", "said", "shown", "said and shown"),
}


def render_skill(u, lang):
    """SKILL.md in the format of ARCHITECTURE.md [5], from the structured understanding."""
    h_pre, h_steps, h_map, h_rules, h_check, h_gaps, none, said, shown, both = HEADINGS.get(lang, HEADINGS["en"])
    src = {"said": said, "shown": shown, "both": both}
    out = ["---", f"name: {u['task']['name']}", f"description: {u['task']['description']}", "---", ""]
    sw = u["software"]
    out.append(f"{sw['name']} {sw['version']}".strip() + f" — {u['task']['goal']}")
    out += ["", f"## {h_pre}"]
    out += [f"- {p['text']} ({src.get(p['source'], p['source'])})" for p in u["preconditions"]] or [f"- ({none})"]
    out += ["", f"## {h_steps}"]
    for i, s in enumerate(u["steps"], 1):
        labels = ", ".join(f"« {x} »" for x in s["ui_text"])
        line = f"{i}. {s['action']}"
        if labels and not all(x in s["action"] for x in s["ui_text"]):
            line += f" ({labels})"
        out.append(line)
        if s["intent"]:
            out.append(f"   - {s['intent']}")
        if s["expect"]:
            out.append(f"   - → {s['expect']}")
        out.append(f"   - [{timecode(s['t'])}, {s['frame']}, {src.get(s['source'], s['source'])}]")
    out += ["", f"## {h_map}"]
    out += [f"- {m['input']} → {m['field']} ({m['where']})" + (f" — {m['note']}" if m["note"] else "")
            for m in u["field_mapping"]] or [f"- ({none})"]
    out += ["", f"## {h_rules}"]
    out += [f"- {r['rule']} [{timecode(r['t'])}, {src.get(r['source'], r['source'])}]"
            for r in u["exception_rules"]] or [f"- ({none})"]
    out += ["", f"## {h_check}"]
    out += [f"- {c}" for c in u["final_check"]] or [f"- ({none})"]
    if u["not_covered"]:
        out += ["", f"## {h_gaps}"]
        out += [f"- {g}" for g in u["not_covered"]]
    return "\n".join(out) + "\n"
