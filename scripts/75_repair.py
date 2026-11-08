"""[7b] The drift the agent reported -> the skill repaired, a new revision in the H catalog (modif.md §2.1).

Reads work/<id>/understanding.<variant>.json, gathers the `drift` lists of the runs given
(default: every run of the old-voice arm in work/runs/, deduplicated like 95_report.py),
and asks the H Models API (common.h_chat, never another provider) to update `steps[].ui_text`
and `steps[].action` so they match the screen the agent saw, listing each change in
`repairs` (step, before, after, seen_in_runs). Nothing else in the JSON changes. Then it
re-renders SKILL.<variant>.md (common.render_skill, the same as 50_induce.py), registers a
new revision of the skill and of the agent (60_register.py, agent.<variant>.json gets
`agent_ref` = name:N+1) and appends to work/<id>/repairs.json (cumulative). Each repair keeps
`revision` (the skill's) and `agent_revision` apart. If the catalog refuses, the files are
restored and nothing is logged.

Usage: python scripts/75_repair.py <video_id> [--variant old-voice] [--from-runs <run_id,...>]
       [--model holo4-27b] [--no-register] [--dry-run]
"""
import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone

from common import INDUCE_MODEL, ROOT, RUNS, h_chat, parse_json, project, read_json, render_skill, work_dir, write_json

MAX_TOKENS = 16000  # holo4-27b reasons at length before writing: a small budget returns no text

SYSTEM = """You maintain the structured understanding of a software tutorial (a JSON object) that an agent follows
as a skill. The software changed since the tutorial: the agent reported, run after run, which steps no longer
matched the screen. Repair the understanding so the steps describe the screen as observed now.
Rules: update only `steps[].ui_text` (exact labels, as seen now) and `steps[].action` (the sentence that names
them) of the steps concerned; keep every other field of every step and every other key of the JSON exactly as
given; never add, remove or reorder steps. Add a key `repairs`: a list with one object per changed step,
{"step": <1-based index>, "before": <the old action>, "after": <the new action>, "seen_in_runs": [<run ids
whose drift motivated it>]}. If a reported difference matches no step, ignore it. Answer with the complete JSON
object only, no commentary."""


def gather_drift(run_ids, variant):
    """[(text, [run_id…])] from the runs given, deduplicated, most frequent first."""
    if run_ids:
        paths = [RUNS / f"{r}.json" for r in run_ids]
    else:
        paths = sorted(RUNS.glob("*.json"))
    seen, counter = {}, Counter()
    for path in paths:
        if not path.exists():
            print(f"no run {path.name}", file=sys.stderr)
            continue
        run = json.loads(path.read_text())
        arm = run.get("bench_arm") or run.get("arm")
        if not run_ids and not (arm in ("old-voice", "skill", "old-voice-repaired") and run.get("variant") in (variant, None)):
            continue
        for d in set(d.strip() for d in run.get("drift") or [] if d and d.strip()):
            counter[d] += 1
            seen.setdefault(d, []).append(run["id"])
    return [(text, seen[text]) for text, _ in counter.most_common()]


def prompt(u, drift):
    lines = "\n".join(f"- {text} (runs: {', '.join(ids)})" for text, ids in drift)
    return (f"Understanding (JSON):\n{json.dumps(u, ensure_ascii=False)}\n\n"
            f"Differences reported by the agent between the skill's steps and the screen:\n{lines}\n\n"
            "Update `steps[].ui_text` and `steps[].action` to reflect the observed screen; add every change to a new "
            "list `repairs` (`step`, `before`, `after`, `seen_in_runs`); touch nothing else. Return the complete JSON.")


def apply(u, answer):
    """Take steps and repairs from the model's answer, keep everything else from `u`. Returns the repairs."""
    steps = answer.get("steps")
    if not isinstance(steps, list) or len(steps) != len(u["steps"]):
        raise SystemExit(f"the model returned {len(steps) if isinstance(steps, list) else 'no'} steps for {len(u['steps'])}: nothing written")
    repairs = []
    for i, (old, new) in enumerate(zip(u["steps"], steps), 1):
        if not isinstance(new, dict):
            continue
        action = str(new.get("action") or old["action"])
        ui_text = new.get("ui_text") or old["ui_text"]
        ui_text = [str(x) for x in (ui_text if isinstance(ui_text, list) else [ui_text])]  # a bare string is one label, not letters
        if action != old["action"] or ui_text != old["ui_text"]:
            repairs.append({"step": i, "before": old["action"], "after": action, "seen_in_runs": []})
            old["action"], old["ui_text"] = action, ui_text
    by_step = {r["step"]: r for r in repairs}
    for r in answer.get("repairs") or []:  # the run ids the model attributed to each change
        if isinstance(r, dict) and r.get("step") in by_step:
            by_step[r["step"]]["seen_in_runs"] = [str(x) for x in r.get("seen_in_runs") or []]
    return repairs


