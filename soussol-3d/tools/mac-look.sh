set -e
U=http://127.0.0.1:5211
node .front/tools/voir.mjs $U/brand/preview.html --label ddagent-brand --etats 0 --dpr 2 || true
node .front/tools/voir.mjs $U/ --label ddagent-home --etats 0,0.5 --mobile || true
node .front/tools/voir.mjs $U/board/ --label ddagent-board --etats 0 --clic "[data-play]" --apres 9000 || true
node .front/tools/voir.mjs "$U/board/" --label ddagent-board-final --query final=1 --etats 0,0.4 --mobile || true
for p in pipeline storyboard bench drift skills runs/JZMgB1UItkk-skill-27-1107-164022 setup projects/JZMgB1UItkk; do node .front/tools/voir.mjs $U/$p/ --label ddagent-$(echo $p | tr '/' '-' | cut -c1-30) --etats 0,0.5 || true; done
