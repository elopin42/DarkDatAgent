"""[9] The bench: 70_run_one + 80_verify over n invoices x arms -> report/bench.csv (docs/BENCH.md).

Same invoices (rows 1 to n), same order, in every arm. Sessions are sequential: one Chrome.

Arms:
  none        the agent without skill, the task sentence only
  old-voice   the skill induced from the 2021 tutorial, images and narration
  old-images  the skill induced from the 2021 tutorial, images only (needs
              50_induce.py <id> --images-only and 60_register.py <id> --variant old-images)
  new-voice   the skill induced from a recent recording of the same task, a second video
              added with "recent recording" ticked (--recent <its id>)
  old-voice-repaired
              the 2021 tutorial's skill at its latest revision, after 75_repair.py (--repair adds it)
  skill       whatever agent.json of <video_id> points to (older runs)
--traps: only the rows whose `piege` is set among 1..n (3, 4, 8 with n=8): the house-rule bench.
--repair: after each old-voice (or old-voice-repaired) run that reports drift, 75_repair.py
repairs the skill and registers a new revision; the arm old-voice stays pinned to revision 1,
old-voice-repaired follows the latest one (skill_revision goes up, drift_count down).
Resumable: a (arm, row) already in bench.csv with a verdict is skipped. Before each run, an
invoice left by a previous attempt with the same supplier reference is deleted in SQL, so
the verdict measures this run only.

--import: no session; the verified runs of work/runs/ started outside the bench (project page,
make agent-run) are added to bench.csv, so the site shows them instead of its sample data.

Usage: python scripts/90_bench.py <video_id> [--arms none,old-voice,new-voice] [--recent <video_id>]
       [--n 8] [--rows 1,3,4 | --traps] [--repair] [--fresh]
       python scripts/90_bench.py <video_id> --import
"""
import argparse
import csv
import json
import subprocess
import sys

from common import REPORT, ROOT, RUNS, invoice, invoices, skill_revision_of

sys.path.insert(0, str(ROOT / "scripts"))
verify_mod = __import__("80_verify")

FIELDS = ["run_id", "arm", "row_id", "piege", "skill_revision", "started_at", "finished_at", "duration_s", "status", "error_code", "outcome",
          "steps", "total_cost_usd", "skill_loaded", "verdict", "db_rows_before", "db_rows_after",
          "answer_created", "answer_validated", "answer_total_ttc", "sql_total_ht", "sql_status", "drift_count", "share_url", "note"]


def read_csv(path):
    if not path.exists():
        return []
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def line(run):
    ans = run.get("answer") if isinstance(run.get("answer"), dict) else {}  # the agent may answer plain text
    sql = (run.get("sql") or [{}])[0]
    sql = sql if isinstance(sql, dict) else {}
    return {
        "run_id": run["id"], "arm": run.get("bench_arm") or run["arm"], "row_id": run.get("row"),
        "piege": run.get("piege") or "", "skill_revision": "" if run.get("skill_revision") is None else run["skill_revision"],
        "started_at": run.get("started_at"),
        "finished_at": run.get("finished_at"), "duration_s": run.get("duration_s"), "status": run.get("status"),
        "error_code": run.get("error_code") or "", "outcome": run.get("outcome") or "", "steps": run.get("steps"),
        "total_cost_usd": run.get("total_cost_usd"), "skill_loaded": run.get("skill_loaded"), "verdict": run.get("verdict"),
        "db_rows_before": run.get("db_rows_before"), "db_rows_after": run.get("db_rows_after"),
        "answer_created": ans.get("created"), "answer_validated": ans.get("validated"), "answer_total_ttc": ans.get("total_ttc"),
        "sql_total_ht": sql.get("total_ht"), "sql_status": sql.get("fk_statut"), "drift_count": len(run.get("drift") or []),
        "share_url": run.get("share_url") or "", "note": run.get("note") or "",
    }


