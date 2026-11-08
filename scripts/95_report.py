"""[9] report/bench.csv + work/runs/*.json -> report/bench.md, drift.md, errors.md (docs/BENCH.md).

bench.md starts with the house-rule rows (the CSV rows whose `piege` is set, one sentence per
row and per arm built from the SQL verdict: the pitch), then the generic entry. bench_traps.json
holds the same cells for the site: [{row, piege, arms: {arm: {verdict, run_id, sentence}}}].

Counts, not percentages (n is small, we say "pilot"). The runs are the ones listed in
report/bench.csv (written by 90_bench.py, every arm, even when the recent video is another
project); without bench.csv, every verified run of work/runs/. The drift report is the union
of the `drift` lists reported by the 2021 tutorial arm, deduplicated, sorted by frequency:
the tutorial's expiry report.

Usage: python scripts/95_report.py [--video-id JZMgB1UItkk]
"""
import argparse
import csv
import json
import re
from collections import Counter

from common import REPORT, ROOT, RUNS, invoices, skill_revision_of

ARM_LABEL = {"none": "No tutorial", "old-voice": "2021 tutorial", "new-voice": "Recent video",
             "old-voice-repaired": "2021 tutorial, repaired", "old-images": "2021 tutorial, no voice", "skill": "With the tutorial's skill"}
ARM_FR = {"none": "sans vidéo", "old-voice": "tuto 2021", "new-voice": "vidéo interne",
          "old-voice-repaired": "tuto 2021 réparé", "old-images": "tuto 2021 sans voix", "skill": "avec le skill"}
ARM_ORDER = ["none", "old-voice", "old-voice-repaired", "new-voice", "old-images", "skill"]
RULES = {"doublon": "deux Transports Lemaire : prendre celui qui a un SIREN", "tva": "Café du Coin : toujours TVA 5,5 %"}
OLD_ARMS = ("old-voice", "skill", "old-voice-repaired")  # the arms whose drift says where the old tutorial is out of date


def arm_of(r):
    return r.get("bench_arm") or r["arm"]


def load_runs(video_id):
    rows = {r["id"]: r for r in invoices()}
    bench = REPORT / "bench.csv"
    if bench.exists():
        with open(bench, newline="", encoding="utf-8") as f:
            ids = [row["run_id"] for row in csv.DictReader(f) if row.get("verdict")]
        paths = [RUNS / f"{i}.json" for i in ids]
    else:
        paths = sorted(RUNS.glob("*.json"))
    runs = []
    for path in paths:
        if not path.exists():
            continue
        r = json.loads(path.read_text())
        if (video_id and not bench.exists() and r.get("project") != video_id) or r.get("row") is None or "verdict" not in r:
            continue
        r["arm"] = arm_of(r)
        r.setdefault("piege", rows.get(r["row"], {}).get("piege") or "")
        if r.get("skill_revision") is None:
            r["skill_revision"] = skill_revision_of(r)
        runs.append(r)
    return runs


def avg(xs):
    xs = [x for x in xs if isinstance(x, (int, float))]
    return sum(xs) / len(xs) if xs else 0


def answer_of(run):
    """The agent's answer as a dict; the agent sometimes answers plain text."""
    a = run.get("answer")
    return a if isinstance(a, dict) else {}


def contradicts(run):
    """The agent's report against the database: an invoice it says it created that this run did not add, or one
    it says validated that is still a draft. A draft reported as a draft is not a contradiction."""
    a, before, after = answer_of(run), run.get("db_rows_before"), run.get("db_rows_after")
    if not a.get("created") or before is None or after is None:
        return False
    sql = (run.get("sql") or [{}])[0]
    validated = isinstance(sql, dict) and str(sql.get("fk_statut")) == "1"
    return after <= before or bool(a.get("validated") and not validated)


def counted(runs):
    """The runs the counts are made of: `noop` runs (the invoice already existed, the agent rightly
    created nothing) measure nothing and stay out. They remain in the run list."""
    return [r for r in runs if r.get("verdict") != "noop"]


def arms_of(runs):
    return sorted({r["arm"] for r in runs}, key=lambda a: ARM_ORDER.index(a) if a in ARM_ORDER else 9)


