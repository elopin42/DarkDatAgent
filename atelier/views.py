"""Pages of the site. Views only shape data for templates; data comes from data.py.
The app pages (/start/, /welcome/, /setup/, /new/, /projects/) are local only: they write on this machine.

`make` opens /start/: the welcome until the accounts are connected, then the video form
until a first video is added, then the list of videos."""
import json
import re
from datetime import datetime
from urllib.parse import urlsplit

from functools import wraps

from django.http import FileResponse, Http404, HttpResponseForbidden
from django.shortcuts import redirect, render
from django.urls import reverse
from django.utils import timezone

from . import data, keys as api_keys, projects, software

BENCH_ARMS = ("none", "old-voice", "new-voice")
NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six"]
LANDING_CAPTURE_2021 = "0025.jpg"  # 1:31, the new supplier invoice form, supplier field
CAPTURES = projects.ROOT / "atelier" / "static" / "atelier" / "captures"


def _common():
    """What every public page needs: sample or real data, and where the keyframes come from."""
    return {"sample": data.is_sample(), "frames_vid": data.frames_video_id()}


def frame(request, vid, name):
    """A keyframe of the bench tutorial, public: the storyboard, drift report and demo board show them.
    Only that video: the other projects stay on the local app (project_frame)."""
    if not re.match(r"^[0-9]{4}\.jpg$", name) or vid != data.frames_video_id():
        raise Http404()
    path = projects.WORK / vid / "frames" / name
    if not path.exists():
        raise Http404()
    return FileResponse(open(path, "rb"), content_type="image/jpeg")


def landing(request):
    rows = [{"arm": data.arm(k), "s": data.summary(k)} for k in BENCH_ARMS if data.arm(k)]
    drift = data.drift()
    return render(request, "atelier/landing.html", {
        **_common(),
        "rows": rows,
        "drift": drift,
        "drift_count_word": NUMBER_WORDS[len(drift)] if len(drift) < len(NUMBER_WORDS) else len(drift),
        "old_n": data.summary("old-voice")["n"],
        "bench_runs": len(data.runs()),
        "capture_2021": LANDING_CAPTURE_2021,
        "has_capture_2026": (CAPTURES / "agent-2026.png").exists(),
        "first_run": next(iter(data.runs("old-voice")), None) or next(iter(data.runs()), None),
        **_trap_table(),
    })


def pipeline(request):
    all_runs = data.runs()
    total_cost = sum(r["cost"] for r in all_runs)
    sentences, frames = len(data.storyboard()), data.video()["frames"]
    steps = []
    for s in data.PIPELINE:
        out = s["out"]
        if s["n"] == 2:
            out = f"transcript.json · {sentences} sentences"
        elif s["n"] == 3:
            out = f"frames/ · {frames} images"
        steps.append({**s, "out": out})
    return render(request, "atelier/pipeline.html", {
        **_common(),
        "page": "pipeline",
        "video": data.video(),
        "sentences": sentences,
        "sessions": len(all_runs),
        "arms_run": sum(1 for a in data.arms() if not a.get("not_run")),
        "total_cost": total_cost,
        "cost_per_run": total_cost / len(all_runs) if all_runs else 0,
        "steps": steps,
        "decisions": data.DECISIONS if data.is_sample() else [],
    })


def storyboard(request):
    mode = "images" if request.GET.get("mode") == "images" else "voice"
    return render(request, "atelier/storyboard.html", {
        **_common(),
        "page": "storyboard",
        "video": data.video(),
        "shots": data.storyboard(),
        "mode": mode,
    })


def _skill_markdown(k):
    exceptions = "\n".join(f"- {e['text']}" for e in k["exceptions"]) or "(none stated or shown)"
    return "\n".join([
        "---",
        f"name: {k['name']}",
        f"description: {k['description']}",
        "---",
        "## Preconditions",
        *[f"- {p}" for p in k["preconditions"]],
        "",
        "## Steps",
        *[f"{i}. {s['text']}" for i, s in enumerate(k["steps"], 1)],
        "",
        "## Field mapping",
        *[f"- {a} → {b}" for a, b in k["mapping"]],
        "",
        "## Exception rules",
        exceptions,
        "",
        "## Final check",
        k["check"],
    ])


