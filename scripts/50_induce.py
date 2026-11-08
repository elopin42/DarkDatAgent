"""[5] storyboard -> work/<id>/understanding.<variant>.json + SKILL.<variant>.md, with the H Models API.

Holo4 reads the storyboard 5 images at a time (the Models API limit), each image with its
timecode, whether it is a real screen change, and the sentences spoken over it. Instead of
a running Markdown draft, it keeps a structured understanding (JSON) that each request
updates: the software and version seen, the task, numbered steps with the exact labels on
screen and the intent behind each, the field mapping, the exception rules said or shown,
the final check, what the tutorial does not cover, the transcription errors it noticed
(the screen corrects the voice), and what has probably changed since the video. A last
text-only request consolidates it. SKILL.<variant>.md is rendered from that JSON, in the
format of ARCHITECTURE.md [5], so the format is always right and only the content comes
from the model.

The answer is kept in work/<id>/induce.<variant>.json so a rerun does not pay again;
--fresh asks again. --dry-run prints the size of the request without calling.

Variants: old-voice (images + narration, the default), old-images (images only: --images-only).

Usage: python scripts/50_induce.py <video_id> [--variant old-voice] [--images-only]
       [--model holo4-27b] [--max-images 60] [--task "..."] [--fresh] [--dry-run]

Count on about 8 minutes for 13 requests: holo4 reasons at length before writing.
"""
import argparse
import base64
import bisect
import copy
import json
import re
import time

from common import INDUCE_MODEL, ROOT, h_chat, parse_json, read_json, render_skill, timecode, vocabulary, work_dir, write_json

CHUNK = 5            # images per request on the Models API
MAX_IMAGES = 60      # 12 requests for a 7 min tutorial; the frames a sentence points to come first
MAX_TOKENS = 16000

# The shape every answer must have. Missing keys are filled from here, so the renderer
# and the site never break on a short answer.
SKELETON = {
    "software": {"name": "", "version": "", "evidence": ""},
    "task": {"name": "", "description": "", "goal": ""},
    "preconditions": [],      # {"text", "source": said|shown|both}
    "steps": [],              # {"t", "frame", "intent", "action", "ui_text": [], "expect", "source"}
    "field_mapping": [],      # {"input", "field", "where", "note"}
    "exception_rules": [],    # {"rule", "t", "source"}
    "final_check": [],        # str
    "not_covered": [],        # str
    "transcript_fixes": [],   # {"t", "heard", "meant", "why"}
    "drift_risks": [],        # str
    "confidence": {"level": "medium", "why": ""},
}

SYSTEM = """You turn a software tutorial video into the knowledge a browser agent needs to do the same task in the same software later, possibly in a newer version.

You get the video as a storyboard, a few screenshots at a time, in order. Each screenshot has its timecode, whether it was kept because the screen changed ("screen change") or on a timer ("tick"), and the sentences the narrator spoke while it was on screen (none in the images-only variant). The narration is an automatic transcription in the language of the tutorial: it can mishear product words, so trust what you read on screen over what was heard, and record each correction in transcript_fixes.

You maintain one JSON object, the understanding of the tutorial, with exactly these keys:
- software: {name, version (read on screen, "" if never visible), evidence (frame and timecode where seen)}
- task: {name (kebab-case ASCII skill name: the software, then the task the video shows, in a few words), description (one sentence starting with "Use when"), goal (one sentence)}
- preconditions: [{text, source}]
- steps: [{t (seconds), frame (file name, e.g. 0041.jpg), intent (why the step exists, independent of the current label), action (the action with the exact text of the menu, button or field), ui_text (list of the exact labels, verbatim), expect (what the screen shows once done), source}]
- field_mapping: [{input (a datum the task needs), field (exact label on screen), where (page or section), note (format, default, or "")}]
- exception_rules: [{rule, t, source}] only the rules the narrator states or the screen shows
- final_check: [string] what must be visible when the task succeeded
- not_covered: [string] what an agent will need that the tutorial neither says nor shows
- transcript_fixes: [{t, heard, meant, why}]
- drift_risks: [string] steps whose labels or placement have probably changed in a newer version
- confidence: {level: low|medium|high, why}
source is "said", "shown" or "both".

Rules that matter for the agent:
- Exact labels, verbatim from the screen, in their original language, with accents and capitalization.
- Intent next to every step: the software may have changed, an agent that knows why a step exists finds the equivalent element when the label moved.
- Only what is said or shown. Never add steps, rules or fields the tutorial does not contain. Put what the agent will still need in not_covered.
- One observable action per step, in the order of the task.
- The skill covers ONE task: the main one the tutorial sets out to do (or the task named in the header). A tutorial often also shows configuration, permissions, alternatives to reach the same screen, and follow-up features (recording a payment, a credit note, a list, an export): keep them out of steps. Put configuration and permissions in preconditions, the rest in not_covered as one line each. A good skill has 10 to 25 steps; above that, you are describing more than the task.
- Keep everything already in the JSON that is still right; correct it when a later screenshot proves it wrong; add what the new screenshots show.
- Every text field in the language of the tutorial.

Answer with the complete updated JSON object only: no Markdown, no code fence, no comment."""


