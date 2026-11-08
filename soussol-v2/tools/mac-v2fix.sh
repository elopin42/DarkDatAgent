U=http://127.0.0.1:5221
node .front/tools/voir.mjs $U/ --label v2fix-home --etats 0 --largeur 768 --hauteur 1024 || true
node .front/tools/voir.mjs $U/ --label v2fix-home375 --etats 0,0.15 --largeur 375 --hauteur 812 --plein || true
node .front/tools/voir.mjs $U/board/ --label v2fix-board --etats 0 --mobile || true
node .front/tools/voir.mjs $U/bench/ --label v2fix-bench --etats 0,0.6 --largeur 375 --hauteur 812 --plein || true
node .front/tools/voir.mjs $U/ --label v2fix-home-end --etats 0.86,0.93 || true
node .front/tools/film.mjs $U --label v2-home-3 || true
node .front/tools/film.mjs $U --routes "/board/?autoplay" --label v2-board-2 --hold 27000 --speed 300 || true
node .front/tools/check.mjs $U --label v2-fix --routes /,/board/,/pipeline/,/storyboard/,/skills/,/skills/old-voice/,/bench/,/runs/JZMgB1UItkk-skill-27-1107-164022/,/drift/,/start/,/welcome/,/setup/,/new/,/projects/JZMgB1UItkk/ --demo /board/ --steps 9 --bursts ".problem__title,.row-boxes,.tool,.rack,.trap,.claim,.flow" || true