def skills(request, key=None):
    all_skills = data.skills()
    key = key or ("old-voice" if "old-voice" in all_skills else next(iter(all_skills)))
    k = data.skill(key)
    if not k:
        raise Http404("Unknown skill")
    arm = data.arm(key) or {"key": key, "label": k["label"], "agent": "—", "skill": key, "not_run": True}
    drift_steps = {d["step"] for d in data.drift()} if key == "old-voice" else set()
    steps = [{**s, "n": i, "drifted": i in drift_steps} for i, s in enumerate(k["steps"], 1)]
    return render(request, "atelier/skills.html", {
        **_common(),
        "page": "skills",
        "key": key,
        "k": k,
        "steps": steps,
        "tabs": [(slug, s["label"]) for slug, s in all_skills.items()],
        "view": "md" if request.GET.get("view") == "md" else "doc",
        "markdown": _skill_markdown(k),
        "arm": arm,
        "s": data.summary(arm["key"]),
        "drift_count": len(data.drift()),
        "show_drift": key == "old-voice",
    })


def board(request):
    arms = {}
    for a in data.arms():
        k = data.skill(a["skill"]) if a["skill"] else None
        if a.get("not_run") or (a["skill"] and not k):
            continue
        arms[a["key"]] = {
            "label": a["label"],
            "skill": None if not k else {
                "revision": k["revision"],
                "steps": k["steps"],
                "source": {
                    "date": k["source"]["published_short"],
                    "duration": k["source"]["duration"],
                    "is_2021": a["skill"].startswith("old"),
                },
            },
        }
    payload = {
        "invoices": data.invoices(),
        "storyboard": [{"t": s["t"], "en": s["en"], "frame": s["frame"]} for s in data.storyboard()],
        "script": data.DEMO_SCRIPT,
        "arms": arms,
        "sessions": {f"{r['arm']}-{r['row']:02d}": r["session"] for r in data.runs()},
    }
    return render(request, "atelier/board.html", {**_common(), "page": "board", "payload": payload,
                                                  "arm_options": [(k, v["label"]) for k, v in arms.items()]})


def bench(request):
    current = request.GET.get("arm", "all")
    if current != "all" and not data.arm(current):
        current = "all"
    rows = [{"arm": a, "s": data.summary(a["key"])} for a in data.arms()]
    n, o, w, rep = (data.summary(k) for k in ("none", "old-voice", "new-voice", "old-voice-repaired"))
    all_runs = data.runs()
    self_wrong = sum(data.summary(a["key"])["self_wrong"] for a in data.arms())

    def vs(a, b, what, why_missing):
        if not a["n"] or not b["n"]:
            return "not measured yet", why_missing
        d = a["success"] - b["success"]
        return f"{d:+d} invoice{'s' if abs(d) != 1 else ''}, {a['steps'] - b['steps']:+.0f} steps", what

    def repaired():
        rs = sorted(data.runs("old-voice-repaired"), key=lambda r: r.get("id", ""))
        if not rs:
            return "not measured yet", "needs a bench run with --repair (arm “2021 tutorial, repaired”)"
        revs = [r["skill_revision"] for r in rs if r.get("skill_revision") is not None]
        drifts = [len(r.get("drift_texts") or []) for r in rs]
        rev = f"skill revision {min(revs)} → {max(revs)}, " if revs else ""
        return (f"{rev}drifts per run {drifts[0]} → {drifts[-1]}",
                f"{len(rs)} run{'s' if len(rs) != 1 else ''} of the 2021 tutorial, repaired after each run that hit a drift")

    deltas = [
        ("What your house rules add", *vs(w, n, "internal video against no video", "needs the “No video” and “Internal video” arms")),
        ("What the 2021 tutorial alone gives", *vs(o, n, "2021 tutorial against no video", "needs the “No video” and “2021 tutorial” arms")),
        ("What the repair gives", *repaired()),
        ("Agent wrongly thinks it succeeded", f"{self_wrong} runs of {len(all_runs)}", "it answers “created” while the database says partial, failed or duplicate"),
    ]
    tabs = [("all", "All", len(all_runs))] + [(a["key"], a["label"], len(data.runs(a["key"]))) for a in data.arms() if not a.get("not_run")]
    return render(request, "atelier/bench.html", {
        **_common(),
        "page": "bench",
        "rows": rows,
        "noops": sum(r["s"]["noop"] for r in rows),
        "deltas": deltas,
        "tabs": tabs,
        "current": current,
        "runs": data.runs(None if current == "all" else current),
        **_trap_table(),
    })