def vocabulary_words(project):
    return [v["value"] if isinstance(v, dict) else v for v in vocabulary(project)]


def pick_frames(frames, board, max_images):
    """Keep at most max_images frames: the ones a sentence points to first, then the biggest
    screen changes. Returns the kept frames sorted by time."""
    if len(frames) <= max_images:
        return frames
    used = {b["frame"] for b in board}
    ranked = sorted(frames, key=lambda f: (f["file"] in used, f.get("score", 0)), reverse=True)
    return sorted(ranked[:max_images], key=lambda f: f["t"])


def attach_sentences(frames, board):
    """Sentences of the storyboard grouped on the kept frame shown when they start."""
    times = [f["t"] for f in frames]
    by_frame = {f["file"]: [] for f in frames}
    index = {f["file"]: i for i, f in enumerate(frames)}
    for b in board:
        i = index.get(b["frame"])
        if i is None:  # its frame was not kept: the last kept frame before it
            i = max(bisect.bisect_right(times, b["t"] + 0.5) - 1, 0)
        by_frame[frames[i]["file"]].append(b)
    return by_frame


def data_uri(path):
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()


def header(project, frames, board, images_only, task=""):
    sw = project.get("software", {})
    duration = max([f["t"] for f in frames] + [b.get("end", b["t"]) for b in board])
    return "\n".join([
        f"Tutorial video `{project['id']}`, spoken in {'English' if project.get('lang') == 'en' else 'French'}, "
        f"about {timecode(duration)} long, {len(frames)} screenshots in all.",
        f"The agent will later do the task in: {sw.get('name', 'the same software')} at {sw.get('url', '?')} "
        f"(possibly a newer version than the one in the video).",
        "Variant: images only, no narration." if images_only else "Variant: voice, with the narration under each screenshot.",
    ] + ([f"Words of this software likely to appear: {', '.join(vocabulary_words(project))}."] if vocabulary_words(project) else [])
      + ([f"The task to learn: {task}. Only that task goes in steps."] if task else []))


def chunk_content(chunk, work, by_frame):
    content = []
    for f in chunk:
        reason = "screen change" if f.get("reason") == "scene" else "tick"
        content.append({"type": "text", "text": f"[{timecode(f['t'])} · {f['file']} · {reason}]"})
        content.append({"type": "image_url", "image_url": {"url": data_uri(work / "frames" / f["file"])}})
        for b in by_frame.get(f["file"], []):
            content.append({"type": "text", "text": f"[{timecode(b['t'])}] Narrator: « {b['sentence']} »"})
    return content


