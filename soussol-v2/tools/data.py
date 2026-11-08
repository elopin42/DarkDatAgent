# Construit src/data/tutorial.json depuis les vraies sorties : sous-titres de la vidéo, horodatage des images clés, banc.
import json, re, csv, sys
root = sys.argv[1]
subs = json.load(open(f"{root}/data/subs/JZMgB1UItkk.fr.json3"))
lines = []
for e in subs["events"]:
    t = "".join(s.get("utf8", "") for s in e.get("segs", [])).replace("\n", " ").strip()
    if t: lines.append({"t": round(e["tStartMs"] / 1000, 2), "s": t})
times = [float(x) for x in re.findall(r"pts_time:([0-9.]+)", open(f"{root}/work/JZMgB1UItkk/showinfo.log").read())]
runs = list(csv.DictReader(open(f"{root}/report/bench.csv")))
keep = ["run_id","arm","row_id","piege","skill_revision","started_at","duration_s","verdict","steps","total_cost_usd","db_rows_before","db_rows_after","answer_created","share_url"]
runs = [{k: r[k] for k in keep} for r in runs]
out = {"video": {"id": "JZMgB1UItkk", "duration": 420, "frames": len(times)}, "frameTimes": times, "voice": lines, "runs": runs}
json.dump(out, open(f"{root}/soussol/src/data/tutorial.json", "w"), ensure_ascii=False)
print(len(lines), len(times), len(runs))
