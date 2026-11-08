U=http://127.0.0.1:5221
node .front/tools/voir.mjs $U/brand/preview.html --label ddagent-brand --etats 0 --dpr 2 || true
node .front/tools/voir.mjs "$U/board/" --label ddagent-board --etats 0 --query step=7 --mobile || true
node .front/tools/film.mjs $U --label ddagent-home-1 || true
node .front/tools/check.mjs $U --label ddagent-final --routes /,/board/,/pipeline/,/storyboard/,/skills/,/skills/old-voice/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/ --demo /board/ --steps 9 --bursts ".hero__verdict,.problem__title,.chain__catch" || true
