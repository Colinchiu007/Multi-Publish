import re, os
base = 'D:/Data/projects/Multi-Publish'
f = base + '/apps/desktop/electron/ipc-handlers/offline.js'
c = open(f, encoding='utf-8').read()
c = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n.*?>>>>>>> [^\n]+\n', r'\1\n', c, flags=re.DOTALL)
open(f, 'w', encoding='utf-8').write(c)
print('OK offline.js')

f = base + '/apps/desktop/electron/preload.js'
c = open(f, encoding='utf-8').read()
c = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n.*?>>>>>>> [^\n]+\n', r'\1\n', c, flags=re.DOTALL)
open(f, 'w', encoding='utf-8').write(c)
print('OK preload.js')

f = base + '/CHANGELOG.md'
c = open(f, encoding='utf-8').read()
c = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n', r'\1\n\2', c, flags=re.DOTALL)
open(f, 'w', encoding='utf-8').write(c)
print('OK CHANGELOG.md')