def _trap_table():
    """The house-rule rows, one column per arm that ran at least one of them."""
    traps = data.traps()
    keys = {c["arm"] for t in traps for c in t["cells"]}
    order = data.ARM_ORDER + sorted(keys - set(data.ARM_ORDER))
    labels = {c["arm"]: c["label"] for t in traps for c in t["cells"]}
    trap_arms = [{"key": k, "label": labels[k]} for k in order if k in keys]
    for t in traps:
        by = {c["arm"]: c for c in t["cells"]}
        t["by_arm"] = [by.get(a["key"]) for a in trap_arms]
        t["label"] = data.PIEGE_LABELS.get(t["piege"], t["piege"])
        t["rule"] = data.PIEGE_RULES.get(t["piege"], "")
    return {"traps": traps, "trap_arms": trap_arms, "trap_cols": len(trap_arms) + 2}


def _rate(x):
    try:
        return f"{float(x):g}%"
    except (TypeError, ValueError):
        return ""


def _receipt(r):
    """Left: what the agent says (its answer). Right: what the SQL database says (first row of run["sql"])."""
    a = r.get("answer") if isinstance(r.get("answer"), dict) else None
    agent = a and {"created": a.get("created"), "supplier_name": a.get("supplier_name") or "",
                   "total_ttc": a.get("total_ttc"), "validated": a.get("validated"), "notes": a.get("notes") or ""}
    db = None
    if r.get("sql_rows"):
        d = r["sql_rows"][0]
        lines = [x for x in d.get("lines") or [] if isinstance(x, dict)]
        db = {"supplier": d.get("supplier") or "", "siren": d.get("siren") or "", "total_ht": d.get("total_ht"),
              "tva": ", ".join(t for t in (_rate(x.get("tva_tx")) for x in lines) if t), "status": d.get("fk_statut")}
    elif r.get("sql"):
        d = r["sql"]
        db = {"supplier": d.get("supplier", ""), "siren": "", "total_ht": d.get("total_ht"),
              "tva": _rate(d.get("vat")), "status": d.get("status")}
    return {"agent": agent, "db": db}


