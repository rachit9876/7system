import sys
import os

with open('mobile.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, l in enumerate(lines):
    if '<script type="module">' in l:
        start = i
    if '</script>' in l and start != -1 and i > start:
        end = i
        break

print(f'Start: {start}, End: {end}')

if start != -1 and end != -1:
    js_content = lines[start+1:end]
    with open('js/mobile.js', 'w', encoding='utf-8') as f:
        f.writelines(js_content)
    
    # Replace in mobile.html
    new_lines = lines[:start] + ['    <script type="module" src="js/mobile.js"></script>\n'] + lines[end+1:]
    with open('mobile.html', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    
    print('Mobile extraction complete!')
else:
    print('Could not find script block.')
