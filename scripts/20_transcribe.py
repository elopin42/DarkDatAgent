"""[2] Video -> work/<id>/transcript.json, timestamped sentences from Gladia solaria-3.

The raw Gladia answer is kept in work/<id>/gladia.json so a rerun does not pay again;
--fresh asks Gladia anew.

Usage: python scripts/20_transcribe.py <video_id> [--lang fr] [--fresh]
"""
import argparse
import time

from common import need_env, project, read_json, video_path, vocabulary, work_dir, write_json


GLADIA = "https://api.gladia.io"


def _call(method, url, key, *, json_body=None, files=None, timeout=120):
    """One HTTP call to Gladia with the key in the header; returns the decoded JSON."""
    import requests

    r = requests.request(method, url, headers={"x-gladia-key": key}, json=json_body, files=files, timeout=timeout)
    if r.status_code >= 400:
        raise RuntimeError(f"HTTP {r.status_code} on {url}: {r.text[:300]}")
    return r.json()


def ask_gladia(path, lang, words=()):
    """Upload the file, create the job, poll until done. Plain HTTP: the SDK's strict
    response parsing breaks on fields it does not know (KeyError 'success')."""
    key = need_env("GLADIA_API_KEY")
    with open(path, "rb") as f:
        upload = _call("POST", f"{GLADIA}/v2/upload", key, files={"audio": (path.name, f, "video/mp4")}, timeout=600)
    job = _call("POST", f"{GLADIA}/v2/pre-recorded", key, json_body={
        "audio_url": upload["audio_url"],
        "model": "solaria-3",
        "language_config": {"languages": [lang]},  # one language only with solaria-3
        "sentences": True,
        **({"custom_vocabulary": True, "custom_vocabulary_config": {"vocabulary": list(words), "default_intensity": 0.4}}
           if words else {}),
    })
    result_url = job.get("result_url") or f"{GLADIA}/v2/pre-recorded/{job['id']}"
    print(f"Gladia job {job['id']}, waiting", flush=True)
    deadline = time.time() + 1800
    while time.time() < deadline:
        raw = _call("GET", result_url, key)
        if raw.get("status") == "done":
            return raw
        if raw.get("status") == "error":
            raise RuntimeError(f"job {job['id']} failed: {raw.get('error_code')}")
        time.sleep(3)
    raise RuntimeError(f"job {job['id']} still not done after 30 min")


def sentences(raw):
    results = ((raw.get("result") or {}).get("sentences") or {}).get("results") or []
    out = []
    for s in results:
        text = (s.get("sentence") or "").strip()
        if text:
            out.append({
                "sentence": text,
                "start": round(s["start"], 2),
                "end": round(s["end"], 2),
                "confidence": round(s.get("confidence", 0), 3),
            })
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--lang", default="fr", help="fr for the French tutorials, en for U0W0qySjzvY")
    p.add_argument("--fresh", action="store_true", help="ignore work/<id>/gladia.json and ask Gladia again")
    a = p.parse_args()

    work = work_dir(a.video_id)
    raw_path = work / "gladia.json"
    if raw_path.exists() and not a.fresh:
        print(f"reusing {raw_path.name} (--fresh to ask Gladia again)")
        raw = read_json(raw_path)
    else:
        try:
            raw = ask_gladia(video_path(a.video_id), a.lang, vocabulary(project(a.video_id)))
        except Exception as e:  # the SDK raises its own HttpError; any failure stops here
            hint = " Your Gladia key was refused: reconnect it on the site, page /keys/." if " 401 " in f" {e} " or "403" in str(e) else ""
            raise SystemExit(f"Gladia failed: {e}.{hint}")
        write_json(raw_path, raw)

    out = sentences(raw)
    if not out:
        raise SystemExit(f"no sentences in {raw_path.name}: check that the job finished and sentences=True")
    write_json(work / "transcript.json", out)
    print(f"{len(out)} sentences, {out[0]['start']:.0f}s to {out[-1]['end']:.0f}s")


if __name__ == "__main__":
    main()
