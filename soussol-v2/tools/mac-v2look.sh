U=http://127.0.0.1:5221
node .front/tools/voir.mjs $U/ --label v2-home --etats 0,1000px,0.3,0.45,0.6,0.75,0.9 || true
node .front/tools/voir.mjs "$U/board/" --label v2-board --etats 0 --query step=5 || true
node .front/tools/voir.mjs "$U/board/" --label v2-board7 --etats 0 --query step=7 || true
node .front/tools/voir.mjs "$U/board/" --label v2-board8 --etats 0 --query step=8 --mobile || true
node .front/tools/voir.mjs $U/bench/ --label v2-bench --etats 0 || true