def complete(u):
    """The understanding with every key of SKELETON, lists of dicts cleaned of odd entries."""
    out = copy.deepcopy(SKELETON)
    for k, default in SKELETON.items():
        v = u.get(k)
        if isinstance(default, dict) and isinstance(v, dict):
            out[k] = {**default, **{kk: v.get(kk, dv) for kk, dv in default.items()}}
        elif isinstance(default, list) and isinstance(v, list):
            out[k] = [x for x in v if x not in (None, "", {})]
    # the model sometimes puts a bare string in a list of objects
    for k in ("steps", "exception_rules", "preconditions", "field_mapping", "transcript_fixes"):
        out[k] = [x if isinstance(x, dict) else {"action" if k == "steps" else "rule" if k == "exception_rules" else "text": str(x)}
                  for x in out[k]]
    for s in out["steps"]:
        s.setdefault("t", 0)
        s.setdefault("frame", "")
        s.setdefault("intent", "")
        s.setdefault("action", "")
        s.setdefault("expect", "")
        s.setdefault("source", "shown")
        if not isinstance(s.get("ui_text"), list):
            s["ui_text"] = [s["ui_text"]] if s.get("ui_text") else []
    for r in out["exception_rules"]:
        r.setdefault("rule", ""), r.setdefault("t", 0), r.setdefault("source", "said")
    for p in out["preconditions"]:
        p.setdefault("text", ""), p.setdefault("source", "said")
    for m in out["field_mapping"]:
        for k in ("input", "field", "where", "note"):
            m.setdefault(k, "")
    for f in out["transcript_fixes"]:
        for k in ("heard", "meant", "why"):
            f.setdefault(k, "")
        f.setdefault("t", 0)
    out["final_check"] = [str(x) for x in out["final_check"]]
    out["not_covered"] = [str(x) for x in out["not_covered"]]
    out["drift_risks"] = [str(x) for x in out["drift_risks"]]
    if out["confidence"].get("level") not in ("low", "medium", "high"):
        out["confidence"]["level"] = "medium"
    return out


def ask(messages, model, usage_total):
    """One request; a non-JSON answer gets one repair request. Returns (understanding, model)."""
    text, model, usage = h_chat(messages, model=model, max_tokens=MAX_TOKENS)
    usage_total["tokens"] += usage.get("total_tokens", 0)
    usage_total["requests"] += 1
    u = parse_json(text)
    if u is None:
        text, model, usage = h_chat(
            [{"role": "system", "content": "You fix JSON. Answer with one valid JSON object only."},
             {"role": "user", "content": "Return this as one valid JSON object, same content:\n\n" + text}],
            model=model, max_tokens=MAX_TOKENS)
        usage_total["tokens"] += usage.get("total_tokens", 0)
        usage_total["requests"] += 1
        u = parse_json(text)
    if u is None:
        raise SystemExit(f"{model} did not answer with JSON; last answer starts with: {text[:200]!r}")
    return u, model