def sentence(run):
    """What the SQL verdict says of a trap row, in the words of the pitch ("mauvais tiers (sans SIREN)")."""
    v, note = run.get("verdict") or "", (run.get("note") or "").lower()
    if v == "success":
        return {"doublon": "bon tiers (celui avec SIREN)", "tva": "TVA 5,5 % appliquée"}.get(run.get("piege"), "facture conforme")
    parts = []
    if "without a siren" in note:
        parts.append("mauvais tiers (sans SIREN)")
    elif "supplier is" in note:
        parts.append("mauvais tiers (" + note.split("supplier is", 1)[1].split(";")[0].strip(" “”\"") + ")")
    if "vat rate is" in note:
        parts.append("mauvaise TVA (" + note.split("vat rate is", 1)[1].split(";")[0].strip().replace("%", " %") + ")")
    if "still a draft" in note:
        parts.append("restée en brouillon")
    if "total before tax" in note:
        parts.append("mauvais montant HT")
    if parts:
        return ", ".join(parts)
    return {"fail": "rien créé", "duplicate": "créée en double", "crash": "session plantée", "partial": "saisie incomplète",
            "noop": "déjà là, rien créé (hors compte)", "unverified": "non vérifié"}.get(v, v or "pas de run")


def traps(runs):
    """[{row, piege, arms: {arm: {verdict, run_id, sentence}}}], one per house-rule row (the last run per arm)."""
    out = {}
    for r in sorted(runs, key=lambda r: r.get("finished_at") or ""):
        if not r.get("piege"):
            continue
        t = out.setdefault(r["row"], {"row": r["row"], "piege": r["piege"], "arms": {}})
        t["arms"][r["arm"]] = {"verdict": r["verdict"], "run_id": r["id"], "sentence": sentence(r)}
    return [out[k] for k in sorted(out)]


def trap_lines(traps_, arms):
    """One sentence per trap row: « sans vidéo : mauvais tiers (sans SIREN) / tuto 2021 : idem / vidéo interne : bon tiers »."""
    out = []
    for t in traps_:
        bits, last = [], None
        for arm in arms:
            c = t["arms"].get(arm)
            if not c:
                continue
            bits.append(f"{ARM_FR.get(arm, arm)} : {'idem' if c['sentence'] == last else c['sentence']}")
            last = c["sentence"]
        out.append(f"- Ligne {t['row']} ({t['piege']}) : " + " / ".join(bits))
    return out


def trap_table(runs):
    """The house-rule rows first (modif.md §1.4): verdicts per arm, a sentence per row, the arm counts."""
    trapped = [r for r in counted(runs) if r.get("piege")]
    arms, traps_ = arms_of(trapped), traps(trapped)
    given = sorted({r["row"] for r in trapped if r.get("piege") == "tva" and "TVA" in (r.get("task") or "")})
    except_ = f", sauf ligne {', '.join(map(str, given))} (run plus ancien : sa consigne donnait encore le taux)" if given else ""
    out = ["# Lignes à règle de maison (pilote, indicatif)", "",
           f"Les lignes du CSV qui testent une règle dite dans la vidéo interne. La consigne ne donne pas la règle{except_}. "
           "Verdict SQL, pas la parole de l'agent.", ""]
    if not trapped:
        return out + ["Aucun run sur une ligne à règle de maison.", ""]
    out += ["| Ligne | règle | " + " | ".join(ARM_LABEL.get(a, a) for a in arms) + " |", "|---|---|" + "---|" * len(arms)]
    for t in traps_:
        cells = [(t["arms"].get(a) or {}).get("verdict", "") for a in arms]
        out.append(f"| {t['row']} | {t['piege']} — {RULES.get(t['piege'], '')} | " + " | ".join(cells) + " |")
    out += [""] + trap_lines(traps_, arms) + [""]
    out += arm_counts(trapped)[0]
    return out


def arm_counts(runs):
    """The counts per arm, over the counted runs (no `noop`). Returns (lines, stats)."""
    runs = counted(runs)
    arms = arms_of(runs)
    out = ["| Arm | n | Success | Partial | Failed | Avg steps | Avg duration | Avg cost (USD) | Skill loaded |",
           "|---|---|---|---|---|---|---|---|---|"]
    stats = {}
    for arm in arms:
        rs = [r for r in runs if r["arm"] == arm]
        v = Counter(r["verdict"] for r in rs)
        failed = v["fail"] + v["duplicate"] + v["crash"]
        loaded = sum(1 for r in rs if r.get("skill_loaded"))
        stats[arm] = {"n": len(rs), "success": v["success"], "partial": v["partial"], "failed": failed}
        out.append(f"| {ARM_LABEL.get(arm, arm)} | {len(rs)} | {v['success']} | {v['partial']} | {failed} | "
                   f"{avg([r.get('steps') for r in rs]):.0f} | {avg([r.get('duration_s') for r in rs]):.0f} s | "
                   f"{avg([r.get('total_cost_usd') for r in rs]):.2f} | {loaded}/{len(rs)} |")
    return out + [""], stats