def clean_invoice(ref_supplier):
    """Delete an invoice left by a previous attempt (sandbox: SQL is the only way for validated ones)."""
    if not verify_mod.db_available():
        return
    db = verify_mod.connect()
    cur = db.cursor()
    cur.execute("SELECT rowid FROM llx_facture_fourn WHERE ref_supplier = %s", (ref_supplier,))
    ids = [r[0] for r in cur.fetchall()]
    for rid in ids:
        cur.execute("DELETE FROM llx_facture_fourn_det WHERE fk_facture_fourn = %s", (rid,))
        cur.execute("DELETE FROM llx_facture_fourn WHERE rowid = %s", (rid,))
    db.commit()
    db.close()
    if ids:
        print(f"  removed {len(ids)} previous invoice(s) {ref_supplier}")


def recent_video(explicit):
    """The video of the new-voice arm: --recent, or the project marked as a recent recording."""
    if explicit:
        return explicit
    for path in sorted((ROOT / "work").glob("*/project.json")):
        if json.loads(path.read_text()).get("variant") == "new-voice":
            return path.parent.name
    return None


def base_revision(video_id, variant):
    """The first agent revision registered for a variant (60_register.py writes `base_revision`); 1 for
    an agent.<variant>.json older than that field."""
    path = ROOT / "work" / video_id / f"agent.{variant}.json"
    reg = json.loads(path.read_text()) if path.exists() else {}
    return str(reg.get("base_revision") or 1)


def run_command(arm, video_id, recent, row_id, run_id):
    """70_run_one.py arguments for an arm."""
    base = [sys.executable, str(ROOT / "scripts/70_run_one.py")]
    tail = ["--row", str(row_id), "--run-id", run_id]
    if arm == "none":
        return base + [video_id, "--arm", "none"] + tail
    if arm == "skill":
        return base + [video_id, "--arm", "skill"] + tail
    if arm == "old-voice":  # the measured arm stays pinned to its first revision, whatever 75_repair.py registered since
        return base + [video_id, "--arm", "skill", "--variant", arm, "--revision", base_revision(video_id, arm)] + tail
    if arm == "old-voice-repaired":
        return base + [video_id, "--arm", "skill", "--variant", "old-voice", "--revision", "latest"] + tail
    if arm == "old-images":
        return base + [video_id, "--arm", "skill", "--variant", arm] + tail
    if arm == "new-voice":
        if not recent:
            raise SystemExit("arm new-voice: add the recent video (tick “recent recording”) or pass --recent <video_id>")
        return base + [recent, "--arm", "skill", "--variant", "new-voice"] + tail
    raise SystemExit(f"unknown arm {arm}")


VARIANT_ARM = {"voice": "old-voice", "images": "old-images"}  # older variant names


def bench_arm_of(run):
    """The bench arm of a run started outside the bench (the project page, make agent-run)."""
    if run.get("bench_arm"):
        return run["bench_arm"]
    if run.get("arm") == "none":
        return "none"
    v = run.get("variant") or "old-voice"
    return VARIANT_ARM.get(v, v)


