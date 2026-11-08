U=http://127.0.0.1:5221
node soussol-v2/tools/diag-f4.mjs $U /,/board/,/bench/ || true
node .front/tools/voir.mjs $U/ --label v2-home --etats 0.12,0.22,0.36,0.46 || true
node .front/tools/voir.mjs "$U/board/" --label v2-board --etats 0 --clic "[data-play]" --apres 7000 || true
node .front/tools/voir.mjs "$U/board/" --label v2-board-final --query final=1 --etats 0 --mobile || true
node .front/tools/voir.mjs $U/pipeline/ --label v2-pipeline --etats 0 || true
node .front/tools/check.mjs $U --label v2-check2 --routes /,/board/,/pipeline/,/storyboard/,/skills/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/ --demo /board/ --steps 9 --bursts ".problem__title,.row-boxes,.tool,.claim,.flow" || true
