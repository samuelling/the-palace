"""Wrap shell.html (the artifact page body) into index.html for GitHub Pages."""
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
        '<style>*,*::before,*::after{box-sizing:border-box}[hidden]{display:none!important}</style>\n')
open('index.html', 'w').write(head + open('shell.html').read() + '\n</html>\n')
print('index.html written')
