U=http://127.0.0.1:5221
node .front/tools/film.mjs $U --label v2-home-1 || true
node .front/tools/film.mjs $U --routes "/board/?autoplay" --label v2-board-1 --hold 27000 --speed 300 || true
node .front/tools/voir.mjs "$U/board/" --label v2-board --etats 0 --clic "[data-play]" --apres 5000 || true
node soussol-v2/tools/diag-f4.mjs $U /,/new/,/projects/JZMgB1UItkk/ || true
node .front/tools/check.mjs $U --label v2-final --routes /,/board/,/pipeline/,/storyboard/,/skills/,/skills/old-voice/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/ --demo /board/ --steps 9 --bursts ".problem__title,.row-boxes,.tool,.claim,.flow" || true
