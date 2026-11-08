"""Projects created from /start/: one video + one target web software.

A project lives in work/<id>/project.json; its video in data/videos/<id>.mp4. The
pipeline runs in the background (scripts/run_project.py) and reports in work/<id>/status.json.
"""
import json
import os
import re
import subprocess
import sys
import threading
import urllib.request
from datetime import datetime, timezone

from django.conf import settings
from django.utils.text import slugify

ROOT = settings.BASE_DIR
VIDEOS = ROOT / "data" / "videos"
WORK = settings.WORK_DIR
UPLOADS = ROOT / "data" / "uploads"
VIDEO_EXT = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"}
DEMO_DOLIBARR = "http://localhost:8080"
YOUTUBE = re.compile(r"(?:youtu\.be/|youtube\.com/(?:watch\?(?:.*&)?v=|shorts/|embed/|live/))([A-Za-z0-9_-]{11})")
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def youtube_id(text):
    text = text.strip()
    if YOUTUBE_ID.match(text):
        return text
    m = YOUTUBE.search(text)
    return m.group(1) if m else None


def _free_id(base):
    base = (slugify(base) or "video")[:40]
    pid, n = base, 2
    while (WORK / pid / "project.json").exists() or (VIDEOS / f"{pid}.mp4").exists():
        pid, n = f"{base}-{n}", n + 1
    return pid


def variant(project):
    """Which skill the video gives: an existing tutorial (old-voice) or a recent recording made to
    compare with it (new-voice), the third arm of the bench. Older names map to the new ones."""
    v = (project or {}).get("variant", "old-voice")
    return {"voice": "old-voice", "images": "old-images"}.get(v, v)


def create(*, upload=None, url="", lang="fr", software_url=DEMO_DOLIBARR, software_name="Dolibarr", recent=False):
    """Create a project from an uploaded file or a YouTube link. Raises ValueError for the user."""
    if upload:
        ext = os.path.splitext(upload.name)[1].lower()
        if ext not in VIDEO_EXT:
            raise ValueError(f"unsupported file type {ext or '(none)'}: use MP4, MOV, WEBM, MKV or AVI")
        pid = _free_id(os.path.splitext(upload.name)[0])
        target = VIDEOS / f"{pid}.mp4" if ext == ".mp4" else UPLOADS / f"{pid}{ext}"
        target.parent.mkdir(parents=True, exist_ok=True)
        with open(target, "wb") as f:
            for chunk in upload.chunks():
                f.write(chunk)
        source = {"kind": "file", "name": upload.name, "path": str(target)}
    elif url.strip():
        yid = youtube_id(url)
        if not yid:
            raise ValueError("this is not a YouTube link")
        pid = yid
        if (WORK / pid / "project.json").exists():
            return pid  # same video already added: open the existing project
        source = {"kind": "youtube", "url": url.strip(), "id": yid}
    else:
        raise ValueError("add a video file or paste a YouTube link")

    if not re.match(r"^https?://[^\s]+$", software_url.strip()):
        raise ValueError("the software address must start with http:// or https://")
    work = WORK / pid
    work.mkdir(parents=True, exist_ok=True)
    project = {
        "id": pid,
        "source": source,
        "lang": lang if lang in ("fr", "en") else "fr",
        "software": {"name": software_name.strip() or "Web software", "url": software_url.strip().rstrip("/")},
        "variant": "new-voice" if recent else "old-voice",
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    (work / "project.json").write_text(json.dumps(project, indent=2, ensure_ascii=False) + "\n")
    return pid


def get(pid):
    if not ID.match(pid or ""):
        return None
    path = WORK / pid / "project.json"
    return json.loads(path.read_text()) if path.exists() else None


def all_projects():
    if not WORK.exists():
        return []
    out = [get(p.parent.name) for p in WORK.glob("*/project.json")]
    return sorted((p for p in out if p), key=lambda p: p["created_at"], reverse=True)


def _reap(proc):
    """Wait for a background child in a thread, so a finished one does not stay a zombie
    that still looks alive to os.kill(pid, 0)."""
    threading.Thread(target=proc.wait, daemon=True).start()


def _pid_alive(path):
    try:
        os.kill(int(path.read_text()), 0)
        return True
    except (OSError, ValueError):
        return False


def running(pid):
    return _pid_alive(WORK / pid / "pipeline.pid")


def _read_status(pid):
    work = WORK / pid
    st = json.loads((work / "status.json").read_text()) if (work / "status.json").exists() else None
    if st and st["state"] == "running" and not running(pid):
        st["state"] = "failed"
        st["error"] = "the pipeline stopped unexpectedly, see the log below"
    return st


def status(pid):
    """(status.json with a liveness check, tail of the log)."""
    st = _read_status(pid)
    log = WORK / pid / "pipeline.log"
    tail = log.read_text(errors="replace")[-4000:] if log.exists() else ""
    return st, tail


def state(pid):
    """One word for the list of videos: waiting, running, done or failed."""
    st = _read_status(pid)
    return st["state"] if st else "waiting"


def start(pid):
    """Start scripts/run_project.py in the background, unless it is already running."""
    if running(pid):
        return
    work = WORK / pid
    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "scripts" / "run_project.py"), pid],
        cwd=ROOT, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    (work / "pipeline.pid").write_text(str(proc.pid))
    _reap(proc)


