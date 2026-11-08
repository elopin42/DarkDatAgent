"""[3] Video -> work/<id>/frames/*.jpg + frames.json, with ffmpeg.

A frame is kept on a screen change (scene > threshold, at least --gap s after the last
kept frame, so a transition does not give a burst of near-identical images), or when
--every s have passed since the last kept frame (safety net). Frames are scaled to
1280 px wide max for the models. Aim for 40 to 120 frames for 7 min.

Each frame keeps its scene score (how much the picture changed, 0 to 1) and the reason it
was kept: "scene" for a screen change, "tick" for the periodic safety frame. Step 5 uses
the score to choose which frames to send when there are more than the model takes, and
tells the model which frames are real screen changes.

The threshold is 0.08, not the 0.25 of ARCHITECTURE.md: on the 2021 screencast an opening
menu changes few pixels, and 0.25 caught only 2 screen changes in 7 min.

Usage: python scripts/30_keyframes.py <video_id> [--threshold 0.08] [--gap 1] [--every 5]
"""
import argparse
import re
import subprocess

from common import video_path, work_dir, write_json


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    p.add_argument("--threshold", type=float, default=0.08)
    p.add_argument("--gap", type=float, default=1.0, help="min seconds between two screen-change frames")
    p.add_argument("--every", type=float, default=5.0, help="max seconds between two frames")
    a = p.parse_args()

    src = video_path(a.video_id)
    work = work_dir(a.video_id)
    frames = work / "frames"
    frames.mkdir(exist_ok=True)
    for old in frames.glob("*.jpg"):
        old.unlink()

    gap = "t-prev_selected_t"
    scene_log = work / "scene.log"
    select = (f"select='isnan(prev_selected_t)+gte({gap}\\,{a.every})"
              f"+gt(scene\\,{a.threshold})*gte({gap}\\,{a.gap})',"
              f"metadata=print:key=lavfi.scene_score:file={scene_log},"
              f"scale='min(1280\\,iw)':-2,showinfo")
    proc = subprocess.run(
        ["ffmpeg", "-hide_banner", "-loglevel", "info", "-y", "-i", str(src),
         "-vf", select, "-fps_mode", "vfr", "-q:v", "3", str(frames / "%04d.jpg")],
        capture_output=True, text=True,
    )
    (work / "showinfo.log").write_text(proc.stderr)
    if proc.returncode != 0:
        raise SystemExit(f"ffmpeg failed, see work/{a.video_id}/showinfo.log")

    times = [float(t) for t in re.findall(r"Parsed_showinfo.*?pts_time:\s*([0-9.]+)", proc.stderr)]
    scores = [float(s) for s in re.findall(r"lavfi\.scene_score=([0-9.]+)", scene_log.read_text())] if scene_log.exists() else []
    files = sorted(f.name for f in frames.glob("*.jpg"))
    if len(times) != len(files):
        raise SystemExit(f"{len(files)} images but {len(times)} timestamps in showinfo.log")
    if len(scores) != len(files):
        scores = [0.0] * len(files)  # ffmpeg without the metadata filter: no scores, every frame a tick

    out = [{"file": f, "t": round(t, 2), "score": round(s, 4), "reason": "scene" if s > a.threshold else "tick"}
           for f, t, s in zip(files, times, scores)]
    write_json(work / "frames.json", out)
    changes = sum(1 for f in out if f["reason"] == "scene")
    print(f"{len(files)} frames, {changes} on a screen change (aim: 40 to 120 for 7 min)")


if __name__ == "__main__":
    main()
