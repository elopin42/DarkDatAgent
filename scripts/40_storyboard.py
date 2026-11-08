"""[4] transcript.json + frames.json -> work/<id>/storyboard.json.

Each sentence gets the last frame shown at or before its start (the screen the narrator
is talking about), or the first frame if the sentence starts before any frame.
Also writes storyboard.images.json, every frame without narration, for the images-only arm.

Usage: python scripts/40_storyboard.py <video_id>
"""
import argparse
import bisect

from common import read_json, work_dir, write_json

TOLERANCE = 0.5  # a frame that lands just after the start still counts as "at" the start


def main():
    p = argparse.ArgumentParser()
    p.add_argument("video_id")
    a = p.parse_args()

    work = work_dir(a.video_id)
    sentences = read_json(work / "transcript.json")
    frames = sorted(read_json(work / "frames.json"), key=lambda f: f["t"])
    if not frames:
        raise SystemExit("frames.json is empty: rerun 30_keyframes.py with a lower --threshold")
    times = [f["t"] for f in frames]

    board = []
    for s in sentences:
        i = max(bisect.bisect_right(times, s["start"] + TOLERANCE) - 1, 0)
        board.append({"t": s["start"], "end": s["end"], "sentence": s["sentence"], "frame": frames[i]["file"]})

    write_json(work / "storyboard.json", board)
    write_json(work / "storyboard.images.json", [{"t": f["t"], "frame": f["file"]} for f in frames])
    used = len({b["frame"] for b in board})
    print(f"{len(board)} sentences on {used} distinct frames, {len(frames)} frames in all")


if __name__ == "__main__":
    main()
