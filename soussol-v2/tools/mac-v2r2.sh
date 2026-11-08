U=http://127.0.0.1:5221
node soussol-v2/tools/review.mjs $U v2r2-after || true
node .front/tools/film.mjs $U --label v2-home-4 || true
node .front/tools/film.mjs $U --routes "/board/?autoplay" --label v2-board-3 --hold 27000 --speed 300 || true
node .front/tools/check.mjs $U --label v2r2-check --routes /,/board/,/pipeline/,/storyboard/,/skills/,/skills/old-voice/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/ --demo /board/ --steps 9 --bursts ".problem__title,.row-boxes,.tool,.rack,.tl,.claim" || true