def register(video_id, variant):
    """60_register.py on the variant: new skill and agent revisions. Returns agent.<variant>.json."""
    subprocess.run([sys.executable, str(ROOT / "scripts/60_register.py"), video_id, "--variant", variant,
                    "--message", "repaired by 75_repair.py from the drift the agent reported"], cwd=ROOT, check=True)
    return read_json(work_dir(video_id) / f"agent.{variant}.json")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--variant", default="old-voice")
    p.add_argument("--from-runs", help="run ids whose drift to repair, comma-separated (default: every old-voice run)")
    p.add_argument("--model", default=INDUCE_MODEL)
    p.add_argument("--no-register", action="store_true", help="write the files, skip the H catalog")
    p.add_argument("--dry-run", action="store_true", help="show the drift and the prompt size, call nothing")
    a = p.parse_args()

    work = work_dir(a.video_id)
    u_path = work / f"understanding.{a.variant}.json"
    u = read_json(u_path)
    run_ids = [x.strip() for x in a.from_runs.split(",") if x.strip()] if a.from_runs else []
    drift = gather_drift(run_ids, a.variant)
    if not drift:
        print("no drift reported in these runs: nothing to repair")
        return
    for text, ids in drift:
        print(f"- {text} ({len(ids)} run(s))")
    messages = [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt(u, drift)}]
    if a.dry_run:
        print(f"dry run: {len(drift)} difference(s), prompt of {len(messages[1]['content'])} characters, model {a.model}")
        return

    text, model, usage = h_chat(messages, model=a.model, max_tokens=MAX_TOKENS)
    answer = parse_json(text)
    if answer is None:
        text, model, usage2 = h_chat([{"role": "system", "content": "You fix JSON. Answer with one valid JSON object only."},
                                      {"role": "user", "content": "Return this as one valid JSON object, same content:\n\n" + text}],
                                     model=model, max_tokens=MAX_TOKENS)
        answer = parse_json(text)
    if answer is None:
        raise SystemExit(f"{model} did not answer with JSON; the answer starts with: {text[:200]!r}")
    repairs = apply(u, answer)
    if not repairs:
        print("the model changed no step: nothing written")
        return
    seen_all = sorted({r for _, ids in drift for r in ids})
    for r in repairs:
        r["seen_in_runs"] = r["seen_in_runs"] or seen_all

    created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for r in repairs:
        r.update(revision=None, agent_revision=None, variant=a.variant, created_at=created_at)
    u["repairs"] = (u.get("repairs") or []) + repairs
    u.setdefault("meta", {})["repaired"] = {"at": created_at, "model": model, "tokens": usage.get("total_tokens"), "runs": seen_all}
    skill_path = work / f"SKILL.{a.variant}.md"
    # 60_register.py reads SKILL.md from disk, so the files are written first; if the catalog refuses,
    # both go back to what they were, and repairs.json is not touched: a rerun starts from a clean state.
    backup = {p: (p.read_text() if p.exists() else None) for p in (u_path, skill_path)}
    write_json(u_path, u)
    skill_path.write_text(render_skill(u, project(a.video_id).get("lang", "fr")))
    print(f"wrote work/{a.video_id}/SKILL.{a.variant}.md")
    revision = agent_revision = None
    if not a.no_register:  # new skill and agent revisions
        try:
            reg = register(a.video_id, a.variant)
        except subprocess.CalledProcessError as e:
            for p, text in backup.items():
                if text is None:
                    p.unlink(missing_ok=True)
                else:
                    p.write_text(text)
            raise SystemExit(f"60_register.py failed (exit {e.returncode}): understanding and SKILL.md restored, nothing repaired")
        # `revision` is the skill's (what the site shows and the bench records); the agent's own number
        # moves on every patch, even without a skill change, so it is kept apart.
        revision, agent_revision = reg.get("skill_revision") or reg.get("revision"), reg.get("revision")
        for r in repairs:
            r["revision"], r["agent_revision"] = revision, agent_revision
        write_json(u_path, u)
    log_path = work / "repairs.json"
    log = json.loads(log_path.read_text()) if log_path.exists() else []
    write_json(log_path, log + repairs)
    for r in repairs:
        print(f"step {r['step']}: {r['before'][:60]!r} -> {r['after'][:60]!r}")
    print(f"{len(repairs)} repair(s)" + (f", skill revision {revision}, agent revision {agent_revision}" if revision else " (not registered)"))


if __name__ == "__main__":
    main()
