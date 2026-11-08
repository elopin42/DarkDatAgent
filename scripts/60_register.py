"""[6] SKILL.<variant>.md -> a skill and an agent in the H catalog, revisions pinned.

The skill body is the file as written by step 5, never edited. The agent runs in a web
environment on this machine (host user_device: the SDK drives a local Chrome, profile
~/.hai/chrome-profile), starting at the software address of the project. A second agent
without any skill (`clerk-none-<id>`) is registered for the "no tutorial" arm.

Rerunning updates the catalog entries (a new revision each time something changed) and
rewrites work/<id>/agent.<variant>.json: names, pinned revisions, model. `base_revision` is
the first revision ever registered for the variant and never changes: the bench arm
old-voice measures it, old-voice-repaired follows `revision` (75_repair.py reruns this script
after each repair, with --message naming the repair).

Usage: python scripts/60_register.py <video_id> [--variant old-voice] [--model holo4-27b] [--message "…"]
"""
import argparse
import json
import re
from datetime import datetime, timezone

from common import AGENT_MODEL, load_env, need_env, project, slug, work_dir

VARIANTS = ["old-voice", "voice", "new-voice", "old-images", "images"]

INSTRUCTIONS = """You work in {software}, a web application already open in the browser at {url}.
Do exactly the task you are given, nothing more. If the loaded skill describes the task, follow its steps;
when a step no longer matches the screen (a menu or button renamed or moved), look for the equivalent
element, do the step, and report that difference in 'drift'.
Never create the same record twice: look at the existing list first, and if the record is already there, stop and say so.
Never delete or modify records other than the one you are asked to create.
If a login page shows up and you have no credentials, stop and explain in 'notes'.
Answer in the requested JSON format as soon as the task is done or impossible."""


def frontmatter(markdown):
    head = re.search(r"^---\s*\n(.*?)\n---", markdown, re.S)
    return dict(re.findall(r"^(\w+):\s*(.+)$", head.group(1), re.M)) if head else {}


def pick_variant(work, wanted):
    if wanted:
        return wanted
    for v in VARIANTS:
        if (work / f"SKILL.{v}.md").exists():
            return v
    raise SystemExit(f"no SKILL.<variant>.md in {work}: run 50_induce.py first")


def latest_revision(client, name):
    page = client.agents.list_agent_revisions(name, sort="-number", size=1)
    items = page.items if hasattr(page, "items") else []
    return items[0].number if items else 1


def missing(call):
    """True when the catalog answers 404 (the SDK raises a generic ApiError for it)."""
    from hai_agents.core.api_error import ApiError
    try:
        call()
        return False
    except ApiError as e:
        if e.status_code == 404:
            return True
        raise


def upsert_skill(client, name, description, body, source):
    if missing(lambda: client.skills.get_skill(name)):
        client.skills.create_skill(name=name, description=description, body=body, source=source)
        return "created"
    client.skills.patch_skill(name, description=description, body=body, source=source)
    return "updated"


def skill_revision(client, name):
    """The current revision of a skill. The catalog has no revisions endpoint for skills; the
    revision comes back as the ETag of GET /skills/{name} ("2"). None if the header is missing."""
    r = client.skills.with_raw_response.get_skill(name)
    etag = (getattr(r, "headers", None) or {}).get("etag", "")
    return int(etag.strip('"')) if etag.strip('"').isdigit() else None


def upsert_agent(client, name, description, env, skills, model, instructions, message="updated by 60_register.py"):
    kw = dict(description=description, environments=[env], model=model, instructions=instructions,
              skills=skills if skills else None)
    if missing(lambda: client.agents.get_agent(name)):
        client.agents.create_agent(name=name, **kw)
        return "created"
    client.agents.patch_agent(name, message=message, **kw)
    return "updated"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--variant", help="old-voice, voice, new-voice, old-images… (default: the first SKILL file found)")
    p.add_argument("--model", default=AGENT_MODEL)
    p.add_argument("--message", default="updated by 60_register.py", help="revision message in the catalog (75_repair.py: the repair)")
    a = p.parse_args()

    load_env()
    need_env("HAI_API_KEY")
    from hai_agents import Client
    from hai_agents.types import Environment_Web

    work = work_dir(a.video_id)
    proj = project(a.video_id)
    software, url = proj["software"]["name"], proj["software"]["url"]
    variant = pick_variant(work, a.variant)
    body = (work / f"SKILL.{variant}.md").read_text()
    fm = frontmatter(body)
    pid = slug(a.video_id)
    skill_name = f"tuto-{pid}-{slug(variant)}"
    agent_name = f"clerk-{pid}-{slug(variant)}"
    none_name = f"clerk-none-{pid}"
    description = fm.get("description") or f"Use when the task is the one taught by tutorial {a.video_id} in {software}."
    source = proj.get("source", {}).get("url") or ""

    client = Client()
    env = Environment_Web(id="laptop", host="user_device", start_url=url)
    instructions = INSTRUCTIONS.format(software=software, url=url)

    what = upsert_skill(client, skill_name, description, body, source)
    skill_rev = skill_revision(client, skill_name)
    # Pin the skill revision in the agent: an agent spec names a skill by `name:N`, and an unpinned
    # name resolves to the newest revision at session time. Without the pin, the arm old-voice
    # (agent revision 1) would load the skill repaired by 75_repair.py and measure nothing.
    skill_ref = f"{skill_name}:{skill_rev}" if skill_rev else skill_name
    print(f"skill {skill_name}: {what}, revision {skill_rev if skill_rev else 'unknown (not pinned!)'}")
    what = upsert_agent(client, agent_name, f"Does the task taught by a tutorial in {software}, following the skill {skill_name}.",
                        env, [skill_ref], a.model, instructions, a.message)
    rev = latest_revision(client, agent_name)
    print(f"agent {agent_name}:{rev}: {what}")
    what = upsert_agent(client, none_name, f"Does a task in {software} with no tutorial, from the task sentence alone.",
                        env, [], a.model, instructions)
    none_rev = latest_revision(client, none_name)
    print(f"agent {none_name}:{none_rev}: {what}")

    previous = work / f"agent.{variant}.json"
    base = (json.loads(previous.read_text()).get("base_revision") if previous.exists() else None) or rev
    out = {
        "variant": variant, "skill": skill_name, "skill_description": description, "skill_revision": skill_rev,
        "agent": agent_name, "agent_ref": f"{agent_name}:{rev}", "revision": rev, "base_revision": base,
        "none_agent": none_name, "none_agent_ref": f"{none_name}:{none_rev}", "none_revision": none_rev,
        "model": a.model, "software": proj["software"], "registered_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    text = json.dumps(out, ensure_ascii=False, indent=2) + "\n"
    (work / f"agent.{variant}.json").write_text(text)
    (work / "agent.json").write_text(text)  # the latest registration, what the site and 70_run_one.py use
    print(f"wrote work/{a.video_id}/agent.{variant}.json and agent.json")


if __name__ == "__main__":
    main()
