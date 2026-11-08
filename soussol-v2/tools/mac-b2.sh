U=http://127.0.0.1:5221
node .front/tools/voir.mjs $U/brand/preview.html --label ddagent-brand --etats 0 --dpr 2 || true
node .front/tools/voir.mjs "$U/board/" --label ddagent-board --etats 0 --clic "[data-play]" --apres 16000 || true
node .front/tools/check.mjs $U --label ddagent-b2b --routes /board/ --demo /board/ --steps 9 --bursts ".board,.desk" || true
node .front/tools/film.mjs $U --routes "/board/?autoplay" --label ddagent-board-1 --hold 27000 --speed 300 || true
