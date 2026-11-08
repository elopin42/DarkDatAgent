#!/usr/bin/env bash
# [1] Videos -> data/videos/<id>.mp4 (720p max). Without arguments, the four videos of docs/SETUP.md.
# Usage: scripts/10_download.sh [id ...]
set -euo pipefail
cd "$(dirname "$0")/.."

ids=("$@")
[ ${#ids[@]} -eq 0 ] && ids=(JZMgB1UItkk U0W0qySjzvY 4Xw-GpRWKMs MFaXoooysEo)

YTDLP=yt-dlp
[ -x .venv/bin/yt-dlp ] && YTDLP=.venv/bin/yt-dlp

mkdir -p data/videos
for id in "${ids[@]}"; do
  if [ -s "data/videos/$id.mp4" ]; then
    echo "data/videos/$id.mp4 already there"
    continue
  fi
  "$YTDLP" -f "bv*[height<=720]+ba/b[height<=720]" --merge-output-format mp4 \
    -o "data/videos/%(id)s.%(ext)s" -- "$id"
done