def bench_table(runs):
    out = trap_table(runs)
    out += ["# Saisie générique", ""]
    lines, stats = arm_counts(runs)
    out += lines
    noops = [r for r in runs if r.get("verdict") == "noop"]
    if noops:
        out.append(f"- {len(noops)} run(s) left out of the counts (`noop`): the invoice already existed before the run and the agent, "
                   "told never to create a record twice, created nothing. The database confirms. They stay in the run list below.")
    old = next((a for a in OLD_ARMS if a in stats), None)
    if "none" in stats and old:
        out.append(f"- What the 2021 tutorial adds: {stats[old]['success']} successes with its skill against {stats['none']['success']} without, on {stats[old]['n']} and {stats['none']['n']} runs.")
    if "new-voice" in stats and old:
        out.append(f"- What going out of date costs: {stats['new-voice']['success']} successes with the recent video against {stats[old]['success']} with the 2021 tutorial.")
    if "old-images" in stats and old:
        out.append(f"- What the voice adds: {stats[old]['success']} successes with the narration against {stats['old-images']['success']} with images only.")
    wrong = [r for r in counted(runs) if contradicts(r)]
    out.append(f"- Self-assessment: {len(wrong)} run(s) where the agent's report contradicts the database "
               "(an invoice said created that this run did not add, or said validated that is still a draft).")
    out += ["", "## Runs", "", "| Run | Arm | Invoice | règle | Skill rev. | Verdict | Steps | Duration | Replay |", "|---|---|---|---|---|---|---|---|---|"]
    for r in sorted(runs, key=lambda r: (r["arm"], r["row"])):
        link = f"[replay]({r['share_url']})" if r.get("share_url") else ""
        rev = "" if r.get("skill_revision") is None else r["skill_revision"]
        out.append(f"| {r['id']} | {r['arm']} | {r['row']} | {r.get('piege') or ''} | {rev} | {r['verdict']}{(' — ' + r['note']) if r.get('note') else ''} | {r.get('steps') or ''} | {r.get('duration_s') or ''} s | {link} |")
    return "\n".join(out) + "\n"


def drift_report(runs, video_id):
    skill_runs = [r for r in runs if r["arm"] in OLD_ARMS]
    counter = Counter()
    for r in skill_runs:
        for d in set(d.strip() for d in r.get("drift") or [] if d.strip()):
            counter[d] += 1
    steps = []
    paths = sorted((ROOT / "work").glob(f"{video_id or '*'}/SKILL.*.md"), key=lambda p: "old-voice" not in p.name)
    for path in paths:
        m = re.search(r"## (?:Steps|Étapes)\s*\n(.*?)(?=\n## |\Z)", path.read_text(), re.S)  # the skill is rendered in the video's language
        if m:
            steps = re.findall(r"^\s*\d+[.)]\s+(.+)$", m.group(1), re.M)
            break
    out = ["# Drift: what changed since the tutorial", "",
           f"Differences reported by the agent in the 2021 tutorial arm, {len(skill_runs)} run(s), deduplicated, most frequent first.", ""]
    if not counter:
        out.append("No drift reported.")
    for text, n in counter.most_common():
        step = next((f"step {i + 1}" for i, s in enumerate(steps) if any(w in s.lower() for w in re.findall(r"[«“\"]([^»”\"]+)[»”\"]", text.lower()))), "")
        out.append(f"- {text} — seen in {n}/{len(skill_runs)} run(s){(', ' + step) if step else ''}")
    return "\n".join(out) + "\n"


def errors_report(runs):
    rows = {r["id"]: r for r in invoices()}
    out = ["# Errors", "", "| Arm | Invoice | Verdict | What happened | Agent said |", "|---|---|---|---|---|"]
    for r in sorted(runs, key=lambda r: (r["arm"], r["row"])):
        if r["verdict"] in ("success", "noop"):
            continue
        inv = rows.get(r["row"], {})
        ans = answer_of(r)
        out.append(f"| {r['arm']} | {r['row']} {inv.get('fournisseur', '')} | {r['verdict']} | {r.get('note') or r.get('error') or r.get('error_code') or ''} | {ans.get('notes', '')} |")
    return "\n".join(out) + "\n"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--video-id")
    a = p.parse_args()
    runs = load_runs(a.video_id)
    REPORT.mkdir(exist_ok=True)
    (REPORT / "bench.md").write_text(bench_table(runs))
    (REPORT / "bench_traps.json").write_text(json.dumps(traps([r for r in runs if r.get("piege")]), ensure_ascii=False, indent=2) + "\n")
    (REPORT / "drift.md").write_text(drift_report(runs, a.video_id))
    (REPORT / "errors.md").write_text(errors_report(runs))
    print(f"{len(runs)} runs -> report/bench.md, bench_traps.json, drift.md, errors.md")


if __name__ == "__main__":
    main()
