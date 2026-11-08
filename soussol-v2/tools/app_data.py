# Construit src/data/app.json pour toutes les pages de l'app, depuis les vraies sorties du pipeline :
# report/ (banc, lignes à règle de maison, dérives, erreurs), work/<id>/ (images clés, horodatage), data/subs (voix).
# Aucune valeur inventée : un champ absent reste absent et la page le dit.
import json, re, csv, sys, os
clean = lambda x: re.sub(r"\s*[;\u2014\u2013]\s*", ", ", x).replace("...", "")
root = sys.argv[1]
VID = "JZMgB1UItkk"
# Copies anglaises des textes en français (scripts/56_translate.py), absentes tant que l'étape n'a pas tourné.
EN = json.load(open(f"{root}/work/{VID}/translations.en.json")) if os.path.exists(f"{root}/work/{VID}/translations.en.json") else {}
en = lambda x: EN.get(x.strip(), x)

voice = []
voice_source = "captions" if os.path.exists(f"{root}/data/subs/{VID}.fr.json3") else "gladia"
if voice_source == "captions":
    subs = json.load(open(f"{root}/data/subs/{VID}.fr.json3"))
    for e in subs["events"]:
        t = "".join(s.get("utf8", "") for s in e.get("segs", [])).replace("\n", " ").strip()
        if t: voice.append({"t": round(e["tStartMs"] / 1000, 2), "s": t})
else:  # sans les sous-titres YouTube (data/ n'est pas versionné) : la transcription Gladia du pipeline
    gladia = json.load(open(f"{root}/work/{VID}/gladia.json"))
    for u in gladia["result"]["transcription"]["utterances"]:
        t = u["text"].replace("\n", " ").strip()
        if t: voice.append({"t": round(u["start"], 2), "s": t})
frames = json.load(open(f"{root}/work/{VID}/frames.json"))
def said_at(t):
    cur = None
    for v in voice:
        if v["t"] <= t + 1.2: cur = v
        else: break
    return cur
shots = []
for i, f in enumerate(frames):
    v = said_at(f["t"])
    shots.append({"n": i + 1, "file": f["file"], "t": f["t"], "reason": f["reason"], "said": v["s"] if v else None, "said_t": v["t"] if v else None})

runs = []
for r in csv.DictReader(open(f"{root}/report/bench.csv")):
    num = lambda k, c=float: (c(r[k]) if r[k] not in ("", None) else None)
    runs.append({
        "id": r["run_id"], "arm": r["arm"], "row": int(r["row_id"]), "rule": r["piege"] or None,
        "revision": num("skill_revision", int), "started_at": r["started_at"], "finished_at": r["finished_at"],
        "duration": num("duration_s", int), "status": r["status"], "error": r["error_code"] or None,
        "verdict": r["verdict"], "steps": num("steps", int), "cost": num("total_cost_usd"),
        "skill_loaded": r["skill_loaded"] == "True", "before": num("db_rows_before", int), "after": num("db_rows_after", int),
        "agent_created": {"True": True, "False": False}.get(r["answer_created"]),
        "agent_validated": {"True": True, "False": False}.get(r["answer_validated"]),
        "agent_ttc": num("answer_total_ttc"), "sql_ht": num("sql_total_ht"), "sql_status": num("sql_status", int),
        "drifts": num("drift_count", int), "share_url": r["share_url"] or None,
        "note": clean(r["note"] or "") or None,
    })
runs.sort(key=lambda x: x["started_at"])

# erreurs : ce que l'agent a dit, par ligne de facture (report/errors.md)
said = {}
for line in open(f"{root}/report/errors.md"):
    m = re.match(r"\| old-voice \| (\d+) ([^|]+) \| (\w+) \| ([^|]*) \| ([^|]*) \|", line)
    if m:
        said[(int(m.group(1)), m.group(3))] = {"supplier": m.group(2).strip(), "what": m.group(4).strip(), "agent": clean(en(m.group(5).strip()))}
suppliers = {k[0]: v["supplier"] for k, v in said.items()}
suppliers.update({3: "Transports Lemaire", 27: "Café du Coin"})
for r in runs:
    e = said.get((r["row"], r["verdict"]))
    if e: r["agent_said"] = e["agent"]
    r["supplier"] = suppliers.get(r["row"])

traps = json.load(open(f"{root}/report/bench_traps.json"))
rules = {}
for line in open(f"{root}/report/bench.md"):
    m = re.match(r"\| (\d+) \| (\w+) . (.+?) \| (\w+) \|", line)
    if m: rules[int(m.group(1))] = {"rule": m.group(2), "text": clean(m.group(3).strip()), **({"text_en": clean(EN[m.group(3).strip()])} if m.group(3).strip() in EN else {})}
drift = []
for line in open(f"{root}/report/drift.md"):
    m = re.match(r"- (.+) . seen in (\d+)/(\d+) run", line)
    if m: drift.append({"fr": clean(m.group(1).strip()), "seen": int(m.group(2)), "of": int(m.group(3))})

# tableaux du banc tels que 95_report.py les a écrits (report/bench.md) : lignes à règle de maison, puis saisie générique
arms_tables = {"traps": [], "generic": []}
part = "traps"
for line in open(f"{root}/report/bench.md"):
    if line.startswith("# Saisie"): part = "generic"
    m = re.match(r"\| (No tutorial|2021 tutorial) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) \| (\d+) s \| ([\d.]+) \| (\d+)/(\d+) \|", line)
    if m:
        g = m.groups()
        arms_tables[part].append({"arm": g[0], "n": int(g[1]), "success": int(g[2]), "partial": int(g[3]), "failed": int(g[4]),
                                  "steps": int(g[5]), "duration": int(g[6]), "cost": float(g[7]), "skill_loaded": int(g[8])})
noops = sum(1 for r in runs if r["verdict"] == "noop")

out = {
    "snapshot": "2026-11-07",
    "video": {"id": VID, "title": "Tutoriel 17 FR Dolibarr", "channel": "Dolibarr association", "license": "CC BY",
              "published": "2021-02-05", "duration": 420, "url": f"https://www.youtube.com/watch?v={VID}", "language": "fr",
              "frames": len(frames)},
    "voice": voice, "voice_source": voice_source, "shots": shots, "runs": runs, "traps": traps, "rules": rules, "drift": drift, "bench": arms_tables, "noops": noops,
}
dest = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src", "data")
os.makedirs(dest, exist_ok=True)
json.dump(out, open(f"{dest}/app.json", "w"), ensure_ascii=False, indent=0)
# la landing (chain.ts, screen.ts) lit tutorial.json : même voix, mêmes images, banc brut
keep = ["run_id", "arm", "row_id", "piege", "skill_revision", "started_at", "duration_s", "verdict", "steps", "total_cost_usd",
        "db_rows_before", "db_rows_after", "answer_created", "share_url"]
raw = [{k: r[k] for k in keep} for r in csv.DictReader(open(f"{root}/report/bench.csv"))]
json.dump({"video": {"id": VID, "duration": 420, "frames": len(frames)}, "frameTimes": [f["t"] for f in frames], "voice": voice, "runs": raw},
          open(f"{dest}/tutorial.json", "w"), ensure_ascii=False)
print(len(voice), len(shots), len(runs), len(drift), list(rules))