def outputs(pid):
    """What the pipeline produced so far, for the project page."""
    work = WORK / pid
    read = lambda name: json.loads((work / name).read_text()) if (work / name).exists() else None
    v = variant(get(pid))
    skill = work / f"SKILL.{v}.md"
    return {
        "transcript": read("transcript.json"), "frames": read("frames.json"), "storyboard": read("storyboard.json"),
        "understanding": read(f"understanding.{v}.json"),
        "variant": v,
        "skill": skill.read_text() if skill.exists() else None,
        "agent": read("agent.json"),
    }


# ---- the agent: one run per task (scripts/70_run_one.py), files in work/runs/

RUNS = WORK / "runs"
SCRIPTS = ROOT / "scripts"


def _scripts_import(name):
    """Import a pipeline script as a module (they live in scripts/, not in a package)."""
    import importlib
    if str(SCRIPTS) not in sys.path:
        sys.path.insert(0, str(SCRIPTS))
    return importlib.import_module(name)


def invoices():
    """The rows of data/factures.csv, for the run form (written on first use)."""
    try:
        return _scripts_import("common").invoices()
    except Exception:
        return []


def run_running(run):
    """A run file says running, but is the process still there?"""
    if run.get("status") in ("starting", "running"):
        pid_file = RUNS / f"{run['id']}.pid"
        if pid_file.exists():
            alive = _pid_alive(pid_file)
        else:  # started by hand before the pid file existed: trust it for the session's maximum time
            started = run.get("started_at", "")
            try:
                age = (datetime.now(timezone.utc) - datetime.fromisoformat(started)).total_seconds()
            except ValueError:
                age = 1e9
            alive = age < 15 * 60
        if not alive:
            run["status"], run["error"] = "failed", run.get("error") or "the run stopped unexpectedly"
            run.setdefault("verdict", "crash")
    log = RUNS / f"{run['id']}.log"
    if log.exists() and BROWSER_LOST.search(log.read_text(errors="replace")):
        run["browser_lost"] = True
    return run


# What the SDK prints when the agent's Chrome window was closed or crashed: the run cannot do anything after it.
BROWSER_LOST = re.compile(r"browser has closed the connection|not connected to DevTools|invalid session id")


def runs(pid):
    """Every run of this project, newest first."""
    if not RUNS.exists():
        return []
    out = []
    for path in RUNS.glob("*.json"):
        try:
            r = json.loads(path.read_text())
        except ValueError:
            continue
        if r.get("project") == pid:
            out.append(run_running(r))
    return sorted(out, key=lambda r: r.get("started_at") or "", reverse=True)


