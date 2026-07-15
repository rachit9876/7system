import sys

with open('js/editor.js', 'r', encoding='utf-8') as f:
    content = f.read()

paste_logic = """
        window.addEventListener('paste', async (e) => {
            if (document.activeElement.tagName === 'TEXTAREA' || document.activeElement.tagName === 'INPUT') {
                return;
            }
            
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text');
            if (!text || (!text.trim().startsWith('- ') && !text.trim().startsWith('* '))) {
                return;
            }
            
            const mouseX = (window.lastMouseX || dom.canvas.width / 2) - state.pan.x;
            const mouseY = (window.lastMouseY || dom.canvas.height / 2) - state.pan.y;
            
            const result = markdownToNodes(text, mouseX, mouseY);
            if (result.nodes.length > 0) {
                state.nodes = state.nodes.concat(result.nodes);
                state.nextNodeId = result.nextId;
                saveState();
                drawGrid();
                showNotification(`Pasted ${result.nodes.length} nodes from clipboard!`, 'success');
            }
        });
        
        dom.canvas.addEventListener('mousemove', (e) => {
            window.lastMouseX = (e.clientX - state.pan.x) / state.zoom;
            window.lastMouseY = (e.clientY - state.pan.y) / state.zoom;
        });
"""

# Append to end of file, just before the final `});`
lines = content.split('\n')
# find the last `});`
for i in range(len(lines)-1, -1, -1):
    if '});' in lines[i]:
        lines.insert(i, paste_logic)
        break

with open('js/editor.js', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))
