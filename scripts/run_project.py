"""Run the pipeline for one project created on the site (page /start/).

Reads work/<id>/project.json, runs the steps in order, and keeps work/<id>/status.json
up to date so the project page can show progress. Output of every step goes to
work/<id>/pipeline.log. Steps already done are skipped, so a rerun resumes.

Usage: python scripts/run_project.py <project_id>
"""
import json
import subprocess
import sys
import time
from datetime import datetime, timezone

from common import ROOT, VIDEOS, WORK

PY = sys.executable


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def steps(p):
    pid, video = p["id"], VIDEOS / f"{p['id']}.mp4"
    work = WORK / pid
    # old-voice: an existing tutorial; new-voice: a recent recording, the bench's third arm.
    variant = {"voice": "old-voice", "images": "old-images"}.get(p.get("variant", "old-voice"), p.get("variant", "old-voice"))
    out = []
    if p["source"]["kind"] == "youtube":
        out.append(("download", "Download the video", [str(ROOT / "scripts/10_download.sh"), pid], video))
    elif p["source"]["path"] != str(video):
        out.append(("convert", "Convert the video to MP4", [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", p["source"]["path"],
            "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", str(video)], video))
    out += [
        ("transcribe", "Transcribe the voice (Gladia)", [PY, "scripts/20_transcribe.py", pid, "--lang", p["lang"]], work / "transcript.json"),
        ("keyframes", "Extract keyframes (ffmpeg)", [PY, "scripts/30_keyframes.py", pid], work / "frames.json"),
        ("storyboard", "Align sentences and images", [PY, "scripts/40_storyboard.py", pid], work / "storyboard.json"),
        ("understand", "Understand the tutorial and write the skill (H Models API)",
         [PY, "scripts/50_induce.py", pid, "--variant", variant], work / f"SKILL.{variant}.md"),
        ("register", "Register the skill and the agent in the H catalog",
         [PY, "scripts/60_register.py", pid, "--variant", variant], work / f"agent.{variant}.json"),
        # Display only, after the agent is ready: a failed request leaves the text in the video's language.
        ("translate", "Translate what the agent learned into English, for the pages (H Models API)",
         [PY, "scripts/56_translate.py", pid], work / "translations.en.json"),
    ]
    return out


def main():
    pid = sys.argv[1]
    work = WORK / pid
    project = json.loads((work / "project.json").read_text())
    status_path = work / "status.json"
    plan = steps(project)

    # Fail in a second, not after twenty minutes of paid API calls, when the setup is incomplete.
    from preflight import problems
    missing = problems("pipeline")
    if missing:
        with open(work / "pipeline.log", "a") as log:
            log.write(f"\n=== {now()} preflight\n" + "\n".join(missing) + "\n")
        status_path.write_text(json.dumps({"state": "failed", "started_at": now(), "finished_at": now(),
                                           "steps": [{"key": k, "label": l, "state": "todo"} for k, l, _, _ in plan],
                                           "error": "Setup incomplete: " + " · ".join(missing)}, indent=2) + "\n")
        sys.exit(1)
    # A step is done when its output exists and is not older than the previous step's output
    # (a skill rewritten by step 5 gets registered again by step 6). Once a step is to redo,
    # every later one is too: their outputs rest on the one being remade.
    states, previous, redo = [], None, False
    for k, label, _, done in plan:
        fresh = done.exists() and (previous is None or not previous.exists() or done.stat().st_mtime >= previous.stat().st_mtime)
        redo = redo or not fresh
        states.append({"key": k, "label": label, "state": "todo" if redo else "done"})
        previous = done
    status = {"state": "running", "started_at": now(), "steps": states}

    def save():
        status_path.write_text(json.dumps(status, indent=2) + "\n")

    save()
    with open(work / "pipeline.log", "a") as log:
        log.write(f"\n=== {now()} run\n")
        for (key, label, cmd, done), st in zip(plan, status["steps"]):
            if st["state"] == "done":
                continue
            st["state"], st["started_at"] = "running", now()
            save()
            log.write(f"--- {label}\n$ {' '.join(cmd)}\n")
            log.flush()
            t0 = time.time()
            # The step writes straight into the log: the project page, which rereads it every 3 s,
            # follows a 15-minute induction request by request instead of getting it all at the end.
            start = log.tell()
            proc = subprocess.run(cmd, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT, text=True)
            log.flush()
            st["seconds"] = round(time.time() - t0)
            if proc.returncode != 0 or not done.exists():
                with open(work / "pipeline.log", encoding="utf-8", errors="replace") as f:
                    f.seek(start)
                    lines = [l for l in f.read().splitlines() if l.strip()]
                st["state"] = "failed"
                status.update(state="failed", error=f"{label}: {lines[-1] if lines else 'failed'}", finished_at=now())
                save()
                sys.exit(1)
            st["state"] = "done"
            save()
    status.update(state="done", finished_at=now())
    save()


if __name__ == "__main__":
    main()
