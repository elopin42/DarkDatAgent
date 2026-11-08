U=http://127.0.0.1:5221
node soussol-v2/tools/review.mjs $U v2r2-after2 || true
node .front/tools/check.mjs $U --label v2r2-check2 --routes /,/storyboard/,/drift/ --bursts ".problem__title,.tl,.claim" || true