def understand(work, project, frames, board, images_only, model, task=""):
    """The requests: one per chunk of images, each updating the JSON, then one to consolidate."""
    by_frame = attach_sentences(frames, board) if not images_only else {}
    head = header(project, frames, board, images_only, task)
    usage_total = {"tokens": 0, "requests": 0}
    u, t0 = copy.deepcopy(SKELETON), time.time()
    for i in range(0, len(frames), CHUNK):
        chunk = frames[i:i + CHUNK]
        intro = (f"{head}\n\nCurrent understanding (JSON):\n{json.dumps(u, ensure_ascii=False)}\n\n"
                 f"Screenshots {i + 1} to {i + len(chunk)} of {len(frames)}. Update the JSON with what they show.")
        u, model = ask([{"role": "system", "content": SYSTEM},
                        {"role": "user", "content": [{"type": "text", "text": intro}] + chunk_content(chunk, work, by_frame)}],
                       model, usage_total)
        u = complete(u)
        print(f"  {i + len(chunk)}/{len(frames)} images, {len(u['steps'])} steps so far, {time.time() - t0:.0f} s", flush=True)
    u, model = ask([{"role": "system", "content": SYSTEM},
                    {"role": "user", "content": f"{head}\n\nAll screenshots have been seen. Consolidate this understanding: "
                     "steps in the order of the task, no duplicate, one observable action per step, only the main task in steps "
                     "(configuration in preconditions, follow-up features in not_covered), exact labels kept. "
                     "Return the complete JSON only.\n\n" + json.dumps(u, ensure_ascii=False)}],
                   model, usage_total)
    u = complete(u)
    print(f"done in {time.time() - t0:.0f} s, {usage_total['requests']} requests, {usage_total['tokens']} tokens, model {model}")
    return u, model, usage_total


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--variant", default=None, help="old-voice (default) or old-images; names the output files")
    p.add_argument("--images-only", action="store_true", help="send the frames without the narration")
    p.add_argument("--model", default=INDUCE_MODEL, help="holo4-27b; falls back to the free model if refused")
    p.add_argument("--max-images", type=int, default=MAX_IMAGES)
    p.add_argument("--task", default="", help="the one task the skill must cover, e.g. 'create and validate a supplier invoice'; "
                                               "otherwise the main task of the tutorial")
    p.add_argument("--fresh", action="store_true", help="ignore the saved answer and ask again")
    p.add_argument("--dry-run", action="store_true", help="print the size of the request, do not call")
    a = p.parse_args()
    variant = a.variant or ("old-images" if a.images_only else "old-voice")

    work = work_dir(a.video_id)
    project = read_json(work / "project.json") if (work / "project.json").exists() else \
        {"id": a.video_id, "lang": "fr", "software": {"name": "Dolibarr (demo)", "url": "http://localhost:8080"}}
    frames = sorted(read_json(work / "frames.json"), key=lambda f: f["t"])
    board = [] if a.images_only else read_json(work / "storyboard.json")
    if not frames:
        raise SystemExit("frames.json is empty: run 30_keyframes.py first")
    kept = pick_frames(frames, board, a.max_images)
    requests = (len(kept) + CHUNK - 1) // CHUNK + 1
    if a.dry_run:
        print(f"{len(kept)} images of {len(frames)} frames, {len(board)} sentences, {requests} requests to {a.model}")
        return

    raw_path = work / f"induce.{variant}.json"
    u_path = work / f"understanding.{variant}.json"
    repaired = read_json(u_path) if u_path.exists() else {}
    repaired = repaired if isinstance(repaired, dict) and repaired.get("repairs") and not a.fresh else None
    if repaired:
        # 75_repair.py wrote repairs into understanding.json, not into the raw cache: a rerun of this
        # step (the pipeline, make prep) must not put the 2021 skill back. --fresh starts over.
        print(f"keeping {u_path.name}: it holds {len(repaired['repairs'])} repair(s) (--fresh to induce again and drop them)")
        raw = read_json(raw_path) if raw_path.exists() else repaired.get("meta") or {}
        u = {k: v for k, v in repaired.items() if k != "meta"}
    elif raw_path.exists() and not a.fresh:
        print(f"reusing {raw_path.name} (--fresh to ask again)")
        raw = read_json(raw_path)
        u = complete(raw["understanding"])
    else:
        print(f"{len(kept)} images of {len(frames)} frames, {len(board)} sentences, {requests} requests to {a.model}", flush=True)
        try:
            u, model, usage = understand(work, project, kept, board, a.images_only, a.model, a.task or project.get("task", ""))
        except RuntimeError as e:
            raise SystemExit(f"Models API failed: {e}")
        if not u["steps"]:
            raise SystemExit("the understanding has no step: see the answer, then rerun with --fresh")
        if not u["task"]["name"]:
            u["task"]["name"] = re.sub(r"[^a-z0-9]+", "-", f"{project.get('software', {}).get('name', 'task')} {a.video_id}".lower()).strip("-")
        raw = {"variant": variant, "model": model, "images": len(kept), "frames": len(frames), "sentences": len(board),
               "requests": usage["requests"], "tokens": usage["tokens"], "understanding": u}
        write_json(raw_path, raw)

    meta = {**((repaired or {}).get("meta") or {}), **{k: raw.get(k) for k in ("variant", "model", "images", "frames", "sentences", "requests", "tokens") if raw.get(k) is not None}}
    write_json(u_path, {"meta": meta, **u})
    skill_path = work / f"SKILL.{variant}.md"
    skill_path.write_text(render_skill(u, project.get("lang", "fr")))
    print(f"wrote {skill_path.relative_to(ROOT)}")
    print(f"{len(u['steps'])} steps, {len(u['field_mapping'])} fields, {len(u['exception_rules'])} rules, "
          f"{len(u['transcript_fixes'])} transcript fixes, confidence {u['confidence']['level']}")


if __name__ == "__main__":
    main()
