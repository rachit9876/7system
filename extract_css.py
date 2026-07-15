import sys

def extract_css(file_name, out_file):
    with open(file_name, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    start = -1
    end = -1
    for i, l in enumerate(lines):
        if '<style>' in l:
            start = i
        if '</style>' in l and start != -1 and i > start:
            end = i
            break
            
    if start != -1 and end != -1:
        css_content = lines[start+1:end]
        with open(out_file, 'w', encoding='utf-8') as f:
            f.writelines(css_content)
        
        # Replace in HTML
        new_lines = lines[:start] + [f'    <link rel="stylesheet" href="{out_file}">\n'] + lines[end+1:]
        with open(file_name, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f'Extracted {file_name} -> {out_file}')
    else:
        print(f'No <style> block found in {file_name}')

extract_css('mobile.html', 'css/mobile.css')
extract_css('portal.html', 'css/portal.css')