def import_runs(video_id, csv_path):
    """Every verified run of work/runs/ for this video, into bench.csv: the site reads bench.csv
    and shows sample data as long as it is missing. Runs started from the project page are not
    pinned to a revision and were not cleaned before: they are imported as they are, with their
    `skill_revision` read from the session. Runs without a verdict (never finished) are skipped."""
    done = {r["run_id"]: r for r in read_csv(csv_path)}
    added = 0
    for path in sorted(RUNS.glob(f"{video_id}-*.json")):
        run = json.loads(path.read_text())
        if run.get("project") != video_id or run.get("row") is None or not run.get("verdict") or run["id"] in done:
            continue
        run["bench_arm"] = bench_arm_of(run)
        run.setdefault("piege", invoice(run["row"]).get("piege") or "")
        run["skill_revision"] = None if run["bench_arm"] == "none" else skill_revision_of(run)
        path.write_text(json.dumps(run, ensure_ascii=False, indent=2, default=str) + "\n")
        done[run["id"]] = line(run)
        added += 1
    write_csv(csv_path, sorted(done.values(), key=lambda l: (l.get("started_at") or "")))
    print(f"imported {added} run(s) into {csv_path.relative_to(ROOT)}: {len(done)} in all")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--import", dest="import_", action="store_true",
                   help="only add the verified runs of work/runs/ (project page, make agent-run) to bench.csv, no new session")
    p.add_argument("--arms", default="none,old-voice")
    p.add_argument("--recent", help="video id of the recent recording, for the new-voice arm")
    p.add_argument("--n", type=int, default=8)
    p.add_argument("--rows", help="explicit rows, e.g. 1,3,4 (default 1..n)")
    p.add_argument("--traps", action="store_true", help="only the rows with a house rule (`piege`) among 1..n")
    p.add_argument("--repair", action="store_true", help="75_repair.py after each old-voice run with drift; adds the arm old-voice-repaired")
    p.add_argument("--fresh", action="store_true", help="redo runs already in bench.csv")
    a = p.parse_args()

    if a.import_:
        return import_runs(a.video_id, REPORT / "bench.csv")
    if a.traps and a.rows:
        sys.exit("--traps and --rows are exclusive")
    if a.traps:
        rows = [r["id"] for r in invoices() if r["id"] <= a.n and r.get("piege")]
        print(f"house-rule rows among 1..{a.n}: {rows}")
    else:
        rows = [int(x) for x in a.rows.split(",")] if a.rows else list(range(1, a.n + 1))
    arms = [x.strip() for x in a.arms.split(",") if x.strip()]
    if a.repair and "old-voice-repaired" not in arms:
        arms.insert(arms.index("old-voice") + 1 if "old-voice" in arms else len(arms), "old-voice-repaired")
    recent = recent_video(a.recent) if "new-voice" in arms else None
    if "new-voice" in arms and not recent:
        sys.exit("arm new-voice: add the recent video on /new/ (tick “recent recording”) or pass --recent <video_id>; "
                 "or run without it: --arms none,old-voice")
    csv_path = REPORT / "bench.csv"
    existing = read_csv(csv_path)
    # Only the bench's own runs (deterministic ids) count as "done"; imported ones stay in the file.
    done = {(r["arm"], str(r["row_id"])): r for r in existing if r.get("verdict") and r["run_id"] == f"{a.video_id}-{r['arm']}-{int(r['row_id']):02d}"}
    lines = [] if a.fresh else list(existing)

    for arm in arms:
        for row_id in rows:
            if not a.fresh and (arm, str(row_id)) in done:
                print(f"{arm} row {row_id}: already done ({done[(arm, str(row_id))]['verdict']})")
                continue
            row = invoice(row_id)
            print(f"{arm} row {row_id}: {row['fournisseur']} {row['ref_fournisseur']}", flush=True)
            clean_invoice(row["ref_fournisseur"])
            run_id = f"{a.video_id}-{arm}-{row_id:02d}"
            proc = subprocess.run(run_command(arm, a.video_id, recent, row_id, run_id), cwd=ROOT)
            path = RUNS / f"{run_id}.json"
            if not path.exists():
                print(f"  no run file (exit {proc.returncode}), skipping")
                continue
            run = json.loads(path.read_text())
            run["bench_arm"] = arm  # 70_run_one only knows skill/none; the bench arm says which skill
            run.setdefault("piege", row.get("piege") or "")
            run["skill_revision"] = None if arm == "none" else skill_revision_of(run)
            if "verdict" not in run:
                run = verify_mod.verify(run)
            path.write_text(json.dumps(run, ensure_ascii=False, indent=2, default=str) + "\n")
            lines = [l for l in lines if l["run_id"] != run_id] + [line(run)]
            write_csv(csv_path, lines)
            print(f"  {run.get('verdict')} {run.get('note') or ''}")
            if a.repair and arm in ("old-voice", "old-voice-repaired") and run.get("drift"):
                print(f"  {len(run['drift'])} drift(s): repairing the skill before the next row", flush=True)
                subprocess.run([sys.executable, str(ROOT / "scripts/75_repair.py"), a.video_id, "--variant", "old-voice",
                                "--from-runs", run_id], cwd=ROOT)
    print(f"wrote {csv_path.relative_to(ROOT)}: {len(lines)} runs")


if __name__ == "__main__":
    main()
