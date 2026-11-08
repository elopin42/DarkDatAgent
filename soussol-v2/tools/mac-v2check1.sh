U=http://127.0.0.1:5221
node .front/tools/voir.mjs $U/ --label v2-home --etats 0.12,0.2,0.33,0.5 --mobile || true
node .front/tools/check.mjs $U --label v2-check1 --routes /,/board/,/bench/,/pipeline/,/storyboard/ --demo /board/ --steps 9 --bursts ".problem__title,.chain__catch,.tool,.claim,.flow" || true