def run(request, run_id):
    r = data.run(run_id)
    if not r:
        raise Http404("Unknown run")
    all_runs = data.runs()
    i = all_runs.index(r)
    inv = r["invoice"]
    sql = r["sql"]
    created = r["after"] - r["before"] if r["after"] is not None and r["before"] is not None else None
    compare = [
        ("Supplier", inv["supplier"], sql and sql["supplier"], bool(sql) and sql["supplier"] == inv["supplier"]),
        ("Supplier ref", inv["ref"], sql and inv["ref"], bool(sql)),
        ("Total before tax", f"€{inv['ht']:,.2f}", sql and f"€{sql['total_ht']:,.2f}", bool(sql) and abs(sql["total_ht"] - inv["ht"]) < 0.01),
        ("VAT rate", f"{inv['vat']:g}%", sql and f"{sql['vat']:g}%", bool(sql) and sql["vat"] == inv["vat"]),
        ("Status", "1 · validated", sql and ("1 · validated" if sql["status"] else "0 · draft"), bool(sql) and sql["status"] == 1),
        ("Rows created", "1", "—" if created is None else str(created), created == 1),
    ]
    receipt = _receipt(r)
    arm = data.arm(r["arm"]) or {"key": r["arm"], "label": r["arm"], "agent": r.get("agent", ""), "skill": None}
    k = data.skill(arm["skill"]) if arm["skill"] else None
    drift_by_id = {d["id"]: d for d in data.drift()}
    task = r.get("task") or data.invoice_task(inv, r.get("piege"))
    return render(request, "atelier/run.html", {
        **_common(),
        "page": "bench",
        "r": r,
        "inv": inv,
        "arm": arm,
        "skill": k,
        "compare": compare,
        "receipt": receipt,
        "prev": all_runs[i - 1] if i > 0 else None,
        "next": all_runs[i + 1] if i + 1 < len(all_runs) else None,
        "drifts": [drift_by_id[d] for d in r["drift"] if d in drift_by_id],
        "task": task,
        "answer_json": json.dumps(r["answer"], indent=2, ensure_ascii=False) if r["answer"] else "",
    })


def drift(request):
    old = data.runs("old-voice")
    total = sum(len(r["drift"]) for r in old)
    shots = data.storyboard()
    items = []
    for d in sorted(data.drift(), key=lambda d: -d["seen"]):
        before = [s for s in shots if d["t"] is not None and s["t"] <= d["t"]]
        items.append({**d, "runs": [r for r in old if d["id"] in r["drift"]], "shot": before[-1] if before else None})
    k = data.skill("old-voice")
    return render(request, "atelier/drift.html", {
        **_common(),
        "page": "drift",
        "items": items,
        "skill_steps": len(k["steps"]) if k else 0,
        "total": total,
        "per_run": total / len(old) if old else 0,
        "old_n": len(old),
        "old_counted": data.summary("old-voice")["n"],
        "old_success": data.summary("old-voice")["success"],
        "video": data.video(),
    })


LOCAL = {"127.0.0.1", "::1"}


