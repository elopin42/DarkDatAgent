U=http://127.0.0.1:5221
node .front/tools/film.mjs $U --label v2-home-2 || true
node .front/tools/check.mjs $U --label v2-final2 --routes /,/drift/ --bursts ".problem__title,.row-boxes,.tool,.claim,.flow" || true
