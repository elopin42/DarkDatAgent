"""[5b] English display copy -> work/<id>/translations.en.json, with the H Models API.

The site is in English, the tutorial and what the model wrote from it are in the video's language.
This step translates, once, the text the pages show: what the agent learned (steps, rules, checks,
gaps, fields), the agents' reports (notes, what changed since the video) and the house rules. The
result is a table {original: English}; the pages look each text up and fall back to the original.

Display only: SKILL.<variant>.md, the file the agent follows, keeps the screen labels of the video's
language, and is not touched. The voice of the video is not translated either: the pages quote it.

Only missing texts are sent, so a rerun after new runs costs only the new reports. A failed request
is reported and skipped: the page then shows the original text, and the next run retries it.

Usage: python scripts/56_translate.py <video_id> [--model holo4-27b] [--dry-run]
"""
import argparse
import json
import re
import threading
from concurrent.futures import ThreadPoolExecutor

from common import INDUCE_MODEL, REPORT, RUNS, h_chat, invoices, parse_json, read_json, work_dir, write_json

BATCH_CHARS = 3500   # per request: short answers come back faster and a bad one costs little
WORKERS = 3

PROMPT = """You translate the French text of a product demo website into English, for an international jury.
The text describes how to do a task in Dolibarr, an ERP whose screens are in French.
Rules:
- Natural, concise English, same meaning, nothing added.
- Only two things stay in French, copied letter for letter: text inside « » (write it inside “ ” instead), and button names written in CAPITALS.
- Translate everything else, including field names, menu names and ordinary words that are not inside « »: facture is invoice, fournisseur is supplier, tiers is third party, TVA is VAT, HT is before tax, TTC is including tax, brouillon is draft, règlement is payment, avoir is credit note.
- Keep company names, references, numbers, amounts, dates and codes unchanged. Write decimals with a point.
- A string already in English comes back unchanged.
You get a JSON object {"t": [strings]}. Answer with only a JSON object {"t": [translations]}: same number of strings, same order."""
LABEL = re.compile(r"«\s*(.+?)\s*»")


def texts(pid):
    """Every text the pages show that may need an English copy, without duplicates."""
    out = []
    for f in sorted(work_dir(pid).glob("understanding.*.json")):
        u = read_json(f) or {}
        out += [(u.get("task") or {}).get(k) for k in ("goal", "description")]
        out += [x.get("text") for x in u.get("preconditions") or []]
        for s in u.get("steps") or []:
            out += [s.get("action"), s.get("intent"), s.get("expect")]
        for m in u.get("field_mapping") or []:
            out += [m.get("input"), m.get("where"), m.get("note")]
        out += [r.get("rule") for r in u.get("exception_rules") or []]
        out += list(u.get("final_check") or []) + list(u.get("not_covered") or []) + list(u.get("drift_risks") or [])
        out += [x.get("why") for x in u.get("transcript_fixes") or []]
        out.append((u.get("confidence") or {}).get("why"))
    for f in sorted(RUNS.glob(f"{pid}-*.json")):
        r = read_json(f) or {}
        answer = r.get("answer") if isinstance(r.get("answer"), dict) else {}
        out += [answer.get("notes")] + list(r.get("drift") or [])
    out += [i.get("notes") for i in invoices()]  # the house rule of an invoice row, shown in the run form
    # The showcase pages read the house rules in report/bench.md and the agents' words in report/errors.md,
    # with the same patterns as soussol-v2/tools/app_data.py.
    for name, pattern, group in (("bench.md", r"\| (\d+) \| (\w+) . (.+?) \| (\w+) \|", 3),
                                 ("errors.md", r"\| old-voice \| (\d+) ([^|]+) \| (\w+) \| ([^|]*) \| ([^|]*) \|", 5)):
        path = REPORT / name
        if path.exists():
            out += [m.group(group) for m in map(re.compile(pattern).match, path.read_text(encoding="utf-8").splitlines()) if m]
    return list(dict.fromkeys(x.strip() for x in out if isinstance(x, str) and x.strip()))


def batches(items):
    batch, size = [], 0
    for x in items:
        if batch and size + len(x) > BATCH_CHARS:
            yield batch
            batch, size = [], 0
        batch.append(x)
        size += len(x)
    if batch:
        yield batch


def translate(batch, model):
    """English copies of one batch, or None when the answer does not fit (wrong count, no JSON).
    A copy that lost one of the screen labels of its original (text in « ») comes back as None: the model
    sometimes mangles accented words, and a label the reader cannot find on screen is worse than French."""
    text, model, _ = h_chat([{"role": "system", "content": PROMPT},
                             {"role": "user", "content": json.dumps({"t": batch}, ensure_ascii=False)}],
                            model=model, max_tokens=12000)
    got = (parse_json(text) or {}).get("t")
    if not (isinstance(got, list) and len(got) == len(batch)):
        return None
    return [x.strip() if isinstance(x, str) and x.strip() and all(l in x for l in LABEL.findall(src)) else None
            for src, x in zip(batch, got)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video_id")
    ap.add_argument("--model", default=INDUCE_MODEL)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    path = work_dir(args.video_id) / "translations.en.json"
    table = read_json(path) if path.exists() else {}
    todo = [x for x in texts(args.video_id) if x not in table]
    print(f"{len(table)} texts already in English, {len(todo)} to translate ({sum(map(len, todo))} characters)", flush=True)
    if args.dry_run or not todo:
        write_json(path, table)
        return

    lock, failed = threading.Lock(), []

    def attempt(batch):
        try:
            got = translate(batch, args.model)
        except Exception as e:  # noqa: BLE001  the page falls back to the original text
            print(f"batch of {len(batch)} not translated: {e}", flush=True)
            got = None
        if got is None and len(batch) > 1:  # miscounted or thought too long: halves are easier
            half = len(batch) // 2
            return attempt(batch[:half]) + attempt(batch[half:])
        if got and len(batch) > 1:  # a copy that lost a label gets one more try, alone
            got = [x if x else attempt([src])[0] for src, x in zip(batch, got)]
        return got or [None] * len(batch)

    def run(batch):
        got = attempt(batch)
        with lock:
            for src, dst in zip(batch, got):
                if dst:
                    table[src] = dst
                else:
                    failed.append(src)
            write_json(path, table)
            print(f"{len(table)} texts in English", flush=True)

    with ThreadPoolExecutor(WORKERS) as pool:
        list(pool.map(run, list(batches(todo))))
    print(f"wrote {path}" + (f", {len(failed)} left in the original language (rerun to retry)" if failed else ""), flush=True)


if __name__ == "__main__":
    main()