def local_only(view):
    """The app pages write files and secrets on this machine: refuse any other client."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if request.META.get("REMOTE_ADDR") not in LOCAL:
            return HttpResponseForbidden("This page only works from the machine running the site.")
        return view(request, *args, **kwargs)
    return wrapped


@local_only
def keys(request):
    """Enter the pipeline API keys; they go to .env."""
    notices, checks = [], {}
    if request.method == "POST":
        removed = set(request.POST.getlist("remove"))
        for k in api_keys.KEYS:
            name = k["name"]
            value = request.POST.get(name, "").strip()
            if name in removed:
                api_keys.remove(name)
                notices.append(f"{k['label']}: removed.")
            elif value:
                try:
                    api_keys.save(name, value)
                    notices.append(f"{k['label']}: saved.")
                except ValueError as e:
                    notices.append(f"{k['label']}: not saved, {e}.")
        if request.POST.get("action") == "check":
            for k in api_keys.KEYS:
                ok, msg = api_keys.check(k["name"])
                checks[k["name"]] = {True: "OK, ", False: "FAILED, ", None: ""}[ok] + msg
        if not notices and not checks:
            notices.append("Nothing changed.")
        if request.POST.get("action") == "check" and all(
                c.startswith("OK") for n, c in checks.items() if n in api_keys.REQUIRED):
            return redirect(reverse("new") + "?connected=1")
    rows = [{**k, "check": checks.get(k["name"])} for k in api_keys.status()]
    return render(request, "atelier/keys.html", {
        "app": True, "page": "setup", "keys": rows, "notices": notices,
        "onboarding": not projects.all_projects(),
    })


def _ready():
    """Every required account is connected."""
    return all(k["set"] for k in api_keys.status() if not k["optional"])


@local_only
def welcome(request):
    """The first screen after `make`: what the app does, one button to get started."""
    return render(request, "atelier/welcome.html", {
        "app": True, "page": "welcome", "ready": _ready(), "has_projects": bool(projects.all_projects()),
    })


@local_only
def start(request):
    """Where `make` lands. First time: the welcome. Then: the list of videos."""
    if not _ready():
        return redirect("welcome")
    rows = projects.all_projects()
    if not rows:
        return redirect("new")
    for p in rows:
        p["state"] = projects.state(p["id"])
    return render(request, "atelier/start.html", {
        "app": True, "page": "home", "projects": rows, "keys": api_keys.status(),
    })


@local_only
def new(request):
    """Add a video and pick the software the agent will use, then start."""
    error = None
    if request.method == "POST":
        if not api_keys.read().get("GLADIA_API_KEY"):
            error = "Connect your Gladia account first (step 1)."
        else:
            try:
                sw_url, sw_name = _pick_software(request.POST)
                pid = projects.create(
                    upload=request.FILES.get("video"),
                    url=request.POST.get("url", ""),
                    lang=request.POST.get("lang", "fr"),
                    software_url=sw_url,
                    software_name=sw_name,
                    recent=request.POST.get("recent") == "1",
                )
            except ValueError as e:
                error = str(e)[:1].upper() + str(e)[1:] + "."
            else:
                projects.start(pid)
                return redirect("project", pid=pid)
    own_port = int(request.get_port() or 8000)
    demo_port = int(projects.DEMO_DOLIBARR.rsplit(":", 1)[1])
    return render(request, "atelier/new.html", {
        "app": True,
        "page": "new",
        "keys": api_keys.status(),
        "ready": _ready(),
        "detected": [a for a in software.detect(own_port) if a["port"] != demo_port],
        "connected": request.GET.get("connected") == "1",
        "dolibarr_up": projects.dolibarr_up(),
        "dolibarr_starting": projects.dolibarr_starting(),
        "onboarding": not projects.all_projects(),
        "error": error,
        "form": request.POST if request.method == "POST" else {},
    })


def _pick_software(post):
    """The software chosen on /start/: the demo Dolibarr, a detected app, or a typed address."""
    choice = post.get("software", "demo")
    if choice == "demo":
        return projects.DEMO_DOLIBARR, "Dolibarr (demo)"
    typed = post.get("software_url", "") if choice == "other" else choice
    url = software.normalize(typed)
    if not url:
        raise ValueError(f"“{typed}” is not a web address, try something like localhost:3000")
    title = software.probe(url)
    if title is None:
        raise ValueError(f"nothing answers at {url}: start the software, then try again")
    name = post.get("software_name", "").strip() if choice == "other" else ""
    return url, name or title or urlsplit(url).netloc


@local_only
def dolibarr_start(request):
    if request.method == "POST":
        projects.start_dolibarr()
        if re.match(r"^/projects/[\w-]+/$", request.POST.get("next", "")):  # back to the project page that asked
            return redirect(request.POST["next"])
    return redirect(reverse("new") + "#software")


STORY_WARNINGS = [
    ("Login needed: you must be signed in for what follows",
     re.compile(r"\b(se connecter|connectez|connect[ée]e?s?|connexion|log ?in|sign ?in|identifiant|mot de passe|password|authentifi)", re.I)),
    ("Module to enable first",
     re.compile(r"module\b.{0,40}\b(activ|enabl)|(activ|enabl)\w*\b.{0,20}\bmodule", re.I)),
    ("Needs the right permissions",
     re.compile(r"\b(droits?|permissions?|habilitation|administrat(eur|or))\b", re.I)),
]


def _warn(text):
    return next((label for label, rx in STORY_WARNINGS if rx.search(text or "")), "")


def _storyboard_with_warnings(shots, understanding):
    """Each shot gets a short warning when its sentence needs something first (login, module, rights).
    Login preconditions found by the understanding step go on the first shot."""
    shots = [dict(s, warn=_warn(s.get("sentence"))) for s in shots]
    pre = [x.get("text", "") for x in (understanding or {}).get("preconditions") or []]
    if shots and not shots[0]["warn"] and any(_warn(x).startswith("Login") for x in pre):
        shots[0]["warn"] = STORY_WARNINGS[0][0]
    return shots


VAT_RATES = (20.0, 10.0, 5.5, 2.1, 0.0)  # the French rates the demo Dolibarr knows


def _invoice_skill(u):
    """The video teaches supplier invoices: the demo list and the database check (llx_facture_fourn) apply.
    Any other video on the demo Dolibarr gets the free task only. Unknown (no understanding yet): as before."""
    if not u:
        return True
    t = u.get("task") or {}
    text = " ".join(str(t.get(k) or "") for k in ("name", "goal", "description")).lower().replace("-", " ")
    return "supplier invoice" in text or "facture fournisseur" in text


def _float(text, default=None):
    try:
        return float(str(text).replace(",", ".").replace(" ", ""))
    except ValueError:
        return default


def _typed_invoice(post):
    """The invoice typed in the "A new invoice" form, in the shape of a data/factures.csv row.
    Raises ValueError with what to fix, in words a newcomer understands."""
    f = {k: post.get(k, "").strip() for k in ("supplier", "reference", "date", "item", "amount", "vat")}
    if not f["supplier"]:
        raise ValueError("fill in the supplier")
    if not f["reference"]:
        raise ValueError("fill in the number of the supplier's invoice")
    try:
        day = datetime.strptime(f["date"], "%Y-%m-%d").date()
    except ValueError:
        raise ValueError("fill in the invoice date") from None
    if day > timezone.localdate():
        raise ValueError("the invoice date cannot be in the future: Dolibarr refuses it")
    if not f["item"]:
        raise ValueError("say what was bought: it goes on the invoice line")
    amount = _float(f["amount"], 0)
    if amount <= 0:
        raise ValueError("the amount before tax must be a number above 0, like 89.90")
    if _float(f["vat"]) not in VAT_RATES:
        raise ValueError("pick a VAT rate in the list")
    return {"fournisseur": f["supplier"], "ref_fournisseur": f["reference"], "date": day.isoformat(),
            "libelle": f["item"], "montant_ht": round(amount, 2), "tva": _float(f["vat"])}


@local_only
def project(request, pid):
    p = projects.get(pid)
    if not p:
        raise Http404("Unknown project")
    run_error, form = None, {}
    if request.method == "POST" and request.POST.get("action") == "run":
        kind, arm = request.POST.get("kind", ""), request.POST.get("arm", "skill")
        try:
            if kind == "new":
                projects.start_run(pid, invoice=_typed_invoice(request.POST), arm=arm)
            elif kind == "free":
                if not request.POST.get("task", "").strip():
                    raise ValueError("write the task in one sentence, with the data the agent must type")
                projects.start_run(pid, task=request.POST.get("task", ""), arm=arm)
            else:
                projects.start_run(pid, row=request.POST.get("row") or None, task=request.POST.get("task", ""), arm=arm)
        except ValueError as e:
            run_error, form = str(e)[:1].upper() + str(e)[1:] + ".", request.POST
        else:
            return redirect(reverse("project", kwargs={"pid": pid}) + "#runs")
    elif request.method == "POST" and request.POST.get("action") == "stop":
        try:
            projects.stop_run(request.POST.get("run", ""))
        except ValueError:
            pass
        return redirect(reverse("project", kwargs={"pid": pid}) + "#runs")
    elif request.method == "POST" and request.POST.get("action") == "pipeline":
        projects.start(pid)
        return redirect("project", pid=pid)
    elif request.method == "POST":  # unknown or missing action: never restart the pipeline (paid API calls) by accident
        return redirect("project", pid=pid)
    st, log = projects.status(pid)
    out = projects.outputs(pid)
    runs = projects.runs(pid)
    live_run = next((r for r in runs if r["status"] in ("starting", "running")), None)
    invoices = projects.invoices() if projects.is_demo(p) else []
    by_row = {i["id"]: i for i in invoices}
    for r in runs:
        r["log"] = projects.run_log(r["id"]) if r["status"] in ("starting", "running", "failed") else ""
        r["invoice"] = by_row.get(r.get("row")) or (r.get("invoice") if isinstance(r.get("invoice"), dict) else None)
        try:
            r["started"] = datetime.fromisoformat(r.get("started_at") or "")
        except ValueError:
            r["started"] = None
    steps = (st or {}).get("steps") or []
    now = next(({**s, "n": i + 1, "of": len(steps)} for i, s in enumerate(steps) if s.get("state") in ("running", "failed")), None)
    repairs = data.repairs(pid)
    audit_rows = data.audit(pid)
    skill_file = projects.WORK / pid / f"SKILL.{out['variant']}.md"
    revision = data.skill_revision(pid, out["variant"], repairs, runs)
    tr = data.translations(pid)
    u = out["understanding"]
    steps_u = (u or {}).get("steps") or []
    u_lang = "en" if p["lang"] == "en" or (steps_u and all(s.get("action", "").strip() in tr for s in steps_u)) else p["lang"]
    check_doli = projects.is_demo(p) and out["agent"] and not live_run  # the agent needs the demo Dolibarr to run
    doli_up = projects.dolibarr_up() if check_doli else True
    doli_starting = check_doli and not doli_up and projects.dolibarr_starting()
    return render(request, "atelier/project.html", {
        "dolibarr_up": doli_up,
        "dolibarr_starting": doli_starting,
        "repairs": repairs,
        "skill_revision": revision,
        "skill_download": skill_file.exists(),
        "variant": out["variant"],
        "audit_shown": data.audit_shown(audit_rows),
        "audit": audit_rows,
        "agent": out["agent"],
        "runs": runs,
        "live_run": live_run,
        "run_error": run_error,
        "form": form,
        "form_vat": _float(form.get("vat"), 20.0),
        "vat_rates": VAT_RATES,
        "suppliers": sorted({i["fournisseur"] for i in invoices}),
        "today": timezone.localdate(),
        "new_ref": timezone.localtime().strftime("DEMO-%m%d-%H%M%S"),
        "invoices": invoices,
        "demo": projects.is_demo(p),
        "invoice_skill": projects.is_demo(p) and _invoice_skill(u),
        "now": now,
        "app": True,
        "page": "project",
        "p": p,
        "st": st,
        "log": log,
        "live": (bool(st) and st["state"] == "running") or live_run or doli_starting,
        "storyboard": _storyboard_with_warnings(out["storyboard"] or [], out["understanding"]),
        "frames": len(out["frames"] or []),
        "sentences": len(out["transcript"] or []),
        "u": u,
        "tr": tr,
        "u_lang": u_lang,
        "skill": out["skill"],
    })


@local_only
def project_skill(request, pid):
    p = projects.get(pid)
    path = p and projects.WORK / pid / f"SKILL.{projects.variant(p)}.md"
    if not path or not path.exists():
        raise Http404()
    resp = FileResponse(open(path, "rb"), content_type="text/markdown; charset=utf-8")
    resp["Content-Disposition"] = 'attachment; filename="SKILL.md"'
    return resp


@local_only
def project_frame(request, pid, name):
    if not projects.get(pid) or not re.match(r"^[0-9]{4}\.jpg$", name):
        raise Http404()
    path = projects.WORK / pid / "frames" / name
    if not path.exists():
        raise Http404()
    return FileResponse(open(path, "rb"), content_type="image/jpeg")
