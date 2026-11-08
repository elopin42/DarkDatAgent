U=http://127.0.0.1:5221
node .front/tools/voir.mjs $U/brand/preview.html --label ddagent-brand --etats 0 --dpr 2 || true
node .front/tools/film.mjs $U --routes "/board/?autoplay" --label ddagent-board-2 --hold 27000 --speed 300 || true
node .front/tools/voir.mjs "$U/board/" --label ddagent-board --etats 0 --mobile --query step=7 || true
node .front/tools/check.mjs $U --label ddagent-b3 --routes /board/,/pipeline/,/storyboard/,/skills/,/skills/old-voice/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/ --demo /board/ --steps 9 || true