def any_run_running(pid=None):
    """One Chrome, one session at a time."""
    return any(r.get("status") in ("starting", "running") for r in (runs(pid) if pid else all_runs()))


def all_runs():
    if not RUNS.exists():
        return []
    out = []
    for path in RUNS.glob("*.json"):
        try:
            out.append(run_running(json.loads(path.read_text())))
        except ValueError:
            pass
    return out


def start_run(pid, *, row=None, task="", arm="skill", invoice=None):
    """Start scripts/70_run_one.py in the background. Returns the run id, or raises ValueError.
    `invoice`: a new invoice typed on the project page, checked in the database like a row."""
    if not (WORK / pid / "agent.json").exists():
        raise ValueError("the agent is not registered yet: wait for the pipeline to finish")
    if any_run_running():
        raise ValueError("a run is already in progress: the agent uses one browser at a time")
    if arm not in ("skill", "none"):
        raise ValueError("unknown arm")
    run_id = f"{pid}-{arm}-{row or ('new' if invoice else 'task')}-{datetime.now().strftime('%m%d-%H%M%S')}"
    cmd = [sys.executable, str(SCRIPTS / "70_run_one.py"), pid, "--arm", arm, "--run-id", run_id]
    if row:
        cmd += ["--row", str(int(row))]
    elif invoice:
        cmd += ["--invoice", json.dumps(invoice, ensure_ascii=False)]
    elif task.strip():
        cmd += ["--task", task.strip()[:2000]]
    else:
        raise ValueError("pick an invoice or write the task")
    RUNS.mkdir(parents=True, exist_ok=True)
    with open(RUNS / f"{run_id}.log", "w") as log:
        proc = subprocess.Popen(cmd, cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                start_new_session=True)
    (RUNS / f"{run_id}.pid").write_text(str(proc.pid))
    _reap(proc)
    return run_id


def stop_run(run_id):
    """Kill a run that hangs (e.g. its Chrome was closed) and mark it stopped."""
    if not re.match(r"^[A-Za-z0-9_-]+$", run_id or ""):
        raise ValueError("unknown run")
    path, pid_file = RUNS / f"{run_id}.json", RUNS / f"{run_id}.pid"
    if pid_file.exists() and _pid_alive(pid_file):  # a dead pid may have been given to another process since
        try:
            os.killpg(int(pid_file.read_text()), 15)  # started with start_new_session: its own group
        except (OSError, ValueError):
            pass
    if path.exists():
        run = json.loads(path.read_text())
        if run.get("status") in ("starting", "running"):
            run.update(status="failed", error="stopped by you", verdict="crash",
                       finished_at=datetime.now(timezone.utc).isoformat(timespec="seconds"))
            path.write_text(json.dumps(run, ensure_ascii=False, indent=2))


def run_log(run_id):
    path = RUNS / f"{run_id}.log"
    return path.read_text(errors="replace")[-3000:] if path.exists() else ""


# ---- demo Dolibarr

def is_demo(project):
    return project["software"]["url"].rstrip("/") in (DEMO_DOLIBARR, "http://127.0.0.1:8080")


def dolibarr_up():
    try:
        with urllib.request.urlopen(DEMO_DOLIBARR + "/index.php", timeout=2) as r:
            return r.status == 200
    except OSError:
        return False


def dolibarr_starting():
    return _pid_alive(ROOT / ".run" / "dolibarr.pid")


def start_dolibarr():
    """Run `make dolibarr` in the background (docker compose up + seed)."""
    if dolibarr_starting():
        return
    run = ROOT / ".run"
    run.mkdir(exist_ok=True)
    with open(run / "dolibarr.log", "w") as log:
        proc = subprocess.Popen(["make", "--no-print-directory", "dolibarr"], cwd=ROOT,
                                stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                start_new_session=True)
    (run / "dolibarr.pid").write_text(str(proc.pid))
    _reap(proc)
