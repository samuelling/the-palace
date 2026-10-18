"""Wrap shell.html (the artifact page body) into index.html for GitHub Pages, for both versions."""
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}</style>\n')
open('index.html', 'w').write(head + open('shell.html').read() + '\n</html>\n')
# the 16-bit version shares the adaptive layer and the score with the 3D one
s16 = open('sixteen/shell.html').read().replace('src="ado.js"', 'src="../ado.js"').replace('src="audio.js"', 'src="../audio.js"')
open('sixteen/index.html', 'w').write(head + s16 + '\n</html>\n')
print('index.html and sixteen/index.html written')
